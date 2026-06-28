'use strict';

/**
 * Tests for the discovery half of the deterministic corpus lib
 * (hooks/lib/test-corpus.js — implemented in T007; classification/ranking
 * land in T008). This suite is RED until test-corpus.js exists.
 *
 * Discovery contract (T007 must satisfy):
 *
 *   const { discover } = require('../hooks/lib/test-corpus.js');
 *   discover(rootPath) -> {
 *     tests: [{ name, file, line, body }],   // one per Go `func TestXxx(t *testing.T)`
 *     unsupported_files: [<path>, ...],      // non-Go test files seen in scope
 *   }
 *
 *   • rootPath may be a directory (recursed) OR a single .go file (EC-008).
 *   • name  — the TestXxx identifier.
 *   • file  — path to the .go file the test was found in.
 *   • line  — 1-based line number of the `func TestXxx(...)` declaration.
 *   • body  — the source spanning the function's opening brace to its matching
 *             closing brace, brace-balanced. Braces inside string literals
 *             (interpreted "" and raw ``), rune literals, line comments (//)
 *             and block comments (/* *\/) MUST NOT be counted. The span must end
 *             at the true function close and never bleed into the next function.
 *   • Only `func TestXxx(t *testing.T)` qualifies. Plain funcs, helpers,
 *     `func TestMain(m *testing.M)`, and `func ExampleXxx()` are ignored.
 *   • A scope with no Go tests yields `tests: []` (EC-002).
 *   • Non-Go test files (e.g. *_test.py, *.test.ts) are reported in
 *     `unsupported_files` and are non-fatal (EC-006).
 *
 * Tests require the module lazily so each case fails individually with a
 * cannot-find-module error while the module is absent (RED), rather than
 * load-erroring the whole file.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const MODULE_PATH = path.join(__dirname, '..', 'hooks', 'lib', 'test-corpus.js');
const loadCorpus = () => require(MODULE_PATH);

// Create an isolated temp dir; caller cleans up in finally.
function mkTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'corpus-test-'));
}

function rmrf(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function write(dir, rel, content) {
  const full = path.join(dir, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
  return full;
}

function byName(tests) {
  const m = {};
  for (const t of tests) m[t.name] = t;
  return m;
}

// A minimal but valid `## Test Types` doc (fed to analyze as testingDoc, which
// passes it to taxonomy.resolve({ repoDoc })). Two types:
//   acceptance — claims tests under **/scenarios/** that use NewActor/Sends.
//   unit       — claims any *_test.go that uses raw require./assert.
// unit's path glob is broad, so a test is unclassified only when it carries
// NEITHER set of markers.
const TESTING_DOC = [
  '## Test Types',
  '',
  '### acceptance',
  '- **boundary:** public',
  '- **pattern:** actor-based DSL',
  '- **location:** scenarios',
  '- **tier:** default',
  '- **when-to-use:** default for user-observable behavior',
  '- **primitives:** NewActor, Sends',
  '- **match-paths:** **/scenarios/**',
  '- **match-markers:** NewActor, Sends',
  '',
  '```mermaid',
  'flowchart LR',
  '  a --> b',
  '```',
  '',
  '### unit',
  '- **boundary:** near the code',
  '- **pattern:** standard test',
  '- **location:** beside source',
  '- **tier:** sign-off',
  '- **when-to-use:** complex pure logic',
  '- **primitives:** require, assert',
  '- **match-paths:** **/*_test.go',
  '- **match-markers:** require., assert.',
  '',
  '```mermaid',
  'flowchart LR',
  '  a --> b',
  '```',
  '',
].join('\n');

module.exports = [
  {
    name: 'discover finds multiple TestXxx across a directory with name+file+line',
    fn: () => {
      const { discover } = loadCorpus();
      const dir = mkTmp();
      try {
        const fileA = write(dir, 'pkg/a_test.go', [
          'package pkg',                           // 1
          '',                                      // 2
          'import "testing"',                      // 3
          '',                                      // 4
          'func TestAlpha(t *testing.T) {',        // 5
          '\tif 1+1 != 2 {',                       // 6
          '\t\tt.Fatal("math")',                   // 7
          '\t}',                                   // 8
          '}',                                     // 9
          '',                                      // 10
          'func TestBeta(t *testing.T) {',         // 11
          '\tt.Log("beta")',                       // 12
          '}',                                     // 13
        ].join('\n') + '\n');

        const fileB = write(dir, 'pkg/b_test.go', [
          'package pkg',                           // 1
          '',                                      // 2
          'import "testing"',                      // 3
          '',                                      // 4
          'func TestGamma(t *testing.T) {',        // 5
          '\tt.Log("gamma")',                      // 6
          '}',                                     // 7
        ].join('\n') + '\n');

        const result = discover(dir);
        const tests = byName(result.tests);

        assert.deepEqual(
          Object.keys(tests).sort(),
          ['TestAlpha', 'TestBeta', 'TestGamma'],
        );

        assert.equal(tests.TestAlpha.file, fileA);
        assert.equal(tests.TestAlpha.line, 5);
        assert.equal(tests.TestBeta.file, fileA);
        assert.equal(tests.TestBeta.line, 11);
        assert.equal(tests.TestGamma.file, fileB);
        assert.equal(tests.TestGamma.line, 5);
      } finally {
        rmrf(dir);
      }
    },
  },

  {
    name: 'discover accepts a single .go file path, not only a directory (EC-008)',
    fn: () => {
      const { discover } = loadCorpus();
      const dir = mkTmp();
      try {
        const file = write(dir, 'solo_test.go', [
          'package solo',                          // 1
          'import "testing"',                      // 2
          'func TestSolo(t *testing.T) {',         // 3
          '\tt.Log("solo")',                       // 4
          '}',                                     // 5
        ].join('\n') + '\n');

        const result = discover(file);
        assert.equal(result.tests.length, 1);
        assert.equal(result.tests[0].name, 'TestSolo');
        assert.equal(result.tests[0].file, file);
        assert.equal(result.tests[0].line, 3);
      } finally {
        rmrf(dir);
      }
    },
  },

  {
    name: 'discover ignores non-Test funcs / TestMain / Example; no tests => [] (EC-002)',
    fn: () => {
      const { discover } = loadCorpus();
      const dir = mkTmp();
      try {
        // A real .go file with zero qualifying test funcs.
        write(dir, 'helpers_test.go', [
          'package pkg',
          'import "testing"',
          '',
          'func helper() int { return 41 }',
          '',
          'func TestMain(m *testing.M) {',
          '\tm.Run()',
          '}',
          '',
          'func ExampleThing() {',
          '\t// not a test',
          '}',
          '',
          'func notATest(t *testing.T) {',
          '\t_ = t',
          '}',
        ].join('\n') + '\n');

        // A plain non-test source file.
        write(dir, 'main.go', 'package pkg\nfunc Run() {}\n');

        const result = discover(dir);
        assert.deepEqual(result.tests, []);
      } finally {
        rmrf(dir);
      }
    },
  },

  {
    name: 'discover lists non-Go test files in unsupported_files, non-fatal (EC-006)',
    fn: () => {
      const { discover } = loadCorpus();
      const dir = mkTmp();
      try {
        const goFile = write(dir, 'a_test.go', [
          'package pkg',
          'import "testing"',
          'func TestKept(t *testing.T) {',
          '\tt.Log("kept")',
          '}',
        ].join('\n') + '\n');

        // Use permanently-unsupported languages (Ruby/Kotlin) so this stays valid
        // as Go/TS/Python/Java adapters are added.
        const pyFile = write(dir, 'thing_spec.rb', "describe('x') do\nend\n");
        const tsFile = write(dir, 'widget_spec.rb', "describe('w') do\nend\n");

        const result = discover(dir);

        // The Go test is still discovered — the foreign files do not abort the scan.
        assert.equal(result.tests.length, 1);
        assert.equal(result.tests[0].name, 'TestKept');
        assert.equal(result.tests[0].file, goFile);

        assert.ok(Array.isArray(result.unsupported_files), 'unsupported_files is an array');
        assert.ok(
          result.unsupported_files.includes(pyFile),
          `expected unsupported_files to include ${pyFile}, got ${JSON.stringify(result.unsupported_files)}`,
        );
        assert.ok(
          result.unsupported_files.includes(tsFile),
          `expected unsupported_files to include ${tsFile}, got ${JSON.stringify(result.unsupported_files)}`,
        );
      } finally {
        rmrf(dir);
      }
    },
  },

  {
    name: 'brace-balance: braces inside interpreted and raw string literals do not end the body',
    fn: () => {
      const { discover } = loadCorpus();
      const dir = mkTmp();
      try {
        const file = write(dir, 'strings_test.go', [
          'package pkg',
          'import "testing"',
          'func TestStrings(t *testing.T) {',
          '\ts := "{not a brace}"',
          '\tr := `{"json":"{}"}`',
          '\t_ = s',
          '\t_ = r',
          '\tlastStmtSentinel := 1 // STRINGS_SENTINEL',
          '\t_ = lastStmtSentinel',
          '}',
          '',
          'func TestNextOne(t *testing.T) {',
          '\tt.Log("NEXT_FUNC_MARKER")',
          '}',
        ].join('\n') + '\n');

        const result = discover(file);
        const tests = byName(result.tests);

        assert.ok(tests.TestStrings, 'TestStrings discovered');
        assert.ok(tests.TestNextOne, 'TestNextOne discovered');

        const body = tests.TestStrings.body;
        // The body must reach the real last statement before the close...
        assert.ok(body.includes('STRINGS_SENTINEL'), 'body reaches the last statement');
        // ...and must NOT have stopped early on a string-literal brace, nor run
        // past the function close into the next function.
        assert.ok(!body.includes('NEXT_FUNC_MARKER'), 'body does not bleed into the next func');
      } finally {
        rmrf(dir);
      }
    },
  },

  {
    name: 'brace-balance: nested t.Run(func(t *testing.T){...}) closure is spanned correctly',
    fn: () => {
      const { discover } = loadCorpus();
      const dir = mkTmp();
      try {
        const file = write(dir, 'subtests_test.go', [
          'package pkg',
          'import "testing"',
          'func TestWithSubtests(t *testing.T) {',
          '\tt.Run("inner", func(t *testing.T) {',
          '\t\tif false {',
          '\t\t\tt.Fatal("never")',
          '\t\t}',
          '\t})',
          '\touterSentinel := true // SUBTEST_SENTINEL',
          '\t_ = outerSentinel',
          '}',
          '',
          'func TestAfterSubtests(t *testing.T) {',
          '\tt.Log("AFTER_MARKER")',
          '}',
        ].join('\n') + '\n');

        const result = discover(file);
        const tests = byName(result.tests);

        assert.ok(tests.TestWithSubtests, 'TestWithSubtests discovered');
        assert.ok(tests.TestAfterSubtests, 'TestAfterSubtests discovered');

        const body = tests.TestWithSubtests.body;
        assert.ok(body.includes('t.Run("inner"'), 'body includes the nested closure');
        assert.ok(body.includes('SUBTEST_SENTINEL'), 'body reaches the statement after the closure');
        assert.ok(!body.includes('AFTER_MARKER'), 'body does not bleed into the next func');
      } finally {
        rmrf(dir);
      }
    },
  },

  {
    name: 'brace-balance: braces inside block and line comments do not end the body',
    fn: () => {
      const { discover } = loadCorpus();
      const dir = mkTmp();
      try {
        const file = write(dir, 'comments_test.go', [
          'package pkg',
          'import "testing"',
          'func TestComments(t *testing.T) {',
          '\t/* unbalanced } in a block comment */',
          '\t// a stray } in a line comment',
          '\tx := 1',
          '\t_ = x',
          '\tafterComments := 2 // COMMENT_SENTINEL',
          '\t_ = afterComments',
          '}',
          '',
          'func TestPostComments(t *testing.T) {',
          '\tt.Log("POST_MARKER")',
          '}',
        ].join('\n') + '\n');

        const result = discover(file);
        const tests = byName(result.tests);

        assert.ok(tests.TestComments, 'TestComments discovered');
        assert.ok(tests.TestPostComments, 'TestPostComments discovered');

        const body = tests.TestComments.body;
        assert.ok(body.includes('COMMENT_SENTINEL'), 'body reaches the last statement past the comments');
        assert.ok(!body.includes('POST_MARKER'), 'body does not bleed into the next func');
      } finally {
        rmrf(dir);
      }
    },
  },

  // ---------------------------------------------------------------------------
  // Classification (T005 RED → T008 GREEN).
  //
  // Contract (T008 must satisfy):
  //
  //   const { classify } = require('../hooks/lib/test-corpus.js');
  //   classify(test, types) -> { type, sanctioned, ambiguous, matched_markers }
  //
  //   • test  — a discovered { name, file, body } record. classify ONLY sees
  //             test.body for marker matching — never the surrounding file. The
  //             body is exactly what discover() captured (EC-007).
  //   • types — the resolved taxonomy `types` map (taxonomy.resolve().types):
  //             { <name>: { match_paths: string[] (globs),
  //                         match_markers: string[] (tokens), ... } }.
  //
  //   Candidacy: a type CLAIMS a test iff
  //       (a) match_paths is non-empty AND one of its globs matches test.file, AND
  //       (b) match_markers is non-empty AND ≥1 marker token appears in test.body.
  //     A type whose match_paths OR match_markers is [] can never claim (EC-004).
  //
  //   Return:
  //     • type            — winning type name, or null when no type claims.
  //     • sanctioned      — true iff some type claimed the test (AS-003);
  //                         false → unclassified (AS-004).
  //     • ambiguous       — true iff more than one type claimed the test
  //                         (contention surfaced — EC-003 / FR-015); a stable
  //                         winner is still chosen.
  //     • matched_markers — the marker tokens the WINNING type matched in body.
  //
  //   Deterministic winner among ≥2 claimants:
  //     1. most markers matched in body, then
  //     2. most-specific path (more literal/non-wildcard characters in the
  //        winning glob; fewer `*`), then
  //     3. type name ascending (final stable tiebreak).
  //
  //   Glob matcher: `*` matches within a single path segment (not `/`);
  //   `**` matches across segments (including `/`); other chars are literal.
  // ---------------------------------------------------------------------------

  {
    name: 'classify: path glob + body marker match => that type, sanctioned (AS-003)',
    fn: () => {
      const { classify } = loadCorpus();
      const types = {
        acceptance: {
          match_paths: ['**/scenarios/**'],
          match_markers: ['NewActor', 'Sends'],
        },
        unit: {
          match_paths: ['**/internal/**'],
          match_markers: ['require.'],
        },
      };
      const test = {
        name: 'TestCheckout',
        file: 'app/features/scenarios/checkout_test.go',
        body: 'a := NewActor(t)\na.Sends(Order{})\n',
      };

      const result = classify(test, types);
      assert.equal(result.type, 'acceptance');
      assert.equal(result.sanctioned, true);
      assert.equal(result.ambiguous, false);
      assert.deepEqual(result.matched_markers.sort(), ['NewActor', 'Sends']);
    },
  },

  {
    name: 'classify: no path+marker match => unclassified (type:null, AS-004)',
    fn: () => {
      const { classify } = loadCorpus();
      const types = {
        acceptance: {
          match_paths: ['**/scenarios/**'],
          match_markers: ['NewActor'],
        },
        unit: {
          match_paths: ['**/internal/**'],
          match_markers: ['require.'],
        },
      };
      const test = {
        name: 'TestOrphan',
        file: 'app/handlers/orphan_test.go', // matches neither path
        body: 'x := 1\n_ = x\n',             // matches neither marker
      };

      const result = classify(test, types);
      assert.equal(result.type, null);
      assert.equal(result.sanctioned, false);
      assert.equal(result.ambiguous, false);
      assert.deepEqual(result.matched_markers, []);
    },
  },

  {
    name: 'classify: marker present only outside the captured body does not classify (EC-007)',
    fn: () => {
      const { classify } = loadCorpus();
      const types = {
        acceptance: {
          match_paths: ['**/scenarios/**'],
          match_markers: ['NewActor'],
        },
      };
      // The marker `NewActor` lives in a helper elsewhere in the file, NOT in
      // this test's body. classify only sees test.body, so it must not match.
      const test = {
        name: 'TestNoMarkerInBody',
        file: 'app/scenarios/thing_test.go',
        body: 'helper(t)\n_ = t\n', // no NewActor here
      };

      const result = classify(test, types);
      assert.equal(result.type, null);
      assert.equal(result.sanctioned, false);
      assert.deepEqual(result.matched_markers, []);
    },
  },

  {
    name: 'classify: multi-type match => deterministic winner (more markers/specificity), ambiguous flagged (EC-003, FR-015)',
    fn: () => {
      const { classify } = loadCorpus();
      // Both types claim the test. `acceptance` matches a more specific path
      // AND two markers; `broad` matches a wildcard path and a single marker.
      const types = {
        acceptance: {
          match_paths: ['app/features/scenarios/*_test.go'],
          match_markers: ['NewActor', 'Sends'],
        },
        broad: {
          match_paths: ['**/*_test.go'],
          match_markers: ['NewActor'],
        },
      };
      const test = {
        name: 'TestBoth',
        file: 'app/features/scenarios/checkout_test.go',
        body: 'a := NewActor(t)\na.Sends(Order{})\n',
      };

      const result = classify(test, types);
      // Winner is the more-specific, more-markers type, and stable across runs.
      assert.equal(result.type, 'acceptance');
      assert.equal(result.sanctioned, true);
      assert.equal(result.ambiguous, true, 'contention between >1 claiming type is flagged');
      assert.deepEqual(result.matched_markers.sort(), ['NewActor', 'Sends']);

      // Stability: classifying again yields the identical winner.
      const again = classify(test, types);
      assert.equal(again.type, 'acceptance');
      assert.equal(again.ambiguous, true);
    },
  },

  {
    name: 'classify: a type with empty match_paths/match_markers cannot claim a test (EC-004)',
    fn: () => {
      const { classify } = loadCorpus();
      const types = {
        // No signals at all — must never claim anything.
        noSignals: { match_paths: [], match_markers: [] },
        // Has a path glob but no markers — still cannot claim (both required).
        pathOnly: { match_paths: ['**/scenarios/**'], match_markers: [] },
        // Has markers but no path glob — still cannot claim.
        markerOnly: { match_paths: [], match_markers: ['NewActor'] },
      };
      const test = {
        name: 'TestUnclaimable',
        file: 'app/scenarios/thing_test.go',
        body: 'a := NewActor(t)\n_ = a\n', // would match markerOnly's token
      };

      const result = classify(test, types);
      assert.equal(result.type, null);
      assert.equal(result.sanctioned, false);
      assert.equal(result.ambiguous, false);
      assert.deepEqual(result.matched_markers, []);
    },
  },

  {
    name: 'classify: glob semantics — ** spans path segments, * stays within one',
    fn: () => {
      const { classify } = loadCorpus();

      // `**/scenarios/**` must match a deeply nested path.
      const deepTypes = {
        acceptance: { match_paths: ['**/scenarios/**'], match_markers: ['M'] },
      };
      const deep = classify(
        { name: 'TestDeep', file: 'a/b/scenarios/x_test.go', body: 'M\n' },
        deepTypes,
      );
      assert.equal(deep.type, 'acceptance', '** matches across path segments');

      // `*_test.go` (single-segment *) matches a bare filename...
      const segTypes = {
        unit: { match_paths: ['*_test.go'], match_markers: ['M'] },
      };
      const flat = classify(
        { name: 'TestFlat', file: 'foo_test.go', body: 'M\n' },
        segTypes,
      );
      assert.equal(flat.type, 'unit', '* matches within a single segment');

      // ...but `*` must NOT cross a `/`: a nested file does not match `*_test.go`.
      const nested = classify(
        { name: 'TestNested', file: 'pkg/foo_test.go', body: 'M\n' },
        segTypes,
      );
      assert.equal(nested.type, null, '* does not cross a path separator');
    },
  },

  // ---------------------------------------------------------------------------
  // Top-level corpus analysis (T006 RED → T008 GREEN).
  //
  // Contract (T008 must satisfy):
  //
  //   const { analyze, SCHEMA } = require('../hooks/lib/test-corpus.js');
  //   SCHEMA === 'test-corpus/v1'
  //   analyze({ rootPath, testingDoc }) -> {
  //     schema: 'test-corpus/v1',
  //     scope: <string>,
  //     tests: [{ name, file, line, type, sanctioned, smell, signals, ambiguous }],
  //                                                  // ranked WORST-FIRST (smell desc)
  //     summary: {
  //       total: <int>,
  //       by_type: { <typeName>: <int>, unclassified: <int> },
  //       sanctioned: <int>,
  //       share_sanctioned: <0..1>,
  //       classification_coverage: <0..1>,
  //     },
  //     unsupported_files: [<path>, ...],
  //   }
  //
  //   • testingDoc — the repo `## Test Types` markdown, passed straight to
  //     taxonomy.resolve({ repoDoc: testingDoc }); its types drive classify().
  //   • Each test.signals is an OBJECT recording the mechanical smell
  //     contributors. Vocabulary (T008 must emit exactly these keys):
  //       - unclassified         : boolean — true iff type === null.
  //       - assertion_dispersion : number  — count of raw `require.`/`assert.`
  //                                          member-access occurrences in body.
  //       - length               : number  — body length in lines.
  //       - weak_match           : boolean — classified but matched only a
  //                                          weak share of the type's markers.
  //   • smell — a non-negative number combining the signals; HIGHER = worse.
  //     Tests assert ORDER and relative magnitude, never exact scores.
  //   • by_type — one bucket per inferred type name PLUS an `unclassified`
  //     bucket (the chosen key for type === null).
  //   • sanctioned (count) === number of tests with sanctioned === true.
  //     share_sanctioned === sanctioned / total.
  //     classification_coverage === (# tests with type !== null) / total.
  //     (In this lib sanctioned ⇔ type !== null, so the two fractions coincide;
  //      both are asserted consistent with the tests array, not hard-pinned.)
  //   • scope — derived from rootPath: a DIRECTORY → its basename
  //     (`internal/analytics` → `analytics`); a FILE → the basename of its
  //     parent directory (`analytics/x_test.go` → `analytics`).
  //   • analyze is deterministic: identical inputs → deeply-equal output (FR-014).
  // ---------------------------------------------------------------------------

  {
    name: 'analyze: SCHEMA export and documented top-level shape (test-corpus/v1)',
    fn: () => {
      const mod = loadCorpus();
      const { analyze, SCHEMA } = mod;
      assert.equal(SCHEMA, 'test-corpus/v1', 'SCHEMA constant export');

      const dir = mkTmp();
      try {
        write(dir, 'scenarios/clean_test.go', [
          'package scn',
          'import "testing"',
          'func TestClean(t *testing.T) {',
          '\ta := NewActor(t)',
          '\ta.Sends(Order{})',
          '}',
        ].join('\n') + '\n');

        const result = analyze({ rootPath: dir, testingDoc: TESTING_DOC });

        assert.equal(result.schema, 'test-corpus/v1');
        assert.deepEqual(
          Object.keys(result).sort(),
          ['schema', 'scope', 'summary', 'tests', 'unsupported_files'],
        );
        assert.ok(Array.isArray(result.tests));
        assert.deepEqual(
          Object.keys(result.summary).sort(),
          ['by_type', 'classification_coverage', 'sanctioned', 'share_sanctioned', 'total'],
        );

        const t = result.tests[0];
        assert.deepEqual(
          Object.keys(t).sort(),
          ['ambiguous', 'file', 'line', 'name', 'sanctioned', 'signals', 'smell', 'type'],
        );
        assert.deepEqual(
          Object.keys(t.signals).sort(),
          ['assertion_dispersion', 'length', 'unclassified', 'weak_match'],
        );
      } finally {
        rmrf(dir);
      }
    },
  },

  {
    name: 'analyze: ranks the bad test before the clean sanctioned one, worst-first (AS-014)',
    fn: () => {
      const { analyze } = loadCorpus();
      const dir = mkTmp();
      try {
        // Clean, sanctioned: matches acceptance (path+markers), short, no raw asserts.
        write(dir, 'scenarios/clean_test.go', [
          'package scn',
          'import "testing"',
          'func TestClean(t *testing.T) {',
          '\ta := NewActor(t)',
          '\ta.Sends(Order{})',
          '}',
        ].join('\n') + '\n');

        // Bad: unclassified (no markers of either type) AND very long.
        const longBody = [];
        for (let i = 0; i < 40; i++) longBody.push(`\tx${i} := ${i}`);
        for (let i = 0; i < 40; i++) longBody.push(`\t_ = x${i}`);
        write(dir, 'pkg/bad_test.go', [
          'package pkg',
          'import "testing"',
          'func TestBad(t *testing.T) {',
          ...longBody,
          '}',
        ].join('\n') + '\n');

        const result = analyze({ rootPath: dir, testingDoc: TESTING_DOC });
        const order = result.tests.map((t) => t.name);

        assert.ok(
          order.indexOf('TestBad') < order.indexOf('TestClean'),
          `expected TestBad before TestClean, got ${JSON.stringify(order)}`,
        );

        const bad = result.tests.find((t) => t.name === 'TestBad');
        const clean = result.tests.find((t) => t.name === 'TestClean');
        assert.equal(bad.sanctioned, false);
        assert.equal(clean.sanctioned, true);
        assert.ok(bad.smell > clean.smell, `bad.smell (${bad.smell}) > clean.smell (${clean.smell})`);
      } finally {
        rmrf(dir);
      }
    },
  },

  {
    name: 'analyze: signals record the mechanical contributors (unclassified, assertion_dispersion)',
    fn: () => {
      const { analyze } = loadCorpus();
      const dir = mkTmp();
      try {
        // Unclassified test — no markers of either type.
        write(dir, 'pkg/orphan_test.go', [
          'package pkg',
          'import "testing"',
          'func TestOrphan(t *testing.T) {',
          '\tx := 1',
          '\t_ = x',
          '}',
        ].join('\n') + '\n');

        // Assertion-heavy but classified (unit: matches *_test.go + require.).
        const calls = [];
        for (let i = 0; i < 8; i++) calls.push(`\trequire.Equal(t, ${i}, ${i})`);
        write(dir, 'pkg/heavy_test.go', [
          'package pkg',
          'import "testing"',
          'func TestHeavy(t *testing.T) {',
          ...calls,
          '}',
        ].join('\n') + '\n');

        const result = analyze({ rootPath: dir, testingDoc: TESTING_DOC });
        const orphan = result.tests.find((t) => t.name === 'TestOrphan');
        const heavy = result.tests.find((t) => t.name === 'TestHeavy');

        // Unclassified marker present and set.
        assert.equal(orphan.type, null);
        assert.equal(orphan.signals.unclassified, true);
        assert.equal(orphan.signals.assertion_dispersion, 0);

        // Assertion count reflected in the dispersion signal — exactly the 8
        // `require.Equal` calls in the fixture (adapter-provided count).
        assert.equal(heavy.signals.unclassified, false);
        assert.equal(
          heavy.signals.assertion_dispersion,
          8,
          `expected assertion_dispersion === 8, got ${heavy.signals.assertion_dispersion}`,
        );
        assert.ok(
          heavy.signals.assertion_dispersion > orphan.signals.assertion_dispersion,
          'heavy disperses more raw asserts than the orphan',
        );
      } finally {
        rmrf(dir);
      }
    },
  },

  {
    name: 'analyze: summary stats are consistent with the tests array (AS-008)',
    fn: () => {
      const { analyze } = loadCorpus();
      const dir = mkTmp();
      try {
        // One sanctioned (acceptance), one unclassified.
        write(dir, 'scenarios/clean_test.go', [
          'package scn',
          'import "testing"',
          'func TestClean(t *testing.T) {',
          '\ta := NewActor(t)',
          '\ta.Sends(Order{})',
          '}',
        ].join('\n') + '\n');
        write(dir, 'pkg/orphan_test.go', [
          'package pkg',
          'import "testing"',
          'func TestOrphan(t *testing.T) {',
          '\tx := 1',
          '\t_ = x',
          '}',
        ].join('\n') + '\n');

        const result = analyze({ rootPath: dir, testingDoc: TESTING_DOC });
        const { summary, tests } = result;

        // total matches the tests array.
        assert.equal(summary.total, tests.length);
        assert.equal(summary.total, 2);

        // by_type buckets (incl. the `unclassified` key) reconstruct from tests.
        const expectedByType = {};
        for (const t of tests) {
          const key = t.type === null ? 'unclassified' : t.type;
          expectedByType[key] = (expectedByType[key] || 0) + 1;
        }
        assert.deepEqual(summary.by_type, expectedByType);
        assert.equal(summary.by_type.acceptance, 1);
        assert.equal(summary.by_type.unclassified, 1);

        // sanctioned count + fractions derived from the tests, all in [0,1].
        const sanctionedCount = tests.filter((t) => t.sanctioned).length;
        const classifiedCount = tests.filter((t) => t.type !== null).length;
        assert.equal(summary.sanctioned, sanctionedCount);
        assert.equal(summary.share_sanctioned, sanctionedCount / summary.total);
        assert.equal(summary.classification_coverage, classifiedCount / summary.total);
        assert.equal(summary.share_sanctioned, 0.5);
        for (const frac of [summary.share_sanctioned, summary.classification_coverage]) {
          assert.ok(frac >= 0 && frac <= 1, `fraction in [0,1], got ${frac}`);
        }
      } finally {
        rmrf(dir);
      }
    },
  },

  {
    name: 'analyze: scope is the directory leaf — internal/analytics => "analytics" (FR-006)',
    fn: () => {
      const { analyze } = loadCorpus();
      const dir = mkTmp();
      try {
        const scopeDir = path.join(dir, 'internal', 'analytics');
        write(dir, 'internal/analytics/a_test.go', [
          'package analytics',
          'import "testing"',
          'func TestA(t *testing.T) {',
          '\ta := NewActor(t)',
          '\ta.Sends(X{})',
          '}',
        ].join('\n') + '\n');

        const dirResult = analyze({ rootPath: scopeDir, testingDoc: TESTING_DOC });
        assert.equal(dirResult.scope, 'analytics', 'directory rootPath => its basename');

        // A single FILE path => the basename of its parent directory.
        const fileResult = analyze({
          rootPath: path.join(scopeDir, 'a_test.go'),
          testingDoc: TESTING_DOC,
        });
        assert.equal(fileResult.scope, 'analytics', 'file rootPath => parent dir basename');
      } finally {
        rmrf(dir);
      }
    },
  },

  {
    name: 'analyze: deterministic — identical inputs yield deeply-equal output (FR-014)',
    fn: () => {
      const { analyze } = loadCorpus();
      const dir = mkTmp();
      try {
        write(dir, 'scenarios/clean_test.go', [
          'package scn',
          'import "testing"',
          'func TestClean(t *testing.T) {',
          '\ta := NewActor(t)',
          '\ta.Sends(Order{})',
          '}',
        ].join('\n') + '\n');
        write(dir, 'pkg/orphan_test.go', [
          'package pkg',
          'import "testing"',
          'func TestOrphan(t *testing.T) {',
          '\tx := 1',
          '\t_ = x',
          '}',
        ].join('\n') + '\n');

        const first = analyze({ rootPath: dir, testingDoc: TESTING_DOC });
        const second = analyze({ rootPath: dir, testingDoc: TESTING_DOC });
        assert.deepEqual(first, second);
      } finally {
        rmrf(dir);
      }
    },
  },

  // ---------------------------------------------------------------------------
  // Boundary coverage added by the review (review.md "test" warning).
  // ---------------------------------------------------------------------------

  {
    name: 'analyze: empty corpus with ONLY unsupported files => total 0, zeroed fractions, explicit note (EC-006)',
    fn: () => {
      const { analyze } = loadCorpus();
      const dir = mkTmp();
      try {
        // No analyzable (supported-language) tests; only foreign test files
        // (Ruby/Kotlin — permanently unsupported, so this holds as adapters are added).
        write(dir, 'thing_spec.rb', "describe('x') do\nend\n");
        write(dir, 'widget_spec.rb', "describe('w') do\nend\n");

        const result = analyze({ rootPath: dir, testingDoc: TESTING_DOC });

        assert.deepEqual(result.tests, []);
        assert.equal(result.summary.total, 0);
        assert.equal(result.summary.sanctioned, 0);
        assert.equal(result.summary.share_sanctioned, 0);
        assert.equal(result.summary.classification_coverage, 0);
        assert.deepEqual(result.summary.by_type, {});

        // The note disambiguates "tests fine" from "tests we cannot read".
        assert.equal(typeof result.note, 'string', 'note present when only unsupported files exist');
        // Tolerant of additional adapters being registered (java, python, …):
        // the note must name the supported-language list and include `go`.
        assert.ok(/supported languages \([^)]*\bgo\b[^)]*\)/.test(result.note), `note names supported langs, got: ${result.note}`);
        assert.ok(result.note.includes('2'), `note counts the 2 skipped files, got: ${result.note}`);
        assert.equal(result.unsupported_files.length, 2);
      } finally {
        rmrf(dir);
      }
    },
  },

  {
    name: 'analyze: empty corpus with NO unsupported files => total 0 and NO note',
    fn: () => {
      const { analyze } = loadCorpus();
      const dir = mkTmp();
      try {
        // A supported-language file that simply has no tests, nothing foreign.
        write(dir, 'main.go', 'package pkg\nfunc Run() {}\n');

        const result = analyze({ rootPath: dir, testingDoc: TESTING_DOC });

        assert.deepEqual(result.tests, []);
        assert.equal(result.summary.total, 0);
        assert.equal(result.unsupported_files.length, 0);
        assert.ok(!('note' in result), 'no note when nothing was skipped');
        // Top-level shape stays the documented 5 keys when no note is added.
        assert.deepEqual(
          Object.keys(result).sort(),
          ['schema', 'scope', 'summary', 'tests', 'unsupported_files'],
        );
      } finally {
        rmrf(dir);
      }
    },
  },

  {
    name: 'analyze: weak_match === true when the winning type matched a weak share of its markers',
    fn: () => {
      const { analyze } = loadCorpus();
      // acceptance declares THREE markers but the body carries only ONE
      // (1/3 < 0.5 threshold) => classified, sanctioned, but weak_match flagged.
      const doc = [
        '## Test Types',
        '',
        '### acceptance',
        '- **boundary:** public',
        '- **pattern:** actor-based DSL',
        '- **location:** scenarios',
        '- **tier:** default',
        '- **when-to-use:** default',
        '- **primitives:** NewActor, Sends, Expects',
        '- **match-paths:** **/scenarios/**',
        '- **match-markers:** NewActor, Sends, Expects',
        '',
      ].join('\n');

      const dir = mkTmp();
      try {
        write(dir, 'scenarios/weak_test.go', [
          'package scn',
          'import "testing"',
          'func TestWeak(t *testing.T) {',
          '\ta := NewActor(t)',     // only 1 of 3 markers present
          '\t_ = a',
          '}',
        ].join('\n') + '\n');

        const result = analyze({ rootPath: dir, testingDoc: doc });
        const weak = result.tests.find((t) => t.name === 'TestWeak');

        assert.equal(weak.type, 'acceptance', 'still classified');
        assert.equal(weak.sanctioned, true, 'default-tier type => sanctioned');
        assert.equal(weak.signals.weak_match, true, 'matched only 1/3 markers => weak_match');
      } finally {
        rmrf(dir);
      }
    },
  },

  {
    name: 'analyze: sanctioned is tier-aware — a sign-off-tier classification is classified but NOT sanctioned',
    fn: () => {
      const { analyze } = loadCorpus();
      const dir = mkTmp();
      try {
        // unit (tier: sign-off in TESTING_DOC) claims this *_test.go via require.
        write(dir, 'pkg/unit_test.go', [
          'package pkg',
          'import "testing"',
          'func TestUnit(t *testing.T) {',
          '\trequire.Equal(t, 1, 1)',
          '}',
        ].join('\n') + '\n');

        const result = analyze({ rootPath: dir, testingDoc: TESTING_DOC });
        const unit = result.tests.find((t) => t.name === 'TestUnit');

        assert.equal(unit.type, 'unit', 'classified as the sign-off-tier type');
        assert.equal(unit.sanctioned, false, 'sign-off tier => NOT sanctioned');

        // Hence the two metrics legitimately DIVERGE on this corpus.
        assert.equal(result.summary.classification_coverage, 1, 'all tests classified');
        assert.equal(result.summary.share_sanctioned, 0, 'none sanctioned (all sign-off)');
        assert.notEqual(
          result.summary.share_sanctioned,
          result.summary.classification_coverage,
          'tier-awareness lets share_sanctioned differ from classification_coverage',
        );
      } finally {
        rmrf(dir);
      }
    },
  },

  {
    name: 'brace-balance: a rune literal holding an open brace (c := \'{\') does not unbalance the body',
    fn: () => {
      const { discover } = loadCorpus();
      const dir = mkTmp();
      try {
        const file = write(dir, 'rune_test.go', [
          'package pkg',
          'import "testing"',
          'func TestRune(t *testing.T) {',
          "\tc := '{'",
          '\t_ = c',
          '\tsentinel := 1 // RUNE_SENTINEL',
          '\t_ = sentinel',
          '}',
          '',
          'func TestAfterRune(t *testing.T) {',
          '\tt.Log("AFTER_RUNE_MARKER")',
          '}',
        ].join('\n') + '\n');

        const result = discover(file);
        const tests = byName(result.tests);

        assert.ok(tests.TestRune, 'TestRune discovered');
        assert.ok(tests.TestAfterRune, 'TestAfterRune discovered');
        assert.ok(tests.TestRune.body.includes('RUNE_SENTINEL'), 'body reaches its last statement');
        assert.ok(!tests.TestRune.body.includes('AFTER_RUNE_MARKER'), 'rune brace did not unbalance into next func');
      } finally {
        rmrf(dir);
      }
    },
  },

  {
    name: 'brace-balance: an unbalanced function (no matching close) is skipped, not emitted',
    fn: () => {
      const { discover } = loadCorpus();
      const dir = mkTmp();
      try {
        // The function never closes: func{ -> if{ -> } leaves depth 1 at EOF.
        const file = write(dir, 'unbalanced_test.go', [
          'package pkg',
          'import "testing"',
          'func TestUnbalanced(t *testing.T) {',
          '\tif true {',
          '\t\tx := 1',
          '\t\t_ = x',
          '\t}',
        ].join('\n') + '\n');

        const result = discover(file);
        assert.deepEqual(result.tests, [], 'unbalanced function produces no test record');
      } finally {
        rmrf(dir);
      }
    },
  },
];
