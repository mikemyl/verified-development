'use strict';

/**
 * Tests for hooks/lib/bdd-convention.js — deterministic detection of a repo's
 * acceptance-test convention. It records a DECISION (is a Gherkin/.feature export
 * warranted?), it never forces one: a repo with no cucumber-family runner is
 * `none`/export:false, so the existing scenario→task→test linkage stands and no
 * .feature scaffolding is imposed on a testdsl repo.
 *
 * Requirement ids trace to .verified/features (atdd-loop-closure).
 */

const assert = require('node:assert/strict');
const { classify, SCHEMA } = require('../hooks/lib/bdd-convention.js');

module.exports = [
  {
    name: 'bdd-convention: present .feature files → gherkin, export true',
    fn: () => {
      const d = classify({ featureFileCount: 3, manifestText: '' });
      assert.equal(d.schema, SCHEMA);
      assert.equal(d.convention, 'gherkin');
      assert.equal(d.export, true);
      assert.ok(d.signals.some(s => /feature-files:3/.test(s)));
    },
  },
  {
    name: 'bdd-convention: a cucumber-family runner in a manifest → gherkin',
    fn: () => {
      for (const marker of ['github.com/cucumber/godog', '"@cucumber/cucumber"', 'reqnroll', 'pytest-bdd', 'behave']) {
        const d = classify({ featureFileCount: 0, manifestText: `dep ${marker} v1` });
        assert.equal(d.convention, 'gherkin', `expected gherkin for ${marker}`);
        assert.equal(d.export, true);
      }
    },
  },
  {
    name: 'bdd-convention: no feature files and no runner → none, export false',
    fn: () => {
      const d = classify({ featureFileCount: 0, manifestText: 'require github.com/stretchr/testify v1' });
      assert.equal(d.convention, 'none');
      assert.equal(d.export, false);
      assert.deepEqual(d.signals, []);
    },
  },
  {
    name: 'bdd-convention: empty input is none, not a crash',
    fn: () => {
      const d = classify({});
      assert.equal(d.convention, 'none');
      assert.equal(d.export, false);
    },
  },
];
