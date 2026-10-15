'use strict';

/**
 * hooks/lib/review-scope.js
 *
 * Deterministic Stage-2 lens resolution for /review. Contract: review-scope/v1.
 *
 * Which review agents apply to a changeset was prose-driven: the skill described
 * the `scope:` frontmatter rule and the model matched globs by eye. The
 * mechanical half of that — glob matching, ordering, and what a docs-only diff
 * may skip — is now a script. Dispatch is NOT a gate, so the resolver is
 * deliberately INCLUDE-BIASED: it drops a lens only when it can prove the lens
 * has nothing to look at, and every read failure widens the roster and is
 * reported in `warnings` rather than narrowing the result silently.
 *
 * Also hosts scopeGrowth() — the correction loop's escape hatch: when a fix
 * touches a file the original panel never reviewed, the "re-run only the agents
 * that found issues" argument no longer holds and the full panel must re-run.
 * A set comparison of two file lists, decided here rather than judged in prose.
 *
 * Public API:
 *   parseAgentFile(name, text)                 -> { name, scope, context_needs, model }
 *   loadAgents(dir)                            -> { agents, warnings }
 *   isNonExecutable(file)                      -> boolean
 *   selectLenses(changedFiles, opts)           -> contract
 *   scopeGrowth(panelFiles, fixFiles)          -> { grew, outside }
 *
 * CLI:
 *   review-scope.js select <file> [<file> …]         -> prints the contract JSON
 *   review-scope.js select --files-from <path>       -> one changed path per line
 *   review-scope.js scope-growth --panel <path> --fix <path>
 *                                                    -> { grew, outside }
 * Exit codes: 0 ok · 1 usage error.
 */

const fs = require('fs');
const path = require('path');
const { globToRegExp } = require('./lang-loader.js');

const SCHEMA = 'review-scope/v1';

const AGENTS_DIR = path.join(__dirname, '..', '..', 'agents');

/** Cheap first. An unknown tier sorts with sonnet — neither promoted nor buried. */
const MODEL_RANK = { haiku: 0, sonnet: 1, opus: 2 };
const rankOf = model => (model in MODEL_RANK ? MODEL_RANK[model] : 1);

/**
 * Extensions with no runtime behaviour to review: prose and binary assets only.
 *
 * Deliberately NARROWER than it looks like it should be. `.json`/`.yaml`/`.toml`
 * and lockfiles are NOT here: a dependency bump or a CI-workflow edit changes
 * what the software does and is exactly what security-review exists to catch.
 * The gate may only remove a lens it can prove has nothing to look at.
 */
const NON_EXECUTABLE_EXTENSIONS = new Set([
  '.md', '.mdx', '.txt', '.rst', '.adoc',
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.svg', '.pdf',
  '.mp4', '.mov', '.woff', '.woff2', '.ttf',
]);

/**
 * Markdown that IS the program. In a prompt-driven repo an agent, a skill, or a
 * CLAUDE.md is executable content, not documentation — a change there alters
 * behaviour and must keep the full roster.
 */
const FUNCTIONAL_CONFIG_PATTERNS = [
  /(^|\/)CLAUDE\.md$/,
  /(^|\/)AGENTS\.md$/,
  /(^|\/)\.claude\//,
  /(^|\/)\.verified\//,
  /(^|\/)agents\//,
  /(^|\/)skills\//,
  /(^|\/)hooks\//,
  /(^|\/)plans\//,
];

/**
 * `scope: always` lenses that genuinely have nothing to say about a diff of
 * prose and images, and may therefore be skipped on one.
 *
 * `security-review` is deliberately ABSENT: prose is the prompt-injection
 * vector, and review-integrity rule 1 makes a file that tries to steer its own
 * review an `error` finding. A docs-only diff is precisely when it must run.
 */
const NON_EXECUTABLE_SKIP_ELIGIBLE = [
  'complexity-review',
  'correctness-review',
  'test-review',
];

// --- agent declarations ------------------------------------------------------

function frontmatter(text) {
  const m = String(text || '').match(/^---\n([\s\S]*?)\n---/);
  return m ? m[1] : null;
}

function field(fm, key) {
  const m = fm.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
  // Glob scopes are quoted — a YAML scalar starting with `*` is an alias.
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : null;
}

/**
 * Parse one agent file into a declaration. An agent whose scope cannot be read
 * defaults to `always`: an undeclarable agent must run on everything, never on
 * nothing.
 */
function parseAgentFile(name, text) {
  const fm = frontmatter(text);
  const raw = fm ? field(fm, 'scope') : null;
  const scope =
    raw === null || raw === 'always'
      ? 'always'
      : raw.split(',').map(s => s.trim()).filter(Boolean);
  const minRaw = fm ? field(fm, 'min_changed_lines') : null;
  const minParsed = minRaw === null ? NaN : Number(minRaw);
  return {
    name,
    scope: Array.isArray(scope) && scope.length === 0 ? 'always' : scope,
    context_needs: (fm && field(fm, 'context_needs')) || 'full-file',
    model: (fm && field(fm, 'model')) || 'sonnet',
    // A size gate the lens declares for itself: below this many changed lines
    // it is skipped. An unparseable value is no gate — include-biased.
    min_changed_lines: Number.isFinite(minParsed) && minParsed > 0 ? minParsed : null,
    declared: Boolean(fm && raw),
  };
}

/**
 * Load the *-review roster from a directory. Fails open in both directions: an
 * unreadable directory yields an empty roster plus a warning (the caller can see
 * the result is not authoritative); an unreadable or undeclared agent file is
 * still included, at `always`, plus a warning.
 */
function loadAgents(dir) {
  const agents = [];
  const warnings = [];
  let entries;
  try {
    entries = fs.readdirSync(dir).filter(f => f.endsWith('-review.md')).sort();
  } catch (err) {
    return { agents, warnings: [`unreadable-agents-dir:${dir}`] };
  }
  for (const entry of entries) {
    const name = entry.replace(/\.md$/, '');
    let text;
    try {
      text = fs.readFileSync(path.join(dir, entry), 'utf8');
    } catch {
      warnings.push(`unreadable-agent-file:${entry}`);
      agents.push({ name, scope: 'always', context_needs: 'full-file', model: 'sonnet', declared: false });
      continue;
    }
    const decl = parseAgentFile(name, text);
    if (!decl.declared) warnings.push(`undeclared-scope:${entry}`);
    agents.push(decl);
  }
  return { agents, warnings };
}

// --- file classification -----------------------------------------------------

/** Prose or asset with no behaviour to review — and not functional config. */
function isNonExecutable(file) {
  const p = String(file || '').replace(/\\/g, '/');
  if (FUNCTIONAL_CONFIG_PATTERNS.some(re => re.test(p))) return false;
  return NON_EXECUTABLE_EXTENSIONS.has(path.extname(p).toLowerCase());
}

function matchesAny(file, globs) {
  return globs.some(g => globToRegExp(g).test(String(file || '').replace(/\\/g, '/')));
}

function anyFileMatches(files, globs) {
  return files.some(f => matchesAny(f, globs));
}

// --- resolution --------------------------------------------------------------

/**
 * Resolve the Stage-2 panel for a changeset.
 *
 * @param {string[]} changedFiles
 * @param {{agents?:Array, agentsDir?:string, exclude?:string[], warnings?:string[], changedLines?:number}} opts
 *   `changedLines` is the diff size (added + deleted lines). A lens that declares
 *   `min_changed_lines` is skipped below it. An unknown count keeps every lens.
 * @returns {{schema, selected, skipped, warnings, non_executable_only, changed_files, changed_lines}}
 */
function selectLenses(changedFiles, opts = {}) {
  const files = (Array.isArray(changedFiles) ? changedFiles : []).filter(Boolean);
  const warnings = [...(opts.warnings || [])];
  let agents = opts.agents;
  if (!agents) {
    const loaded = loadAgents(opts.agentsDir || AGENTS_DIR);
    agents = loaded.agents;
    warnings.push(...loaded.warnings);
  }
  const exclude = new Set(opts.exclude || []);

  // The size gate. Unknown is not zero: a lens is dropped only on a known count.
  const linesRaw = opts.changedLines;
  const changedLines =
    linesRaw === undefined || linesRaw === null || linesRaw === '' || !Number.isFinite(Number(linesRaw))
      ? null
      : Number(linesRaw);
  const anyGated = agents.some(a => Number.isFinite(a.min_changed_lines) && a.min_changed_lines > 0);
  if (changedLines === null && anyGated) warnings.push('changed-lines-unknown:keeping-size-gated-lenses');
  const tooSmall = agent =>
    changedLines !== null &&
    Number.isFinite(agent.min_changed_lines) &&
    agent.min_changed_lines > 0 &&
    changedLines < agent.min_changed_lines;

  // An empty list is not proof that nothing needs reviewing — it is proof the
  // resolver cannot narrow. Keep every `always` lens and say so.
  const cannotNarrow = files.length === 0;
  if (cannotNarrow) warnings.push('empty-changed-file-list:keeping-all-always-lenses');

  const nonExecutableOnly = !cannotNarrow && files.every(isNonExecutable);

  const selected = [];
  const skipped = [];
  for (const agent of agents) {
    if (exclude.has(agent.name)) {
      skipped.push({ name: agent.name, reason: 'excluded-by-caller' });
      continue;
    }
    if (tooSmall(agent)) {
      skipped.push({ name: agent.name, reason: 'small-diff', min_changed_lines: agent.min_changed_lines, changed_lines: changedLines });
      continue;
    }
    if (agent.scope === 'always') {
      if (nonExecutableOnly && NON_EXECUTABLE_SKIP_ELIGIBLE.includes(agent.name)) {
        skipped.push({ name: agent.name, reason: 'non-executable-only-diff' });
        continue;
      }
      selected.push({ ...agent, reason: 'scope-always' });
      continue;
    }
    if (cannotNarrow) {
      skipped.push({ name: agent.name, reason: 'no-matching-file' });
      continue;
    }
    if (anyFileMatches(files, agent.scope)) selected.push({ ...agent, reason: 'glob-match' });
    else skipped.push({ name: agent.name, reason: 'no-matching-file' });
  }

  selected.sort((a, b) => rankOf(a.model) - rankOf(b.model) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  return {
    schema: SCHEMA,
    selected: selected.map(a => ({
      name: a.name,
      model: a.model,
      context_needs: a.context_needs,
      reason: a.reason,
    })),
    skipped,
    warnings,
    non_executable_only: nonExecutableOnly,
    changed_files: files.length,
    changed_lines: changedLines,
  };
}

/**
 * Did the correction loop's fix leave the reviewed surface? If yes, the panel's
 * "we already reviewed the rest" argument no longer holds and the full panel
 * must re-run over the whole changeset. Missing input on either side counts as
 * growth — fail safe toward the more expensive, more correct answer.
 */
function scopeGrowth(panelFiles, fixFiles) {
  if (!Array.isArray(panelFiles) || !Array.isArray(fixFiles)) {
    return { grew: true, outside: [], reason: 'unknown-file-list' };
  }
  const reviewed = new Set(panelFiles);
  const outside = fixFiles.filter(f => !reviewed.has(f));
  return { grew: outside.length > 0, outside };
}

// --- CLI shim ----------------------------------------------------------------

const USAGE =
  'usage: review-scope.js select <file>… | select --files-from <path> [--changed-lines N] [--agents-dir <dir>] | ' +
  'scope-growth --panel <path> --fix <path>\n';

function readList(file) {
  return fs.readFileSync(file, 'utf8').split('\n').map(s => s.trim()).filter(Boolean);
}

function main() {
  const [, , cmd, ...rest] = process.argv;
  if (cmd === 'select') {
    const files = [];
    const opts = {};
    for (let i = 0; i < rest.length; i += 1) {
      const a = rest[i];
      if (a === '--files-from') {
        try {
          files.push(...readList(rest[i + 1]));
        } catch {
          process.stderr.write(`review-scope.js: cannot read ${rest[i + 1]}\n`);
          return 1;
        }
        i += 1;
      } else if (a === '--changed-lines') {
        opts.changedLines = rest[i + 1];
        i += 1;
      } else if (a === '--agents-dir') {
        opts.agentsDir = rest[i + 1];
        i += 1;
      } else {
        files.push(a);
      }
    }
    process.stdout.write(JSON.stringify(selectLenses(files, opts), null, 2) + '\n');
    return 0;
  }
  if (cmd === 'scope-growth') {
    const args = {};
    for (let i = 0; i < rest.length; i += 2) args[rest[i].replace(/^--/, '')] = rest[i + 1];
    if (!args.panel || !args.fix) {
      process.stderr.write(USAGE);
      return 1;
    }
    // An unreadable list is `null`, which scopeGrowth treats as growth — the
    // fail-safe answer is the full re-dispatch, not a silent "no growth".
    const read = f => {
      try {
        return readList(f);
      } catch {
        return null;
      }
    };
    process.stdout.write(JSON.stringify(scopeGrowth(read(args.panel), read(args.fix)), null, 2) + '\n');
    return 0;
  }
  process.stderr.write(USAGE);
  return 1;
}

if (require.main === module) process.exitCode = main();

module.exports = {
  parseAgentFile,
  loadAgents,
  isNonExecutable,
  selectLenses,
  scopeGrowth,
  SCHEMA,
  NON_EXECUTABLE_EXTENSIONS,
  NON_EXECUTABLE_SKIP_ELIGIBLE,
  FUNCTIONAL_CONFIG_PATTERNS,
};
