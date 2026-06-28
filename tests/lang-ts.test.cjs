'use strict';

/**
 * Tests for the TypeScript/JavaScript language adapter
 * (hooks/lib/lang/ts.js). The adapter mirrors the Go adapter's contract:
 *
 *   { id, extensions, testFileGlobs,
 *     discover(source, file) -> [{ name, line, body }],
 *     countAssertions(body)  -> number }
 *
 * discover() finds `it(...)` / `test(...)` cases (including `.only` / `.skip`
 * variants), captures the quoted first-arg as `name`, the callback body as
 * `body` (brace-balanced via cfamily.scanBlock so braces inside strings,
 * template literals and comments do not end it), and the 1-based `line` of the
 * call. `describe(...)` blocks group tests and are NOT themselves records, but
 * tests nested inside them ARE found. countAssertions counts `expect(` plus
 * `assert(` / `assert.` occurrences in a body.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ts = require(path.join(__dirname, '..', 'hooks', 'lib', 'lang', 'ts.js'));

function byName(records) {
  const m = {};
  for (const r of records) m[r.name] = r;
  return m;
}

function mkTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'lang-ts-'));
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

module.exports = [
  {
    name: 'ts: adapter contract — id, disjoint-from-go extensions, globs, functions',
    fn: () => {
      assert.equal(ts.id, 'typescript');
      assert.deepEqual(ts.extensions, ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
      assert.deepEqual(ts.testFileGlobs, ['**/*.test.[jt]s?(x)', '**/*.spec.[jt]s?(x)']);
      assert.equal(typeof ts.discover, 'function');
      assert.equal(typeof ts.countAssertions, 'function');
      // Extensions must be disjoint from the Go adapter.
      assert.ok(!ts.extensions.includes('.go'));
    },
  },

  {
    name: 'ts: discover finds multiple it()/test() with name + 1-based line + body',
    fn: () => {
      const src = [
        "import { it, test, expect } from 'vitest';", // 1
        '',                                            // 2
        "it('adds numbers', () => {",                  // 3
        '  expect(1 + 1).toBe(2);',                    // 4
        '});',                                         // 5
        '',                                            // 6
        "test('subtracts numbers', () => {",           // 7
        '  expect(2 - 1).toBe(1);',                    // 8
        '});',                                         // 9
      ].join('\n');

      const recs = byName(ts.discover(src, 'math.test.ts'));
      assert.deepEqual(Object.keys(recs).sort(), ['adds numbers', 'subtracts numbers']);

      assert.equal(recs['adds numbers'].line, 3);
      assert.equal(recs['subtracts numbers'].line, 7);

      assert.ok(recs['adds numbers'].body.includes('toBe(2)'));
      assert.ok(!recs['adds numbers'].body.includes('toBe(1)'), 'body does not bleed into the next test');
      assert.ok(recs['subtracts numbers'].body.includes('toBe(1)'));
    },
  },

  {
    name: 'ts: tests nested inside a describe() are found; describe itself is not a record',
    fn: () => {
      const src = [
        "describe('calculator', () => {",   // 1
        "  it('handles zero', () => {",     // 2
        '    expect(0).toBe(0);',           // 3
        '  });',                            // 4
        '',                                 // 5
        "  it('handles one', () => {",      // 6
        '    expect(1).toBe(1);',           // 7
        '  });',                            // 8
        '});',                              // 9
      ].join('\n');

      const recs = ts.discover(src, 'calc.test.ts');
      const names = recs.map((r) => r.name).sort();
      assert.deepEqual(names, ['handles one', 'handles zero']);
      assert.ok(!names.includes('calculator'), 'describe is not emitted as a test');

      const byN = byName(recs);
      assert.equal(byN['handles zero'].line, 2);
      assert.equal(byN['handles one'].line, 6);
    },
  },

  {
    name: 'ts: it.only / test.skip / it.each-style variants are discovered',
    fn: () => {
      const src = [
        "it.only('focused', () => {",            // 1
        '  expect(true).toBe(true);',            // 2
        '});',                                   // 3
        "test.skip('skipped', () => {",          // 4
        '  expect(false).toBe(false);',          // 5
        '});',                                   // 6
        "it.concurrent('parallel', () => {",     // 7
        '  expect(1).toBe(1);',                  // 8
        '});',                                   // 9
      ].join('\n');

      const recs = byName(ts.discover(src, 'variants.test.ts'));
      assert.deepEqual(Object.keys(recs).sort(), ['focused', 'parallel', 'skipped']);
      assert.equal(recs.focused.line, 1);
      assert.equal(recs.skipped.line, 4);
      assert.equal(recs.parallel.line, 7);
    },
  },

  {
    name: 'ts: braces inside a template literal and a string do not end the body',
    fn: () => {
      const src = [
        "it('handles braces in literals', () => {",        // 1
        '  const s = "a }{ b";',                           // 2
        '  const tpl = `outer {x} inner`;',                // 3
        '  const obj = { kept: true };',                   // 4
        '  expect(obj.kept).toBe(true); // BODY_SENTINEL', // 5
        '});',                                             // 6
        '',                                                // 7
        "it('next test', () => {",                         // 8
        '  expect(1).toBe(1); // NEXT_MARKER',             // 9
        '});',                                             // 10
      ].join('\n');

      const recs = byName(ts.discover(src, 'literals.test.ts'));
      const body = recs['handles braces in literals'].body;
      assert.ok(body.includes('BODY_SENTINEL'), 'body reaches its last statement');
      assert.ok(body.includes('a }{ b'), 'string with braces stays inside the body');
      assert.ok(body.includes('outer {x} inner'), 'template-literal braces stay inside the body');
      assert.ok(!body.includes('NEXT_MARKER'), 'body does not bleed into the next test');
    },
  },

  {
    name: 'ts: a comment containing a closing brace does not end the body early',
    fn: () => {
      const src = [
        "it('comment braces', () => {",        // 1
        '  // a stray } in a line comment',    // 2
        '  /* a stray } in a block comment */',// 3
        '  expect(1).toBe(1); // C_SENTINEL',  // 4
        '});',                                 // 5
        "it('after', () => {",                 // 6
        '  expect(2).toBe(2); // AFTER',       // 7
        '});',                                 // 8
      ].join('\n');

      const recs = byName(ts.discover(src, 'comments.test.ts'));
      const body = recs['comment braces'].body;
      assert.ok(body.includes('C_SENTINEL'), 'body reaches its last statement past comments');
      assert.ok(!body.includes('AFTER'), 'body does not bleed into the next test');
    },
  },

  {
    name: 'ts: a single-expression arrow body (no braces) is captured up to the call close',
    fn: () => {
      const src = [
        "it('one liner', () => expect(1).toBe(1));", // 1
        '',                                          // 2
        "it('block one', () => {",                   // 3
        '  expect(2).toBe(2);',                      // 4
        '});',                                       // 5
      ].join('\n');

      const recs = byName(ts.discover(src, 'oneliner.test.ts'));
      assert.deepEqual(Object.keys(recs).sort(), ['block one', 'one liner']);
      const body = recs['one liner'].body;
      assert.ok(body.includes('expect(1).toBe(1)'), `arrow RHS captured, got: ${body}`);
      assert.ok(!body.includes('{'), 'single-expression body has no brace block');
    },
  },

  {
    name: 'ts: a double-quoted name with an escaped quote is captured correctly',
    fn: () => {
      const src = [
        'it("says \\"hi\\" loudly", () => {',  // 1
        '  expect(1).toBe(1);',                // 2
        '});',                                 // 3
      ].join('\n');
      const recs = ts.discover(src, 'escapes.test.ts');
      assert.equal(recs.length, 1);
      assert.equal(recs[0].name, 'says "hi" loudly');
    },
  },

  {
    name: 'ts: countAssertions counts expect( and assert( / assert.',
    fn: () => {
      const body = [
        '{',
        '  expect(a).toBe(1);',
        '  expect(b).toBe(2);',
        '  assert(c === 3);',
        '  assert.equal(d, 4);',
        '  assert.deepEqual(e, [5]);',
        '  const notAnExpectation = 1; // expectation, suspect not matched',
        '}',
      ].join('\n');
      // 2 expect( + 1 assert( + 2 assert. = 5
      assert.equal(ts.countAssertions(body), 5);
    },
  },

  {
    name: 'ts: countAssertions returns 0 for a body with no assertions',
    fn: () => {
      assert.equal(ts.countAssertions('{ const x = 1; doThing(x); }'), 0);
      assert.equal(ts.countAssertions(''), 0);
      assert.equal(ts.countAssertions(null), 0);
    },
  },

  // ---------------------------------------------------------------------------
  // Integration: the drop-in registry in test-corpus.js must pick up ts.js by
  // file extension and discover TS tests (no longer "unsupported").
  // ---------------------------------------------------------------------------
  {
    name: 'ts: test-corpus.discover() picks up ts.js and discovers *.test.ts cases',
    fn: () => {
      const { discover } = require(path.join(__dirname, '..', 'hooks', 'lib', 'test-corpus.js'));
      const dir = mkTmp();
      try {
        const file = write(dir, 'widget.test.ts', [
          "import { it, expect } from 'vitest';",
          "it('renders', () => {",
          '  expect(render()).toBe(true);',
          '});',
          "it('updates', () => {",
          '  expect(update()).toBe(true);',
          '});',
        ].join('\n') + '\n');

        const result = discover(dir);
        const names = result.tests.map((t) => t.name).sort();
        assert.deepEqual(names, ['renders', 'updates']);

        const renders = result.tests.find((t) => t.name === 'renders');
        assert.equal(renders.file, file);
        assert.equal(renders.assertions, 1, 'core attaches adapter assertion count');

        // The TS file is analyzable now — not reported as unsupported.
        assert.ok(!result.unsupported_files.includes(file), 'ts file is not unsupported');
      } finally {
        rmrf(dir);
      }
    },
  },
];
