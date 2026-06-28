'use strict';

/**
 * Tests for the Python language adapter (hooks/lib/lang/python.js).
 *
 * Discovery contract (mirrors go.js): discover(source, file) returns one
 * { name, line, body } per test — top-level `def test_*` and `def test_*`
 * methods inside a `class Test*`. `line` is 1-based; `body` is the
 * INDENTATION-scanned block (def line through the last line more-indented than
 * the def's column; blank lines and triple-quoted-string contents do not end
 * the block). Name convention: top-level → "test_x"; method → "ClassName.test_y".
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const py = require('../hooks/lib/lang/python.js');

function byName(tests) {
  const m = {};
  for (const t of tests) m[t.name] = t;
  return m;
}

module.exports = [
  {
    name: 'adapter contract: id/extensions/testFileGlobs, .py disjoint from .go',
    fn: () => {
      assert.equal(py.id, 'python');
      assert.deepEqual(py.extensions, ['.py']);
      assert.deepEqual(py.testFileGlobs, ['**/test_*.py', '**/*_test.py']);
      assert.equal(typeof py.discover, 'function');
      assert.equal(typeof py.countAssertions, 'function');
      assert.ok(!py.extensions.includes('.go'), '.py adapter does not own .go');
    },
  },

  {
    name: 'discover: top-level def test_x found with name + 1-based line + body',
    fn: () => {
      const src = [
        'import pytest',          // 1
        '',                       // 2
        'def helper():',          // 3
        '    return 1',           // 4
        '',                       // 5
        'def test_x():',          // 6
        '    x = helper()',       // 7
        '    assert x == 1',      // 8
        '',                       // 9
        'def test_after():',      // 10
        '    assert True',        // 11
      ].join('\n');

      const tests = byName(py.discover(src, 'test_x.py'));
      assert.ok(tests.test_x, 'test_x discovered');
      assert.equal(tests.test_x.line, 6);
      assert.ok(tests.test_x.body.startsWith('def test_x():'));
      assert.ok(tests.test_x.body.includes('assert x == 1'), 'body includes its assertion');
      // Stops at the next dedented def — does not bleed.
      assert.ok(!tests.test_x.body.includes('test_after'), 'body stops before the next def');
    },
  },

  {
    name: 'discover: ignores non-test helper def',
    fn: () => {
      const src = [
        'def helper():',
        '    return 41',
        '',
        'def setup_module():',
        '    pass',
      ].join('\n');
      assert.deepEqual(py.discover(src, 'test_h.py'), []);
    },
  },

  {
    name: 'discover: method def test_y(self) inside class TestThing → ClassName.test_y',
    fn: () => {
      const src = [
        'import unittest',                       // 1
        '',                                      // 2
        'class TestThing(unittest.TestCase):',   // 3
        '    def setup(self):',                  // 4
        '        self.v = 1',                    // 5
        '',                                      // 6
        '    def test_y(self):',                 // 7
        '        self.assertEqual(self.v, 1)',   // 8
      ].join('\n');

      const tests = byName(py.discover(src, 'test_thing.py'));
      assert.ok(tests['TestThing.test_y'], 'method named ClassName.method');
      assert.equal(tests['TestThing.test_y'].line, 7);
      assert.ok(tests['TestThing.test_y'].body.includes('self.assertEqual'));
      // `setup` is not a test; only the test method is emitted.
      assert.deepEqual(Object.keys(tests), ['TestThing.test_y']);
    },
  },

  {
    name: 'discover: decorated test (@pytest.mark.parametrize above def) anchors on the def line',
    fn: () => {
      const src = [
        'import pytest',                                  // 1
        '',                                               // 2
        '@pytest.mark.parametrize("n", [1, 2, 3])',       // 3
        'def test_decorated(n):',                         // 4
        '    assert n > 0',                               // 5
      ].join('\n');

      const tests = byName(py.discover(src, 'test_d.py'));
      assert.ok(tests.test_decorated, 'decorated test discovered');
      assert.equal(tests.test_decorated.line, 4, 'line is the def, not the decorator');
      assert.ok(tests.test_decorated.body.startsWith('def test_decorated(n):'));
      assert.ok(!tests.test_decorated.body.includes('parametrize'), 'decorator not in body');
    },
  },

  {
    name: 'discover: body keeps a nested block (if/for) and stops at the next dedented def',
    fn: () => {
      const src = [
        'def test_nested():',          // 1
        '    total = 0',               // 2
        '    for i in range(3):',      // 3
        '        if i % 2 == 0:',      // 4
        '            total += i',      // 5
        '',                            // 6  (blank inside body — must NOT end it)
        '    assert total == 2',       // 7
        '',                            // 8
        'def test_next():',            // 9
        '    assert True  # NEXT',     // 10
      ].join('\n');

      const tests = byName(py.discover(src, 'test_n.py'));
      const body = tests.test_nested.body;
      assert.ok(body.includes('for i in range(3):'), 'nested for kept');
      assert.ok(body.includes('total += i'), 'deeply-nested line kept');
      assert.ok(body.includes('assert total == 2'), 'reaches last statement after a blank line');
      assert.ok(!body.includes('NEXT'), 'body stops at the next dedented def');
    },
  },

  {
    name: 'discover: triple-quoted docstring with "def " / dedented text does NOT end the body',
    fn: () => {
      const src = [
        'def test_doc():',                       // 1
        '    """',                               // 2
        'def fake_dedented_in_docstring():',     // 3  (column 0 inside the string)
        '    this looks dedented but is text',   // 4
        '    """',                               // 5
        '    real = 1',                          // 6
        '    assert real == 1  # SENTINEL',      // 7
        '',                                      // 8
        'def test_other():',                     // 9
        '    assert True  # OTHER',              // 10
      ].join('\n');

      const tests = byName(py.discover(src, 'test_doc.py'));
      assert.ok(tests.test_doc, 'test_doc discovered');
      assert.ok(tests.test_other, 'test_other discovered as a separate test');
      const body = tests.test_doc.body;
      assert.ok(body.includes('SENTINEL'), 'body reaches past the docstring to its last statement');
      assert.ok(!body.includes('OTHER'), 'docstring contents did not prematurely end the body');
      // The fake def inside the docstring is NOT a discovered test.
      assert.ok(!tests['fake_dedented_in_docstring'], 'string-embedded def is not a test');
    },
  },

  {
    name: 'countAssertions: counts bare `assert` lines and self.assertEqual',
    fn: () => {
      const body = [
        'def test_c(self):',
        '    assert a == b',
        '    self.assertEqual(x, y)',
        '    assert c is not None',
        '    z = "assert in a string does not count on its own line"',
        '    self.assertTrue(ok)',
      ].join('\n');
      // 2 bare-assert lines + 2 self.assert occurrences = 4. (The string line
      // does not start with `assert`, so it is not a bare-assert line.)
      assert.equal(py.countAssertions(body), 4);
    },
  },

  {
    name: 'countAssertions: counts pytest.raises occurrences',
    fn: () => {
      const body = [
        'def test_r():',
        '    with pytest.raises(ValueError):',
        '        do()',
        '    assert done',
      ].join('\n');
      assert.equal(py.countAssertions(body), 2); // 1 pytest.raises + 1 assert line
    },
  },

  {
    name: 'integration: test-corpus discover() picks up python.js for a .py fixture',
    fn: () => {
      const { discover } = require('../hooks/lib/test-corpus.js');
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'py-adapter-'));
      try {
        const file = path.join(dir, 'test_thing.py');
        fs.writeFileSync(file, [
          'class TestThing:',
          '    def test_method(self):',
          '        assert 1 == 1',
          '',
          'def test_top():',
          '    assert True',
        ].join('\n') + '\n');

        const result = discover(dir);
        const names = result.tests.map((t) => t.name).sort();
        assert.deepEqual(names, ['TestThing.test_method', 'test_top']);
        // Core attaches file + assertions; the .py file is NOT unsupported now.
        const top = result.tests.find((t) => t.name === 'test_top');
        assert.equal(top.file, file);
        assert.equal(top.assertions, 1);
        assert.deepEqual(result.unsupported_files, []);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    },
  },
];
