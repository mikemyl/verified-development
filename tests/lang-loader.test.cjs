'use strict';

/**
 * Direct tests for hooks/lib/lang-loader.js — the adapter loader + glob compiler
 * shared by test-corpus.js and test-weakening.js. Previously covered only
 * transitively; the memoization, the non-adapter skip, and globToRegExp's
 * multi-segment semantics are asserted here.
 */

const assert = require('node:assert/strict');
const { loadAdapters, adapterByExtension, supportedLanguageIds, globToRegExp } = require('../hooks/lib/lang-loader.js');

module.exports = [
  {
    name: 'loadAdapters: includes the bundled language adapters, skips non-adapter modules',
    fn: () => {
      const ids = loadAdapters().map(a => a.id);
      for (const id of ['go', 'typescript', 'python', 'java']) {
        assert.ok(ids.includes(id), `expected adapter id ${id} (got ${ids.join(',')})`);
      }
      // cfamily.js exports no `extensions` array → it is a shared helper, not an adapter.
      assert.ok(!ids.includes('cfamily'), 'the shared cfamily helper is not loaded as an adapter');
      // every adapter exposes the countAssertions contract test-weakening relies on
      assert.ok(loadAdapters().every(a => typeof a.countAssertions === 'function'));
    },
  },
  {
    name: 'loadAdapters: memoized — same array reference across calls',
    fn: () => {
      assert.equal(loadAdapters(), loadAdapters());
    },
  },
  {
    name: 'supportedLanguageIds: sorted list of adapter ids',
    fn: () => {
      const ids = supportedLanguageIds();
      assert.deepEqual(ids, [...ids].sort());
    },
  },
  {
    name: 'adapterByExtension: maps an extension to its adapter',
    fn: () => {
      assert.equal(adapterByExtension()['.go'].id, 'go');
    },
  },
  {
    name: 'globToRegExp: ** crosses path segments, * stays within one, literals escape',
    fn: () => {
      assert.ok(globToRegExp('**/*_test.go').test('pkg/sub/x_test.go'), '** matches nested dirs');
      assert.ok(globToRegExp('**/*_test.go').test('x_test.go'), '** matches zero dirs');
      assert.ok(globToRegExp('tests/*.test.cjs').test('tests/x.test.cjs'), '* matches a segment');
      assert.ok(!globToRegExp('tests/*.test.cjs').test('tests/sub/x.test.cjs'), '* does not cross /');
      assert.ok(!globToRegExp('**/*_test.go').test('x_test_go'), 'the literal dot is escaped');
    },
  },
];
