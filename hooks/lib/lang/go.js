'use strict';

/**
 * hooks/lib/lang/go.js
 *
 * The Go language adapter for the test-corpus analyzer. All Go-specific
 * knowledge lives here; the core (classify / rank / summary / scope) never sees
 * a language. The adapter contract (mirrored by every language adapter):
 *
 *   module.exports = {
 *     id:            'go',
 *     extensions:    ['.go'],            // files this adapter owns (drives the loader)
 *     testFileGlobs: ['**\/*_test.go'],  // human/tooling hint for "where tests live"
 *     discover(source, file) -> [{ name, line, body }],
 *     countAssertions(body)  -> number,
 *   };
 *
 *   • discover — finds every `func TestXxx(t *testing.T)` in a file's source and
 *     returns one record per test: the identifier `name`, the 1-based `line` of
 *     the declaration, and `body` — the source from the function's opening brace
 *     to its MATCHING close (brace-balanced via cfamily.scanBlock with Go's
 *     literal/comment rules, so braces inside strings/runes/comments don't
 *     count). The core attaches `file` and the assertion count.
 *   • countAssertions — Go testify dispersion signal: the count of `require.` /
 *     `assert.` member-access occurrences in a body.
 *
 * The presence of the `extensions` array is what tells the loader this module is
 * an adapter (cfamily.js, a shared helper, has none and is skipped).
 */

const { scanBlock } = require('./cfamily.js');

// A Go test declaration: `func TestXxx(t *testing.T)`. The receiver name is
// free (conventionally `t`), the type must be `*testing.T`. This deliberately
// excludes `TestMain(m *testing.M)` (wrong param type) and `ExampleXxx()`
// (wrong name + no param). The trailing `{` may sit on the next line, so we do
// not anchor on it here — scanBlock finds the opening brace.
const TEST_FUNC_RE = /^func\s+(Test[A-Z]\w*)\s*\(\s*\w+\s+\*testing\.T\s*\)/;

// Go literal/comment rules for the shared brace scanner:
//   • interpreted string "…"  — ends on an unescaped `"`.
//   • raw string         `…`  — ends on the next backtick; no escapes.
//   • rune literal       '…'  — ends on an unescaped `'`.
//   • line comment       // … — ends at the newline.
//   • block comment      /* … */ — ends at the close; no nesting.
const GO_SCAN_OPTS = {
  open: '{',
  close: '}',
  lineComment: '//',
  blockComment: { open: '/*', close: '*/' },
  strings: [
    { open: '"', close: '"', escape: '\\' },
    { open: '`', close: '`', raw: true },
    { open: "'", close: "'", escape: '\\' },
  ],
};

// Raw assertion member-access tokens whose dispersion across a body signals a
// test asserting many independent things (a craft smell, not a hard defect).
const ASSERTION_RE = /\b(?:require|assert)\./g;

/**
 * Discover Go test functions in a single .go file's source.
 *
 * @param {string} source  File contents.
 * @param {string} file    Path (unused by Go discovery; part of the contract).
 * @returns {Array<{name: string, line: number, body: string}>}
 */
function discover(source, file) {
  const tests = [];
  const lines = source.split(/\r?\n/);

  // Char offset of the start of each line, to seed scanBlock at the decl.
  let offset = 0;
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    const m = TEST_FUNC_RE.exec(line);
    if (m) {
      const span = scanBlock(source, offset, GO_SCAN_OPTS);
      if (span) {
        tests.push({
          name: m[1],
          line: li + 1, // 1-based decl line
          body: source.slice(span.open, span.close + 1),
        });
      }
      // An unbalanced function (no matching close) is skipped — not a test we
      // can reason about.
    }
    offset += line.length + 1; // +1 for the split newline
  }
  return tests;
}

/** Count raw require./assert. member-access occurrences in a body. */
function countAssertions(body) {
  const m = String(body || '').match(ASSERTION_RE);
  return m ? m.length : 0;
}

module.exports = {
  id: 'go',
  extensions: ['.go'],
  testFileGlobs: ['**/*_test.go'],
  discover,
  countAssertions,
};
