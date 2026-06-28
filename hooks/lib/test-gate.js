'use strict';

/**
 * hooks/lib/test-gate.js
 *
 * The deterministic test-taxonomy gate. Consumes the documented `waves` task
 * object shape (@typedef Task in waves.js — parsed via waves.parsePlan), the
 * resolved taxonomy (taxonomy.resolve), the spec's scenario ids, and the set of
 * approved sign-off task ids; emits a `test-gate/v1` contract with
 * severity-coded findings, a per-task summary, and a blocked flag.
 *
 * Contract:
 *   check({ planText, specText, testingDoc, approved, scenarioPattern })
 *     → { schema:"test-gate/v1",
 *         findings:[ { code, severity, task, detail } ],  // task null = spec-level
 *         summary:[ { task, test_type, scenarios } ],
 *         blocked:Boolean }
 *
 * Finding codes:
 *   TAXONOMY_DEFECT   error   spec-level — a required taxonomy field is missing.
 *   DIAGRAM_MISSING   warning spec-level — a type has prose but no Mermaid diagram.
 *   MIGRATION_NEEDED  error   spec-level — a pre-grammar plan (no annotations).
 *   MISSING_TEST_TYPE error   task       — a task with no (test: …) trailer.
 *   UNKNOWN_TEST_TYPE error   task       — a (test: …) value not in the taxonomy.
 *   SIGNOFF_REQUIRED  error   task       — a sign-off-tier type without approval.
 *   UNTRACEABLE_TASK  error   task       — a behavioral task with no scenario ref.
 *   DANGLING_SCENARIO error   task       — a scenario ref absent from the spec.
 *   UNSERVED_SCENARIO error   spec-level — a spec scenario no task serves.
 *
 * CLI:
 *   node test-gate.js check <plan.md> --spec <spec.md> \
 *        [--testing <testing.md|->] [--approved id,id] [--scenario-pattern <re>]
 *
 * Exit codes: 0 ok · 1 usage/read error · 2 blocked · 3 taxonomy defect
 * (a defect takes precedence over a plain block).
 */

const fs = require('fs');
const waves = require('./waves.js');
const taxonomy = require('./taxonomy.js');

const SCHEMA = 'test-gate/v1';
// Acceptance-scenario ids ONLY (AS-001, S001, S-1). Must NOT match requirement
// (FR-001), edge-case (EC-001), or success-criterion (SC-01) ids — otherwise
// the gate would demand a serving task for every such id and falsely block.
const DEFAULT_SCENARIO_PATTERN = /\b(?:AS|S)-?\d+\b/g;

/**
 * Numeric ordering for task ids like "T010" (falls back to lexical).
 */
function taskOrder(a, b) {
  const na = parseInt(String(a).replace(/\D/g, ''), 10);
  const nb = parseInt(String(b).replace(/\D/g, ''), 10);
  if (Number.isNaN(na) || Number.isNaN(nb)) return String(a).localeCompare(String(b));
  return na - nb;
}

/**
 * Compile the scenario-id pattern, accepting a RegExp or a string. Always
 * global so we can extract every match.
 */
function compilePattern(scenarioPattern) {
  if (scenarioPattern instanceof RegExp) {
    return scenarioPattern.global ? scenarioPattern : new RegExp(scenarioPattern.source, scenarioPattern.flags + 'g');
  }
  if (typeof scenarioPattern === 'string' && scenarioPattern.length > 0) {
    return new RegExp(scenarioPattern, 'g');
  }
  return DEFAULT_SCENARIO_PATTERN;
}

/**
 * Extract the set of scenario ids referenced anywhere in the spec text.
 */
function extractScenarioIds(specText, pattern) {
  const re = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
  const ids = new Set();
  let m;
  while ((m = re.exec(String(specText || ''))) !== null) {
    ids.add(m[0]);
    if (m.index === re.lastIndex) re.lastIndex++; // guard against zero-width
  }
  return ids;
}

/**
 * Treat a boundary value as "non-behavioral" (and therefore traceability-exempt)
 * when it is empty or an explicit none-marker. Repo-authoritative taxonomies
 * (D-c) may rename the non-behavioral type away from `none`; the gate keys the
 * exemption off the boundary so that exemption survives the rename.
 */
function isNonBehavioralBoundary(boundary) {
  if (typeof boundary !== 'string') return false;
  const v = boundary.trim().toLowerCase();
  return v === '' || v === '—' || v === '-' || v === 'n/a';
}

/**
 * A task is exempt from the scenario-reference requirement when its declared
 * type is `none` OR when the resolved taxonomy type carries an empty/none
 * boundary.
 */
function isTraceabilityExempt(type, tax) {
  if (type === 'none') return true;
  const t = tax.types[type];
  return !!(t && isNonBehavioralBoundary(t.boundary));
}

/**
 * Surface taxonomy-level findings: defects (missing required field → error) and
 * prose-without-diagram (warning).
 */
function validateTaxonomy(tax, findings) {
  for (const d of tax.defects) {
    findings.push({
      code: 'TAXONOMY_DEFECT',
      severity: 'error',
      task: null,
      detail: `taxonomy type "${d.type}" is missing required field "${d.field}"`,
    });
  }
  for (const name of Object.keys(tax.types)) {
    if (tax.types[name].has_diagram === false) {
      findings.push({
        code: 'DIAGRAM_MISSING',
        severity: 'warning',
        task: null,
        detail: `taxonomy type "${name}" has no Mermaid harness diagram`,
      });
    }
  }
}

/**
 * Per-task checks (numeric order): missing/unknown type, sign-off approval,
 * traceability, and dangling scenario references.
 */
function validateTasks({ ids, tasks, tax, approvedSet, scenarioIds, findings }) {
  for (const id of ids) {
    const task = tasks[id];
    const type = task.test_type;

    if (type === null) {
      findings.push({
        code: 'MISSING_TEST_TYPE',
        severity: 'error',
        task: id,
        detail: `task ${id} declares no (test: …) type`,
      });
    } else if (!Object.prototype.hasOwnProperty.call(tax.types, type)) {
      findings.push({
        code: 'UNKNOWN_TEST_TYPE',
        severity: 'error',
        task: id,
        detail: `task ${id} uses test type "${type}", which is not in the taxonomy`,
      });
    } else if (tax.types[type].tier === 'sign-off' && !approvedSet.has(id)) {
      findings.push({
        code: 'SIGNOFF_REQUIRED',
        severity: 'error',
        task: id,
        detail: `task ${id} uses sign-off-tier type "${type}" and is not approved`,
      });
    }

    // Behavioral tasks must trace to a scenario; non-behavioral (none / empty
    // boundary) types are exempt.
    if (type !== null && !isTraceabilityExempt(type, tax) && task.scenarios.length === 0) {
      findings.push({
        code: 'UNTRACEABLE_TASK',
        severity: 'error',
        task: id,
        detail: `task ${id} (type "${type}") references no scenario`,
      });
    }

    // Every referenced scenario must exist in the spec.
    for (const sid of task.scenarios) {
      if (!scenarioIds.has(sid)) {
        findings.push({
          code: 'DANGLING_SCENARIO',
          severity: 'error',
          task: id,
          detail: `task ${id} references scenario ${sid}, which is absent from the spec`,
        });
      }
    }
  }
}

/**
 * Every spec scenario must be served by at least one task.
 */
function validateScenarioCoverage({ ids, tasks, scenarioIds, findings }) {
  const served = new Set();
  for (const id of ids) {
    for (const sid of tasks[id].scenarios) served.add(sid);
  }
  for (const sid of scenarioIds) {
    if (!served.has(sid)) {
      findings.push({
        code: 'UNSERVED_SCENARIO',
        severity: 'error',
        task: null,
        detail: `spec scenario ${sid} is served by no task`,
      });
    }
  }
}

/**
 * Run the gate — orchestrator over parse → resolve → migration-guard →
 * validate* → aggregate.
 *
 * @param {{planText:string, specText:string, testingDoc?:?string,
 *          approved?:string[], scenarioPattern?:(RegExp|string)}} opts
 * @returns {{schema:string, findings:Array, summary:Array, blocked:boolean}}
 */
function check({ planText, specText, testingDoc, approved, scenarioPattern } = {}) {
  const findings = [];
  const approvedSet = new Set(approved || []);

  // Parse the plan into tasks and build the ordered summary.
  const tasks = waves.parsePlan(planText);
  const ids = Object.keys(tasks).sort(taskOrder);
  const summary = ids.map(id => ({
    task: id,
    test_type: tasks[id].test_type,
    scenarios: tasks[id].scenarios,
  }));

  // Resolve the taxonomy and surface its defects / missing diagrams.
  const tax = taxonomy.resolve({ repoDoc: testingDoc || null });
  validateTaxonomy(tax, findings);

  // Spec scenario ids.
  const pattern = compilePattern(scenarioPattern);
  const scenarioIds = extractScenarioIds(specText, pattern);

  // Migration guard — a pre-grammar plan (no annotations at all) is all-or-
  // nothing: one MIGRATION_NEEDED, no per-task noise.
  const anyTyped = ids.some(id => tasks[id].test_type !== null);
  const anyScenarios = ids.some(id => tasks[id].scenarios.length > 0);
  if (!anyTyped && !anyScenarios) {
    findings.push({
      code: 'MIGRATION_NEEDED',
      severity: 'error',
      task: null,
      detail:
        'plan has no (test: …)/(scenario: …) annotations — migrate it to the test-taxonomy grammar',
    });
    return { schema: SCHEMA, findings, summary, blocked: blockedFrom(findings) };
  }

  validateTasks({ ids, tasks, tax, approvedSet, scenarioIds, findings });
  validateScenarioCoverage({ ids, tasks, scenarioIds, findings });

  return { schema: SCHEMA, findings, summary, blocked: blockedFrom(findings) };
}

function blockedFrom(findings) {
  return findings.some(f => f.severity === 'error');
}

// --- CLI shim ----------------------------------------------------------------

function readSource(arg) {
  if (arg === '-') return fs.readFileSync(0, 'utf8');
  return fs.readFileSync(arg, 'utf8');
}

function parseArgs(argv) {
  // argv: [cmd, planPath, ...flags]
  const out = { cmd: argv[0], plan: argv[1], spec: null, testing: null, approved: [], scenarioPattern: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--spec') out.spec = argv[++i];
    else if (a === '--testing') out.testing = argv[++i];
    else if (a === '--approved') out.approved = String(argv[++i] || '').split(/[\s,]+/).filter(Boolean);
    else if (a === '--scenario-pattern') out.scenarioPattern = argv[++i];
    else return { error: `unknown argument: ${a}` };
  }
  return out;
}

function main() {
  const argv = process.argv.slice(2);
  const args = parseArgs(argv);
  if (args.error || args.cmd !== 'check' || !args.plan || !args.spec) {
    process.stderr.write(
      'usage: test-gate.js check <plan.md> --spec <spec.md> [--testing <file|->] [--approved id,id] [--scenario-pattern <re>]\n',
    );
    return 1;
  }

  let planText;
  let specText;
  let testingDoc = null;
  try {
    planText = readSource(args.plan);
    specText = readSource(args.spec);
    if (args.testing) testingDoc = readSource(args.testing);
  } catch (err) {
    process.stderr.write(`cannot read input: ${err.message}\n`);
    return 1;
  }

  let result;
  try {
    result = check({
      planText,
      specText,
      testingDoc,
      approved: args.approved,
      scenarioPattern: args.scenarioPattern,
    });
  } catch (err) {
    process.stderr.write(`gate error: ${err.message}\n`);
    return 1;
  }

  process.stdout.write(JSON.stringify(result, null, 2) + '\n');

  if (result.findings.some(f => f.code === 'TAXONOMY_DEFECT')) return 3;
  if (result.blocked) return 2;
  return 0;
}

if (require.main === module) {
  process.exit(main());
}

module.exports = {
  check,
  DEFAULT_SCENARIO_PATTERN,
};
