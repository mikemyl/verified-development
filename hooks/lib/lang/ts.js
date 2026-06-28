'use strict';

/**
 * hooks/lib/lang/ts.js
 *
 * The TypeScript/JavaScript language adapter for the test-corpus analyzer. It
 * mirrors the Go adapter (go.js) and the shared adapter contract: per-language
 * knowledge lives here; the core (classify / rank / summary / scope) never sees
 * a language.
 *
 *   module.exports = {
 *     id:            'typescript',
 *     extensions:    ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'],
 *     testFileGlobs: ['**\/*.test.[jt]s?(x)', '**\/*.spec.[jt]s?(x)'],
 *     discover(source, file) -> [{ name, line, body }],
 *     countAssertions(body)  -> number,
 *   };
 *
 *   • discover — finds every `it(...)` / `test(...)` case (including `.only`,
 *     `.skip`, `.concurrent`, `.each`, … via the optional `.member`) in a file's
 *     source. For each it returns the quoted first-arg as `name`, the 1-based
 *     `line` of the call, and `body`. `body` is the callback's brace-balanced
 *     block (via cfamily.scanBlock, so braces inside strings / template literals
 *     / comments do not end it). A single-expression arrow callback (no brace
 *     block, e.g. `it('x', () => expect(1).toBe(1))`) captures the arrow's RHS
 *     up to the call's closing paren. `describe(...)` blocks GROUP tests and are
 *     not emitted; tests nested inside them are still found (the whole file is
 *     scanned, one record per it/test). The core attaches `file` and the
 *     assertion count.
 *   • countAssertions — count of `expect(` occurrences plus `assert(` / `assert.`
 *     occurrences in a body (the TS/JS dispersion signal).
 *
 * Template-literal caveat: backticks are treated as RAW strings for brace
 * balancing, so a literal containing `${ ... }` interpolation is not parsed for
 * the braces inside the interpolation. This is acceptable for brace-balance
 * (the common case — `\`text {x}\`` — is handled; interpolated braces are rare
 * in test bodies and at worst affect a single body's span, never another test's).
 *
 * The presence of the `extensions` array is what marks this module as an
 * adapter to the loader (cfamily.js, a shared helper, has none and is skipped).
 */

const { scanBlock } = require('./cfamily.js');

// A test-case call: `it(`, `test(`, or a member variant (`it.only(`,
// `test.skip(`, `it.concurrent(`, `it.each(`, …), with the opening quote of the
// first (name) argument. `\b` keeps `it`/`test` from matching inside words like
// `unit` or `latest`. Captures the quote char so the name string can be read
// with the matching delimiter. `describe(` deliberately does NOT match — it
// groups tests, it is not a test.
const TEST_CALL_RE = /\b(?:it|test)(?:\.\w+)?\s*\(\s*(['"`])/g;

// TS/JS comment + string rules for the shared brace scanner. Backtick template
// literals are treated as raw (see the module header caveat on interpolation).
const TS_BRACE_OPTS = {
  open: '{',
  close: '}',
  lineComment: '//',
  blockComment: { open: '/*', close: '*/' },
  strings: [
    { open: '"', close: '"', escape: '\\' },
    { open: "'", close: "'", escape: '\\' },
    { open: '`', close: '`', raw: true },
  ],
};

// Same string/comment rules, but scanning a PARENTHESISED call so we can find
// the bounds of a single it()/test() call (used for the single-expression arrow
// case, and to bound the search for the callback brace).
const TS_PAREN_OPTS = Object.assign({}, TS_BRACE_OPTS, { open: '(', close: ')' });

// Assertion tokens whose dispersion across a body signals a test asserting many
// independent things: `expect(`, `assert(`, and `assert.` member access.
const ASSERTION_RE = /\bexpect\(|\bassert(?:\(|\.)/g;

/**
 * Read a quoted/backtick string starting at the opening delimiter `openIdx`.
 * Honours `\`-escapes for `'`/`"`; backtick is raw (no escapes). Returns the
 * unescaped value and the index just past the closing delimiter, or null when
 * the string is unterminated.
 *
 * @param {string} source
 * @param {number} openIdx  Index of the opening quote/backtick.
 * @param {string} quote    The delimiter character.
 * @returns {?{value: string, end: number}}
 */
function readString(source, openIdx, quote) {
  const raw = quote === '`';
  let value = '';
  let j = openIdx + 1;
  while (j < source.length) {
    const ch = source[j];
    if (!raw && ch === '\\') {
      value += source[j + 1] || '';
      j += 2;
      continue;
    }
    if (ch === quote) return { value, end: j + 1 };
    value += ch;
    j++;
  }
  return null;
}

/** 1-based line number of a char offset. */
function lineOf(source, index) {
  let line = 1;
  for (let i = 0; i < index && i < source.length; i++) {
    if (source[i] === '\n') line++;
  }
  return line;
}

/**
 * Capture a single test's body, given the offset just past its name string and
 * the offset of the call's closing paren. Prefers the callback's brace block
 * (the first `{` belonging to THIS call); falls back to a single-expression
 * arrow's RHS (text after `=>` up to the call close).
 *
 * @param {string} source
 * @param {number} afterName  Offset just past the name string's close.
 * @param {number} callClose  Offset of the call's closing `)`.
 * @returns {string}
 */
function captureBody(source, afterName, callClose) {
  // A brace block whose `{` falls inside this call is the callback body.
  const block = scanBlock(source, afterName, TS_BRACE_OPTS);
  if (block && block.open < callClose) {
    return source.slice(block.open, block.close + 1);
  }
  // Single-expression arrow: body is the RHS of `=>` up to the call close.
  const arrow = source.indexOf('=>', afterName);
  if (arrow !== -1 && arrow < callClose) {
    return source.slice(arrow + 2, callClose).trim();
  }
  // No callback shape we recognise — capture whatever the call holds.
  return source.slice(afterName, callClose).trim();
}

/**
 * Discover it()/test() cases in a single TS/JS file's source.
 *
 * @param {string} source  File contents.
 * @param {string} file    Path (unused by discovery; part of the contract).
 * @returns {Array<{name: string, line: number, body: string}>}
 */
function discover(source, file) {
  const tests = [];
  TEST_CALL_RE.lastIndex = 0;

  let m;
  while ((m = TEST_CALL_RE.exec(source)) !== null) {
    const quote = m[1];
    const quoteIdx = m.index + m[0].length - 1; // index of the opening quote
    const name = readString(source, quoteIdx, quote);
    if (!name) continue;

    // Bound the call so we know where the callback (or arrow RHS) ends. The
    // call's `(` is the first paren at/after the match start.
    const parenIdx = source.indexOf('(', m.index);
    const call = parenIdx === -1 ? null : scanBlock(source, parenIdx, TS_PAREN_OPTS);
    if (!call) continue; // unbalanced call — not a test we can reason about

    tests.push({
      name: name.value,
      line: lineOf(source, m.index),
      body: captureBody(source, name.end, call.close),
    });

    // Continue scanning from past this call's close so nested it/test calls in
    // OTHER blocks are still found, but we do not re-enter this same call.
    TEST_CALL_RE.lastIndex = name.end;
  }

  return tests;
}

/** Count `expect(` plus `assert(` / `assert.` occurrences in a body. */
function countAssertions(body) {
  const m = String(body || '').match(ASSERTION_RE);
  return m ? m.length : 0;
}

module.exports = {
  id: 'typescript',
  extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'],
  testFileGlobs: ['**/*.test.[jt]s?(x)', '**/*.spec.[jt]s?(x)'],
  discover,
  countAssertions,
};
