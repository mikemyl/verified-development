'use strict';

/**
 * hooks/lib/waves.js
 *
 * Deterministic wave computation for an implementation plan. The LLM authors
 * tasks with declared dependencies and a file surface; this script does ALL
 * the graph math (topological layering + file-collision detection) and emits a
 * versioned JSON contract. Skills render from the JSON — they never hand-author
 * waves. This removes a whole class of LLM arithmetic errors and makes the
 * parallel schedule auditable and unit-testable with zero model calls.
 *
 * Task grammar parsed from plan.md (one task per line):
 *   - [ ] T001 [P] <title> (files: `a.go`, `b.go`) (test: unit)
 *   - [ ] T004 Implement X (files: `a.go`) (depends on T003) (test: dao) (scenario: S1)
 *   - [ ] T010 Wire up (files: `c.go`) (depends on T001-T003, T007) (scenario: S2, S3)
 *
 *   • id       — `T` followed by digits, right after the checkbox.
 *   • deps     — `(depends on ...)` or `(deps: ...)`; comma/space list of ids
 *                and inclusive ranges (`T001-T003`); `none` or absent ⇒ no deps.
 *   • files    — `(files: ...)`; comma list, backticks/whitespace stripped.
 *                Absent ⇒ undeclared surface (cannot prove independence).
 *   • test     — `(test: ...)`; the task's sanctioned test type. Human hint
 *                consumed by test-gate.js; the wave math ignores it.
 *   • scenario — `(scenario: ...)`; comma/space list of acceptance-scenario ids
 *                this task serves. Human hint consumed by test-gate.js; the
 *                wave math ignores it.
 *   • The `[P]` marker is a human hint only — this script is authoritative.
 *
 * Output contract `plan-waves/v1`:
 *   {
 *     schema: "plan-waves/v1",
 *     waves: [["T001","T002"],["T003"]],   // each inner array runs concurrently
 *     tasks: { T001: { title, depends_on, files, files_undeclared, test_type, scenarios, status, wave } },
 *     collisions: [{ wave, tasks:["T002","T003"], file }],  // same-wave file overlap
 *     undeclared: ["T005"],                 // tasks in a parallel wave with no files
 *     parallel: true                        // any wave has >= 2 tasks
 *   }
 *
 * Usage from a skill (the LLM invokes node):
 *   node ${CLAUDE_PLUGIN_ROOT}/hooks/lib/waves.js compute <plan.md>   (or - for stdin)
 *
 * Library usage:
 *   const { analyze } = require('./waves.js');
 *   const contract = analyze(planText);   // throws AnalysisError on a bad plan
 *
 * Exit codes (CLI): 0 ok · 1 usage error · 2 malformed plan (cycle, unknown dep…).
 */

const fs = require('fs');

const SCHEMA = 'plan-waves/v1';

// `- [ ] T001 [P] rest…` — captures status char, id, and the trailing text.
const TASK_RE = /^\s*[-*]\s*\[([ xX!~])\]\s*(T\d+)\b(.*)$/;
const DEPS_RE = /\((?:depends on|deps:)\s*([^)]*)\)/i;
const FILES_RE = /\(files:\s*([^)]*)\)/i;
const TEST_RE = /\(test:\s*([^)]*)\)/i;
const SCENARIO_RE = /\(scenario:\s*([^)]*)\)/i;
const RANGE_RE = /T(\d+)\s*-\s*T(\d+)/gi;
const ID_RE = /T\d+/gi;

class AnalysisError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AnalysisError';
  }
}

function numericId(id) {
  return parseInt(id.slice(1), 10);
}

// Stable, human-friendly ordering: T2 before T10 (numeric, not lexical).
function byNumber(a, b) {
  return numericId(a) - numericId(b);
}

function expandDeps(inner) {
  const text = inner.trim();
  if (!text || /^none$/i.test(text)) return [];
  const ids = new Set();
  let remainder = text;

  // Ranges first (T001-T003 inclusive), preserving zero-pad width.
  remainder = remainder.replace(RANGE_RE, (_m, a, b) => {
    const width = Math.max(a.length, b.length);
    const lo = parseInt(a, 10);
    const hi = parseInt(b, 10);
    const [from, to] = lo <= hi ? [lo, hi] : [hi, lo];
    for (let n = from; n <= to; n++) ids.add('T' + String(n).padStart(width, '0'));
    return ' ';
  });

  // Then standalone ids.
  for (const m of remainder.matchAll(ID_RE)) ids.add(m[0]);
  return [...ids];
}

function parseFiles(inner) {
  return inner
    .split(',')
    .map(s => s.replace(/`/g, '').trim())
    .filter(Boolean);
}

function stripClauses(rest) {
  return rest
    .replace(DEPS_RE, '')
    .replace(FILES_RE, '')
    .replace(TEST_RE, '')
    .replace(SCENARIO_RE, '')
    .replace(/\[P\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Split a (scenario: …) inner on comma/whitespace, keeping non-empty tokens.
function parseScenarios(inner) {
  return inner
    .split(/[\s,]+/)
    .map(s => s.trim())
    .filter(Boolean);
}

/**
 * The full shape of a parsed plan task — the shared contract that downstream
 * libraries consume by name rather than re-deriving it from raw plan text.
 * hooks/lib/test-gate.js (T008) depends on this shape; keep it in sync.
 *
 * @typedef {Object} Task
 * @property {string}   title            Task title with all clauses stripped.
 * @property {string[]} depends_on       Task ids this task depends on (expanded ranges).
 * @property {string[]} files            Declared file surface (backticks/whitespace stripped).
 * @property {boolean}  files_undeclared True when no (files: …) clause was present.
 * @property {string}   status           Checkbox status: 'open' for ' ', else the raw char (x/X/!/~).
 * @property {?string}  test_type        Value of the (test: …) trailer, or null when absent.
 * @property {string[]} scenarios        Ids from the (scenario: …) trailer; [] when absent.
 * @property {number}   wave             1-based wave number (stamped by analyze()).
 */

/**
 * Parse plan text into a tasks map. Order-independent: tasks may reference
 * ids defined later in the file.
 *
 * @param {string} text
 * @returns {Object.<string, Task>}
 */
function parsePlan(text) {
  const tasks = {};
  const lines = String(text).split(/\r?\n/);
  for (const line of lines) {
    const m = TASK_RE.exec(line);
    if (!m) continue;
    const [, status, id, rest] = m;
    if (tasks[id]) {
      throw new AnalysisError(`duplicate task id: ${id}`);
    }
    const depsMatch = DEPS_RE.exec(rest);
    const filesMatch = FILES_RE.exec(rest);
    const testMatch = TEST_RE.exec(rest);
    const scenarioMatch = SCENARIO_RE.exec(rest);
    const files = filesMatch ? parseFiles(filesMatch[1]) : [];
    tasks[id] = {
      title: stripClauses(rest) || id,
      depends_on: depsMatch ? expandDeps(depsMatch[1]) : [],
      files,
      files_undeclared: files.length === 0,
      status: status === ' ' ? 'open' : status,
      test_type: testMatch ? (testMatch[1].trim() || null) : null,
      scenarios: scenarioMatch ? parseScenarios(scenarioMatch[1]) : [],
    };
  }
  if (Object.keys(tasks).length === 0) {
    throw new AnalysisError('no tasks found in plan (expected lines like "- [ ] T001 ...")');
  }
  return tasks;
}

/**
 * Kahn-style level layering: each wave is the full set of tasks whose deps are
 * already placed. Throws on unknown dependency, self-dependency, or a cycle.
 */
function computeWaves(tasks) {
  const ids = Object.keys(tasks);
  const known = new Set(ids);

  // Validate references before layering so errors name the offender precisely.
  const unknown = [];
  for (const id of ids) {
    for (const dep of tasks[id].depends_on) {
      if (dep === id) throw new AnalysisError(`task ${id} depends on itself`);
      if (!known.has(dep)) unknown.push(`${id} → ${dep}`);
    }
  }
  if (unknown.length) {
    throw new AnalysisError(`unknown dependency reference(s): ${unknown.join(', ')}`);
  }

  const remaining = new Map(ids.map(id => [id, new Set(tasks[id].depends_on)]));
  const placed = new Set();
  const waves = [];
  while (remaining.size) {
    const ready = [...remaining.keys()]
      .filter(id => [...remaining.get(id)].every(d => placed.has(d)))
      .sort(byNumber);
    if (ready.length === 0) {
      const stuck = [...remaining.keys()].sort(byNumber).join(', ');
      throw new AnalysisError(`dependency cycle among tasks: ${stuck}`);
    }
    waves.push(ready);
    for (const id of ready) {
      placed.add(id);
      remaining.delete(id);
    }
  }
  return waves;
}

function detectCollisions(waves, tasks) {
  const collisions = [];
  waves.forEach((wave, i) => {
    const waveNo = i + 1;
    for (let a = 0; a < wave.length; a++) {
      for (let b = a + 1; b < wave.length; b++) {
        const fa = new Set(tasks[wave[a]].files);
        for (const f of tasks[wave[b]].files) {
          if (fa.has(f)) collisions.push({ wave: waveNo, tasks: [wave[a], wave[b]], file: f });
        }
      }
    }
  });
  return collisions;
}

function analyze(text) {
  const tasks = parsePlan(text);
  const waves = computeWaves(tasks);

  // Stamp each task with its wave number.
  waves.forEach((wave, i) => wave.forEach(id => (tasks[id].wave = i + 1)));

  const collisions = detectCollisions(waves, tasks);

  // A task can only "prove" independence if its file surface is declared.
  // Undeclared surfaces only matter where there's a same-wave peer.
  const undeclared = [];
  for (const wave of waves) {
    if (wave.length < 2) continue;
    for (const id of wave) {
      if (tasks[id].files_undeclared) undeclared.push(id);
    }
  }

  return {
    schema: SCHEMA,
    waves,
    tasks,
    collisions,
    undeclared,
    parallel: waves.some(w => w.length >= 2),
  };
}

// --- CLI shim ----------------------------------------------------------------

function readSource(arg) {
  if (arg === '-') return fs.readFileSync(0, 'utf8');
  return fs.readFileSync(arg, 'utf8');
}

function main() {
  const [, , cmd, arg] = process.argv;
  if (cmd !== 'compute') {
    process.stderr.write('usage: waves.js compute <plan.md|->\n');
    return 1;
  }
  if (!arg) {
    process.stderr.write('usage: waves.js compute <plan.md|->\n');
    return 1;
  }
  let text;
  try {
    text = readSource(arg);
  } catch (err) {
    process.stderr.write(`cannot read plan: ${err.message}\n`);
    return 1;
  }
  try {
    const contract = analyze(text);
    process.stdout.write(JSON.stringify(contract, null, 2) + '\n');
    return 0;
  } catch (err) {
    if (err instanceof AnalysisError) {
      process.stderr.write(`AnalysisError: ${err.message}\n`);
      return 2;
    }
    throw err;
  }
}

if (require.main === module) {
  process.exit(main());
}

module.exports = {
  analyze,
  parsePlan,
  computeWaves,
  detectCollisions,
  expandDeps,
  AnalysisError,
  SCHEMA,
};
