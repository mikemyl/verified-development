'use strict';

/**
 * hooks/lib/lang/java.js
 *
 * The Java language adapter for the test-corpus analyzer. All Java-specific
 * knowledge lives here; the core (classify / rank / summary / scope) never sees
 * a language. The adapter contract (mirrored by every language adapter):
 *
 *   module.exports = {
 *     id:            'java',
 *     extensions:    ['.java'],
 *     testFileGlobs: ['**\/*Test.java', '**\/*Tests.java', '**\/Test*.java'],
 *     discover(source, file) -> [{ name, line, body }],
 *     countAssertions(body)  -> number,
 *   };
 *
 *   • discover — finds every JUnit test method (one ANNOTATED with `@Test`,
 *     JUnit 4 or 5) in a file's source and returns one record per test: the
 *     method `name`, the 1-based `line` of the method signature, and `body` —
 *     the source from the method's opening brace to its MATCHING close
 *     (brace-balanced via cfamily.scanBlock with Java's literal/comment rules,
 *     so braces inside strings/chars/comments don't count). The core attaches
 *     `file` and the assertion count.
 *   • countAssertions — JUnit/Mockito dispersion signal: `assert\w*(` calls
 *     (assertEquals/assertTrue/assertThat/…), `Assertions.` occurrences, and
 *     Mockito `verify(` calls.
 *
 * The presence of the `extensions` array is what tells the loader this module is
 * an adapter (cfamily.js, a shared helper, has none and is skipped).
 *
 * KNOWN LIMITATION: Java 15+ text blocks (`"""…"""`) are NOT modelled — they are
 * rare in test code, and the shared scanner treats the leading `"` as an
 * ordinary interpreted string. A `{` inside a text block could in principle be
 * miscounted; in practice test bodies almost never contain unbalanced braces in
 * text blocks, so this is accepted.
 */

const { scanBlock } = require('./cfamily.js');

// A Java method signature: `[annotations] [modifiers] void <name>(`. The `void`
// keyword is the discriminator that separates a declaration from a call such as
// `assertEquals(...)`. Annotations on the SAME line (e.g. `@Test void foo()`)
// are allowed in the prefix so the signature still matches; @Test detection
// itself is handled separately by hasTestAnnotation. JUnit 5 test methods are
// often package-private (no modifier); JUnit 4 are `public`.
const METHOD_SIG_RE =
  /^\s*(?:(?:@\w+(?:\([^)]*\))?|public|private|protected|static|final|synchronized|abstract|default)\s+)*void\s+(\w+)\s*\(/;

// The JUnit `@Test` annotation, with or without args (`@Test`, `@Test(...)`).
// The `\b` after `Test` prevents matching `@TestFactory` / `@TestTemplate`.
const TEST_ANNOT_RE = /@Test\b/;

// Java literal/comment rules for the shared brace scanner:
//   • interpreted string "…" — ends on an unescaped `"`.
//   • char literal       '…' — ends on an unescaped `'`.
//   • line comment       // …  — ends at the newline.
//   • block comment      /* … */ — ends at the close; no nesting.
const JAVA_SCAN_OPTS = {
  open: '{',
  close: '}',
  lineComment: '//',
  blockComment: { open: '/*', close: '*/' },
  strings: [
    { open: '"', close: '"', escape: '\\' },
    { open: "'", close: "'", escape: '\\' },
  ],
};

// Assertion tokens whose dispersion across a body signals a test asserting many
// independent things. Three additive contributors:
//   • assert\w*(   — JUnit assertEquals/assertTrue/assertThat/… (and bare assert()).
//   • Assertions.  — JUnit 5 fully-qualified entry point.
//   • verify(      — Mockito interaction verification.
const ASSERT_CALL_RE = /\bassert\w*\s*\(/g;
const ASSERTIONS_RE = /\bAssertions\./g;
const VERIFY_RE = /\bverify\s*\(/g;

/**
 * Decide whether the method at `sigIdx` carries an `@Test` annotation. The
 * annotation may sit on the signature line itself, or on a preceding line with
 * blank lines / other annotations (`@BeforeEach`, `@DisplayName(…)`, …) in
 * between. Scanning stops at the first preceding line that is neither blank nor
 * an annotation (i.e. real code or a closing brace), so an unrelated earlier
 * `@Test` cannot leak onto a non-test method.
 *
 * @param {string[]} lines
 * @param {number} sigIdx  Index of the method signature line.
 * @returns {boolean}
 */
function hasTestAnnotation(lines, sigIdx) {
  if (TEST_ANNOT_RE.test(lines[sigIdx])) return true;
  for (let i = sigIdx - 1; i >= 0; i--) {
    const t = lines[i].trim();
    if (t === '') continue; // blank line between annotation and method — allowed
    if (t.startsWith('@')) {
      if (TEST_ANNOT_RE.test(t)) return true;
      continue; // a non-@Test annotation — keep looking upward
    }
    break; // real code / closing brace — annotation block has ended
  }
  return false;
}

/**
 * Discover JUnit test methods in a single .java file's source.
 *
 * @param {string} source  File contents.
 * @param {string} file    Path (unused by Java discovery; part of the contract).
 * @returns {Array<{name: string, line: number, body: string}>}
 */
function discover(source, file) {
  const tests = [];
  const lines = source.split(/\r?\n/);

  // Char offset of the start of each line, to seed scanBlock at the signature.
  const lineOffsets = new Array(lines.length);
  let offset = 0;
  for (let li = 0; li < lines.length; li++) {
    lineOffsets[li] = offset;
    offset += lines[li].length + 1; // +1 for the split newline
  }

  for (let li = 0; li < lines.length; li++) {
    const m = METHOD_SIG_RE.exec(lines[li]);
    if (!m) continue;
    if (!hasTestAnnotation(lines, li)) continue;

    const span = scanBlock(source, lineOffsets[li], JAVA_SCAN_OPTS);
    if (span) {
      tests.push({
        name: m[1],
        line: li + 1, // 1-based signature line
        body: source.slice(span.open, span.close + 1),
      });
    }
    // An unbalanced method (no matching close) is skipped — not a test we can
    // reason about.
  }
  return tests;
}

/** Count assert*()/Assertions./verify() occurrences in a body. */
function countAssertions(body) {
  const s = String(body || '');
  const a = s.match(ASSERT_CALL_RE);
  const b = s.match(ASSERTIONS_RE);
  const c = s.match(VERIFY_RE);
  return (a ? a.length : 0) + (b ? b.length : 0) + (c ? c.length : 0);
}

module.exports = {
  id: 'java',
  extensions: ['.java'],
  testFileGlobs: ['**/*Test.java', '**/*Tests.java', '**/Test*.java'],
  discover,
  countAssertions,
};
