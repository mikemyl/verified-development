'use strict';

/**
 * hooks/lib/lang/python.js
 *
 * The Python language adapter for the test-corpus analyzer. Like every adapter
 * (see go.js) it isolates all language-specific knowledge behind the contract:
 *
 *   module.exports = {
 *     id:            'python',
 *     extensions:    ['.py'],
 *     testFileGlobs: ['**\/test_*.py', '**\/*_test.py'],
 *     discover(source, file) -> [{ name, line, body }],
 *     countAssertions(body)  -> number,
 *   };
 *
 * The core (test-corpus.js) attaches `file` and the assertion count; discover
 * returns only { name, line, body } with a 1-based `line`.
 *
 * ── Why an indentation scanner (NOT cfamily) ───────────────────────────────
 * Python has no braces. A test's body is delimited by INDENTATION: it spans
 * from the `def` line through the last line that is more-indented than the `def`
 * keyword's column. The block ends at the first non-blank line whose indentation
 * is ≤ the def's indentation; blank lines never end the block. Triple-quoted
 * strings ("""…""" / '''…''') are tracked so that a docstring whose contents
 * contain `def ` or dedented-looking text does not prematurely end the body.
 *
 * ── Name convention ────────────────────────────────────────────────────────
 *   • top-level  `def test_x(...)`               → name = "test_x"
 *   • method     `def test_y(self)` in class Foo → name = "Foo.test_y"
 * (ClassName.method is used for methods so two classes can both define
 * `test_setup` without colliding.)
 *
 * Discovered tests:
 *   • top-level `def test_*` (any indentation 0 function), AND
 *   • `def test_*` methods declared directly inside a `class Test*`.
 * A `def` that is neither (a helper `def parse()`, or a test-named nested def
 * inside another test's body) is not emitted. Decorators above a def (e.g.
 * `@pytest.mark.parametrize(...)`) do not change anything — the `def` line is
 * always the anchor.
 */

// A test declaration: `def test_<rest>(...)`. Leading whitespace captured so we
// know the def's indentation column; the param list is irrelevant here.
const TEST_DEF_RE = /^(\s*)def\s+(test\w*)\s*\(/;

// A class declaration; capture indentation + name so we can tell which methods
// belong to a `class Test*` (a method is a test only inside such a class).
const CLASS_RE = /^(\s*)class\s+(\w+)/;

// Assertion-signal patterns for the dispersion smell. `^\s*assert\b` catches the
// bare-`assert` statement; self.assert* (unittest) and pytest.raises are counted
// by raw occurrence.
const SELF_ASSERT_RE = /self\.assert/g;
const PYTEST_RAISES_RE = /pytest\.raises/g;

/** Leading-whitespace width of a line (its indentation column). */
function indentOf(line) {
  const m = /^(\s*)/.exec(line);
  return m[1].length;
}

/**
 * Process one source line for triple-quote state tracking, returning the triple
 * state in effect at the END of the line.
 *
 * @param {string} line
 * @param {?string} state  Active triple delimiter ('"""' | "'''") or null.
 * @returns {?string}
 */
function processLine(line, state) {
  let i = 0;
  while (i < line.length) {
    if (state) {
      // Inside a triple-quoted string: scan for its matching close.
      const idx = line.indexOf(state, i);
      if (idx === -1) return state; // still open at EOL
      i = idx + 3;
      state = null;
      continue;
    }
    // Outside any string.
    const c = line[i];
    if (c === '#') return null; // line comment: rest of line is inert
    if (line.startsWith('"""', i) || line.startsWith("'''", i)) {
      state = line.slice(i, i + 3);
      i += 3;
      continue;
    }
    if (c === '"' || c === "'") {
      // Single-line string literal: consume to its matching quote (honoring
      // backslash escapes). Cannot span lines, so state stays null.
      const q = c;
      i++;
      while (i < line.length) {
        if (line[i] === '\\') {
          i += 2;
          continue;
        }
        if (line[i] === q) {
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    i++;
  }
  return state;
}

/**
 * For each line, whether it BEGINS inside a triple-quoted string. Such lines are
 * always part of the enclosing block and must not be tested for dedent.
 *
 * @param {string[]} lines
 * @returns {boolean[]}
 */
function computeInString(lines) {
  const out = [];
  let state = null;
  for (const line of lines) {
    out.push(state !== null);
    state = processLine(line, state);
  }
  return out;
}

/**
 * The indentation-scanned body block for a def at `defLine`. Spans from the def
 * line through the last line more-indented than the def's column. Blank lines
 * never end the block; a line that begins inside a triple-quoted string is part
 * of the block regardless of its apparent indentation.
 *
 * @returns {{ body: string, endLine: number }} endLine is the 0-based index of
 *          the last line included.
 */
function scanBody(lines, inString, defLine) {
  const defIndent = indentOf(lines[defLine]);
  let endLine = defLine;
  for (let j = defLine + 1; j < lines.length; j++) {
    if (inString[j]) {
      endLine = j; // continuation of a triple-quoted string — keep it
      continue;
    }
    if (lines[j].trim() === '') continue; // blank never ends the block
    if (indentOf(lines[j]) <= defIndent) break; // dedent ends the block
    endLine = j;
  }
  return {
    body: lines.slice(defLine, endLine + 1).join('\n'),
    endLine,
  };
}

/**
 * Discover Python test functions/methods in a single .py source.
 *
 * @param {string} source
 * @param {string} file   Path (unused by Python discovery; part of contract).
 * @returns {Array<{name: string, line: number, body: string}>}
 */
function discover(source, file) {
  const lines = source.split(/\r?\n/);
  const inString = computeInString(lines);
  const tests = [];

  // Nearest enclosing class, when any: { name, indent, isTest }. A `def test_*`
  // is a method iff it sits (more-indented) directly inside a `class Test*`.
  let classCtx = null;

  for (let i = 0; i < lines.length; i++) {
    if (inString[i]) continue; // structural keywords inside strings don't count
    const line = lines[i];
    if (line.trim() === '') continue;

    const ind = indentOf(line);
    // Leaving the class scope once we dedent to/under its column.
    if (classCtx && ind <= classCtx.indent) classCtx = null;

    const cm = CLASS_RE.exec(line);
    if (cm) {
      classCtx = {
        name: cm[2],
        indent: cm[1].length,
        isTest: /^Test/.test(cm[2]),
      };
      continue;
    }

    const tm = TEST_DEF_RE.exec(line);
    if (tm) {
      const fnIndent = tm[1].length;
      const fnName = tm[2];
      let name = null;
      if (fnIndent === 0 && !classCtx) {
        name = fnName; // top-level test function
      } else if (classCtx && classCtx.isTest && fnIndent > classCtx.indent) {
        name = `${classCtx.name}.${fnName}`; // test method in a Test* class
      }
      // Otherwise: a nested def, a method of a non-Test class, etc. — not a test.

      const { body, endLine } = scanBody(lines, inString, i);
      if (name) {
        tests.push({ name, line: i + 1, body });
      }
      // Skip the whole body so a test-named nested def inside it is not re-read
      // as its own test. Class context is unaffected (body lines are deeper).
      i = endLine;
    }
  }

  return tests;
}

/**
 * Count assertion signals in a body: bare `assert` statements (one per line),
 * plus unittest `self.assert*` and `pytest.raises` occurrences.
 *
 * @param {string} body
 * @returns {number}
 */
function countAssertions(body) {
  const text = String(body || '');
  let count = 0;
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*assert\b/.test(line)) count++;
  }
  const selfAsserts = text.match(SELF_ASSERT_RE);
  if (selfAsserts) count += selfAsserts.length;
  const pytestRaises = text.match(PYTEST_RAISES_RE);
  if (pytestRaises) count += pytestRaises.length;
  return count;
}

module.exports = {
  id: 'python',
  extensions: ['.py'],
  testFileGlobs: ['**/test_*.py', '**/*_test.py'],
  discover,
  countAssertions,
};
