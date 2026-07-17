'use strict';

/**
 * hooks/lib/test-corpus.js
 *
 * Deterministic, LANGUAGE-AGNOSTIC test-corpus analysis for the /test-audit
 * command. The library parses test source as TEXT (no language toolchain) so it
 * can run in any user's Claude Code runtime with zero dependencies, mirroring
 * its sibling libs (waves.js, taxonomy.js). It does ALL the mechanical work —
 * discovery, classification, smell-ranking, summary, scope — and emits a
 * versioned JSON contract the skill renders from. The model never re-derives the
 * corpus from raw source.
 *
 * ── Language-adapter seam ──────────────────────────────────────────────────
 * Per-language knowledge (what a test function looks like, how its body is
 * brace-balanced, how assertions are counted) lives in drop-in adapters under
 * `hooks/lib/lang/`. The core loads every module in that directory that exports
 * an `extensions` array and builds an extension→adapter map. A module WITHOUT an
 * `extensions` array (e.g. the shared `cfamily.js` brace scanner) is skipped.
 * Each adapter exports:
 *
 *   { id, extensions: ['.ext'], testFileGlobs: ['**\/*_test.ext'],
 *     discover(source, file) -> [{ name, line, body }],
 *     countAssertions(body)  -> number }
 *
 * The core attaches `file` and `test.assertions = adapter.countAssertions(body)`
 * to each discovered test, so the classifier/scorer never sees a language.
 *
 * ── Public API ─────────────────────────────────────────────────────────────
 *   const { discover, classify, analyze, SCHEMA } = require('./test-corpus.js');
 *
 *   discover(rootPath) -> {
 *     tests: [{ name, file, line, body, assertions }],
 *     unsupported_files: [<path>, ...],   // test-shaped files in unsupported langs
 *   }
 *   classify(test, types) -> { type, sanctioned, ambiguous, matched_markers }
 *   analyze({ rootPath, testingDoc }) -> test-corpus/v1 contract (see SCHEMA).
 *
 *   • rootPath may be a directory (recursed) OR a single file (EC-008).
 *   • A scope with no analyzable tests yields `tests: []` (EC-002); when foreign
 *     test files were seen, analyze() adds an explicit `note` so a non-supported
 *     repo is not mistaken for "tests fine" (EC-006).
 */

const fs = require('fs');
const path = require('path');

// Versioned contract this module emits from analyze() and the `scan` CLI.
const SCHEMA = 'test-corpus/v1';

/**
 * The analyze() / `scan` output contract.
 *
 * @typedef {Object} TestCorpusV1
 * @property {'test-corpus/v1'} schema
 * @property {string} scope                      Directory leaf the scan covers.
 * @property {Array<CorpusTest>} tests           Ranked worst-first (smell desc).
 * @property {CorpusSummary} summary
 * @property {string[]} unsupported_files        Test-shaped files in unsupported langs.
 * @property {string} [note]                     Present only when tests is empty
 *                                               but unsupported_files is not.
 *
 * @typedef {Object} CorpusTest
 * @property {string} name
 * @property {string} file
 * @property {number} line
 * @property {?string} type                      Inferred type name, or null.
 * @property {boolean} sanctioned                Classified into a non-`sign-off`-tier type.
 * @property {number} smell                      Non-negative; higher = worse.
 * @property {CorpusSignals} signals
 * @property {boolean} ambiguous                 >1 type claimed the test.
 *
 * @typedef {Object} CorpusSignals
 * @property {boolean} unclassified              type === null.
 * @property {number} assertion_dispersion       Adapter assertion count for the body.
 * @property {number} length                     Body length in lines.
 * @property {boolean} weak_match                Classified but matched few markers.
 *
 * @typedef {Object} CorpusSummary
 * @property {number} total
 * @property {Object.<string, number>} by_type   Per-type + an `unclassified` bucket.
 * @property {number} sanctioned                 Count classified into a non-`sign-off` tier.
 * @property {number} share_sanctioned           sanctioned / total (0 when empty).
 * @property {number} classification_coverage    (type!==null) / total (0 when empty).
 */

// Test-shaped files whose extension has NO loaded adapter. We recognise these
// as "tests in another language" so the report can flag them as not-audited
// rather than silently dropping them (EC-006). This is a naming heuristic, not a
// claim of support — once an adapter for the extension is added, that adapter
// (selected by extension) takes precedence and these files become analyzable.
const UNSUPPORTED_TEST_RE = /(^|[\/\\])(test_\w+\.py|\w+_test\.py|.+\.test\.[jt]sx?|.+\.spec\.[jt]sx?|\w+_spec\.rb|\w+Test\.java)$/;

// The per-language adapter loader is shared with test-weakening.js — see
// hooks/lib/lang-loader.js (extracted so both modules use one loader).
const { adapterByExtension, supportedLanguageIds, globToRegExp } = require('./lang-loader.js');

/**
 * Walk a directory tree, returning absolute-or-as-given file paths. Recurses
 * itself (no deps); skips nothing special — callers filter by extension.
 *
 * @param {string} dir
 * @returns {string[]}
 */
function walkFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkFiles(full));
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Discover test functions under a path (directory recursed, or a single file),
 * dispatching to the language adapter selected by file extension. The adapter
 * returns { name, line, body } per test; the core attaches `file` and the
 * adapter's assertion count (`assertions`) so downstream stages stay agnostic.
 *
 * Files whose extension has no adapter are ignored, except test-shaped files in
 * unsupported languages, which are surfaced in `unsupported_files` (EC-006).
 *
 * @param {string} rootPath
 * @returns {{tests: Array<{name,file,line,body,assertions}>, unsupported_files: string[]}}
 */
function discover(rootPath) {
  const stat = fs.statSync(rootPath);
  const files = stat.isDirectory() ? walkFiles(rootPath) : [rootPath];
  const byExt = adapterByExtension();

  const tests = [];
  const unsupported = [];

  for (const file of files) {
    const adapter = byExt[path.extname(file)];
    if (adapter) {
      const src = fs.readFileSync(file, 'utf8');
      for (const t of adapter.discover(src, file)) {
        tests.push({
          name: t.name,
          file,
          line: t.line,
          body: t.body,
          assertions: adapter.countAssertions(t.body),
        });
      }
    } else if (UNSUPPORTED_TEST_RE.test(file)) {
      unsupported.push(file);
    }
  }

  return { tests, unsupported_files: unsupported };
}

// --- Classification ----------------------------------------------------------

// Regex metacharacters to escape when compiling a literal glob char.
/** True iff any glob in `globs` matches `file`. */
function anyGlobMatches(globs, file) {
  for (const g of globs) {
    if (globToRegExp(g).test(file)) return true;
  }
  return false;
}

/**
 * Specificity of a glob: more literal characters and fewer wildcards rank
 * higher. Used as a deterministic tiebreak between two claiming types.
 *
 * @param {string} glob
 * @returns {number}
 */
function globSpecificity(glob) {
  let stars = 0;
  for (const c of glob) if (c === '*') stars++;
  const literals = glob.length - stars;
  return literals - stars;
}

/** Best (max) specificity among a type's globs that match `file`. */
function bestMatchingSpecificity(globs, file) {
  let best = -Infinity;
  for (const g of globs) {
    if (globToRegExp(g).test(file) && globSpecificity(g) > best) {
      best = globSpecificity(g);
    }
  }
  return best;
}

/**
 * Classify a discovered test against the resolved taxonomy types.
 *
 * Candidacy: a type CLAIMS the test iff its match_paths is non-empty and a glob
 * matches test.file, AND its match_markers is non-empty and ≥1 marker token
 * appears in test.body (body only — EC-007). A type with empty match_paths OR
 * match_markers can never claim (EC-004).
 *
 * Winner among ≥2 claimants (deterministic): most markers matched, then
 * most-specific matching path, then type name ascending.
 *
 * `sanctioned` is tier-aware: true iff the winning type's `tier` is NOT
 * `sign-off`. A test classified into a `sign-off`-tier type IS classified
 * (type !== null) but NOT sanctioned — so share_sanctioned and
 * classification_coverage can legitimately differ.
 *
 * @param {{name?: string, file: string, body: string}} test
 * @param {Object.<string, {match_paths?: string[], match_markers?: string[], tier?: string}>} types
 * @returns {{type: ?string, sanctioned: boolean, ambiguous: boolean, matched_markers: string[]}}
 */
function classify(test, types) {
  const body = test.body || '';
  const file = test.file || '';
  const claimants = [];

  for (const name of Object.keys(types)) {
    const def = types[name] || {};
    const paths = Array.isArray(def.match_paths) ? def.match_paths : [];
    const markers = Array.isArray(def.match_markers) ? def.match_markers : [];
    if (paths.length === 0 || markers.length === 0) continue; // EC-004

    if (!anyGlobMatches(paths, file)) continue;

    const matched = markers.filter((m) => body.includes(m));
    if (matched.length === 0) continue;

    claimants.push({
      name,
      matched,
      specificity: bestMatchingSpecificity(paths, file),
    });
  }

  if (claimants.length === 0) {
    return { type: null, sanctioned: false, ambiguous: false, matched_markers: [] };
  }

  claimants.sort((a, b) => {
    if (b.matched.length !== a.matched.length) return b.matched.length - a.matched.length;
    if (b.specificity !== a.specificity) return b.specificity - a.specificity;
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  });

  const winner = claimants[0];
  const tier = (types[winner.name] || {}).tier;
  return {
    type: winner.name,
    sanctioned: tier !== 'sign-off',
    ambiguous: claimants.length > 1,
    matched_markers: winner.matched,
  };
}

// --- Smell ranking + analysis ------------------------------------------------

// A classification is "weak" when the winning type matched fewer than this
// share of its declared markers — sanctioned, but only barely.
const WEAK_MATCH_THRESHOLD = 0.5;

// Smell weights. unclassified dominates (heaviest); the rest are additive
// contributors. Tests assert ORDER + relative magnitude, never exact scores.
const SMELL_WEIGHTS = {
  unclassified: 100,
  assertion_dispersion: 2,
  length: 1,
  weak_match: 10,
};

/**
 * Compute the per-test signals and the combined smell score. The assertion
 * count is provided by the language adapter (test.assertions) — the core never
 * inspects a language's assertion syntax.
 *
 * @param {{body: string, assertions?: number}} test
 * @param {{type: ?string, matched_markers: string[]}} cls
 * @param {Object} types
 * @returns {{signals: object, smell: number}}
 */
function scoreTest(test, cls, types) {
  const body = test.body || '';
  const unclassified = cls.type === null;
  const assertion_dispersion = typeof test.assertions === 'number' ? test.assertions : 0;
  const length = body.split(/\r?\n/).length;

  let weak_match = false;
  if (!unclassified) {
    const def = types[cls.type] || {};
    const declared = Array.isArray(def.match_markers) ? def.match_markers.length : 0;
    if (declared > 0) {
      weak_match = cls.matched_markers.length / declared < WEAK_MATCH_THRESHOLD;
    }
  }

  const smell =
    (unclassified ? SMELL_WEIGHTS.unclassified : 0) +
    assertion_dispersion * SMELL_WEIGHTS.assertion_dispersion +
    length * SMELL_WEIGHTS.length +
    (weak_match ? SMELL_WEIGHTS.weak_match : 0);

  return {
    signals: { unclassified, assertion_dispersion, length, weak_match },
    smell,
  };
}

/**
 * Derive the human-facing scope label from a scan root: a directory → its
 * basename; a single file → the basename of its parent directory (FR-006).
 *
 * @param {string} rootPath
 * @returns {string}
 */
function deriveScope(rootPath) {
  const stat = fs.statSync(rootPath);
  const normalized = rootPath.replace(/[\/\\]+$/, '');
  if (stat.isDirectory()) return path.basename(normalized);
  return path.basename(path.dirname(normalized));
}

/**
 * Analyze a test corpus: discover Go tests under rootPath, classify each
 * against the repo taxonomy (resolved from testingDoc), rank worst-first by
 * smell and roll up summary statistics. Deterministic (FR-014).
 *
 * @param {{rootPath: string, testingDoc?: string}} opts
 * @returns {TestCorpusV1}
 */
function analyze({ rootPath, testingDoc } = {}) {
  const { resolve } = require('./taxonomy.js');
  const { types } = resolve({ repoDoc: testingDoc });

  const { tests: discovered, unsupported_files } = discover(rootPath);

  const tests = discovered.map((t) => {
    const cls = classify(t, types);
    const { signals, smell } = scoreTest(t, cls, types);
    return {
      name: t.name,
      file: t.file,
      line: t.line,
      type: cls.type,
      sanctioned: cls.sanctioned,
      smell,
      signals,
      ambiguous: cls.ambiguous,
    };
  });

  // Worst-first; stable tiebreak on name for deterministic output.
  tests.sort((a, b) => {
    if (b.smell !== a.smell) return b.smell - a.smell;
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  });

  const total = tests.length;
  const by_type = {};
  let sanctioned = 0;
  let classified = 0;
  for (const t of tests) {
    const key = t.type === null ? 'unclassified' : t.type;
    by_type[key] = (by_type[key] || 0) + 1;
    if (t.sanctioned) sanctioned++;
    if (t.type !== null) classified++;
  }

  const summary = {
    total,
    by_type,
    sanctioned,
    share_sanctioned: total === 0 ? 0 : sanctioned / total,
    classification_coverage: total === 0 ? 0 : classified / total,
  };

  const result = {
    schema: SCHEMA,
    scope: deriveScope(rootPath),
    tests,
    summary,
    unsupported_files,
  };

  // Disambiguate "no tests, all fine" from "tests exist but in unsupported
  // languages" (EC-006): only add the note when there is genuinely nothing to
  // analyze but foreign test files were seen.
  if (total === 0 && unsupported_files.length > 0) {
    const langs = supportedLanguageIds().join(', ');
    result.note =
      `no analyzable tests for supported languages (${langs}) — ` +
      `${unsupported_files.length} file(s) in unsupported languages skipped`;
  }

  return result;
}

// --- CLI shim ----------------------------------------------------------------
// Exposes discovery (manual inspection) and the `scan` subcommand that emits
// the full test-corpus/v1 contract.

function readSource(arg) {
  if (arg === '-') return fs.readFileSync(0, 'utf8');
  return fs.readFileSync(arg, 'utf8');
}

function runScan(argv) {
  const rootPath = argv[0];
  let testingArg = null;
  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === '--testing') {
      testingArg = argv[i + 1];
      i++;
    }
  }
  if (!rootPath || !testingArg) {
    process.stderr.write('usage: test-corpus.js scan <path> --testing <TESTING.md|->\n');
    return 1;
  }
  let testingDoc;
  try {
    testingDoc = readSource(testingArg);
  } catch (err) {
    process.stderr.write(`cannot read testing doc: ${err.message}\n`);
    return 1;
  }
  try {
    const result = analyze({ rootPath, testingDoc });
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    return 0;
  } catch (err) {
    process.stderr.write(`error: ${err.message}\n`);
    return 1;
  }
}

function main() {
  const [, , cmd, ...rest] = process.argv;
  if (cmd === 'discover') {
    const arg = rest[0];
    if (!arg) {
      process.stderr.write('usage: test-corpus.js discover <path>\n');
      return 1;
    }
    try {
      const result = discover(arg);
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      return 0;
    } catch (err) {
      process.stderr.write(`error: ${err.message}\n`);
      return 1;
    }
  }
  if (cmd === 'scan') {
    return runScan(rest);
  }
  process.stderr.write(
    'usage: test-corpus.js discover <path>\n' +
    '       test-corpus.js scan <path> --testing <TESTING.md|->\n',
  );
  return 1;
}

if (require.main === module) {
  process.exit(main());
}

module.exports = {
  SCHEMA,
  discover,
  classify,
  analyze,
};
