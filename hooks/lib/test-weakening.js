'use strict';

/**
 * hooks/lib/test-weakening.js
 *
 * Post-hoc detector: flag a test file that LOST assertions in a change — a
 * possible regression-hiding weakening (a failing test "fixed" by deleting or
 * loosening assertions instead of reverting the code). The assertion count is a
 * deterministic proxy (reused from the hooks/lib/lang/* adapters); whether a drop
 * is a legitimate consolidation or a real weakening is a JUDGMENT, so this is a
 * NON-BLOCKING test-review signal (never gates). Contract + rationale:
 * .verified/features/test-weakening-detection/{spec,discussion}.md.
 *
 *   analyze(entries) -> { schema, flagged[], not_analyzed[], note? }   (pure)
 *     entry = { file, before, after }   (content strings, or null when absent)
 *   scan(baseRef, cwd) -> contract      (owns git+fs IO; used by the CLI)
 *
 * A file is FLAGGED when its assertion count net-decreased base→change (a delete
 * → after 0, `removed: true`). New files and equal/higher counts are never
 * flagged. A file whose language has no adapter is `not_analyzed`, never flagged.
 */

const { adapterByExtension } = require('./lang-loader.js');

const SCHEMA = 'test-weakening/v1';

/**
 * @param {Array<{file:string, before:?string, after:?string}>} entries
 * @returns {{schema:string, flagged:Array, not_analyzed:Array, note?:string}}
 */
function analyze(entries) {
  const byExt = adapterByExtension();
  const path = require('path');
  const flagged = [];
  const not_analyzed = [];

  for (const { file, before, after } of entries || []) {
    const adapter = byExt[path.extname(file)];
    if (!adapter) {
      not_analyzed.push({ file, reason: `no adapter for ${path.extname(file) || '(no extension)'}` });
      continue;
    }
    if (before == null) {
      // No readable baseline → cannot establish a delta (the CLI passes only
      // modified/deleted files, so a null base means an unreadable base, EC-001).
      not_analyzed.push({ file, reason: 'unreadable base content' });
      continue;
    }
    const beforeN = adapter.countAssertions(before);
    const afterN = after == null ? 0 : adapter.countAssertions(after);
    if (afterN < beforeN) {
      flagged.push({
        file,
        lang: adapter.id,
        before: beforeN,
        after: afterN,
        delta: afterN - beforeN,
        removed: after == null,
      });
    }
  }
  return { schema: SCHEMA, flagged, not_analyzed };
}

// --- scan(): git+fs IO around the pure analyze -------------------------------

// Which globs mark a test file. Repo-declared taxonomy `match-paths` win — but
// ONLY when they come from the repo's own TESTING.md (`source: 'repo'`); the
// seed's match-paths are plugin-specific and would misclassify other languages.
// Otherwise use the per-language adapter `testFileGlobs`. Returns compiled
// RegExps (via the shared globToRegExp) so scan compiles each glob once.
function testMatchers(cwd) {
  const fs = require('fs');
  const path = require('path');
  const { loadAdapters, globToRegExp } = require('./lang-loader.js');
  let globs;
  try {
    const { resolve } = require('./taxonomy.js');
    const repoDoc = fs.readFileSync(path.join(cwd, '.verified', 'codebase', 'TESTING.md'), 'utf8');
    const res = resolve({ repoDoc });
    if (res.source === 'repo') {
      const repoGlobs = Object.values(res.types).flatMap(t => t.match_paths || []);
      if (repoGlobs.length) globs = repoGlobs;
    }
  } catch {
    /* no repo taxonomy — fall through to adapter globs */
  }
  if (!globs) globs = loadAdapters().flatMap(a => a.testFileGlobs || []);
  return globs.map(globToRegExp);
}

/**
 * Diff `baseRef` against the working tree, keep changed TEST files (excluding
 * added/renamed — an added test cannot be a weakening), resolve base content via
 * `git show` and current content via fs, and run `analyze`. Owns all IO; the pure
 * core stays seam-free. Never throws — a git failure yields an empty result note.
 *
 * @param {string} baseRef
 * @param {string} cwd  repo root
 * @returns {object} test-weakening/v1 contract
 */
function scan(baseRef, cwd) {
  // Reject an option-like ref (`-`-prefixed) before it reaches git argv — guards
  // against git option-injection (e.g. --output=<file>) even though baseRef is trusted.
  if (typeof baseRef !== 'string' || baseRef === '' || baseRef.startsWith('-')) {
    return { schema: SCHEMA, flagged: [], not_analyzed: [], note: `invalid base ref: ${baseRef}` };
  }
  const { spawnSync } = require('child_process');
  const fs = require('fs');
  const path = require('path');
  const git = args => {
    const r = spawnSync('git', args, { cwd, encoding: 'utf8', timeout: 15000, maxBuffer: 64 * 1024 * 1024 });
    return r && r.status === 0 ? r.stdout || '' : null;
  };
  const diff = git(['diff', '--name-status', baseRef]);
  if (diff == null) {
    return { schema: SCHEMA, flagged: [], not_analyzed: [], note: `could not diff against ${baseRef}` };
  }
  const matchers = testMatchers(cwd); // compiled RegExps
  const isTest = rel => matchers.some(re => re.test(rel));
  const entries = [];
  for (const line of diff.split('\n')) {
    if (!line.trim()) continue;
    const parts = line.split('\t');
    const status = parts[0][0];
    if (status === 'A' || status === 'R' || status === 'C') continue; // added/renamed/copied ≠ weakening
    const rel = parts[parts.length - 1];
    if (!isTest(rel)) continue;
    const before = git(['show', `${baseRef}:${rel}`]); // null if unreadable at base
    let after = null;
    if (status !== 'D') {
      try {
        after = fs.readFileSync(path.join(cwd, rel), 'utf8');
      } catch {
        after = null;
      }
    }
    entries.push({ file: rel, before, after });
  }
  return analyze(entries);
}

// --- CLI shim ----------------------------------------------------------------

function main() {
  const [, , cmd, baseRef] = process.argv;
  if (cmd !== 'scan' || !baseRef) {
    process.stderr.write('usage: test-weakening.js scan <base-ref>\n');
    return 1;
  }
  process.stdout.write(JSON.stringify(scan(baseRef, process.cwd()), null, 2) + '\n');
  return 0; // a signal, never a gate
}

if (require.main === module) {
  process.exit(main());
}

module.exports = { analyze, scan, testMatchers, SCHEMA };
