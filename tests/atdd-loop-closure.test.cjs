'use strict';

/**
 * Wiring anchors for roadmap #5 (atdd-loop-closure):
 *   - /plan records a scenario-persistence decision via bdd-convention.js
 *   - /review seeds new learnings.md lessons with a status field
 *   - a shared provenance footer is single-sourced and referenced by report writers
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(REPO, rel), 'utf8');

module.exports = [
  {
    name: 'atdd: /plan runs bdd-convention detect and records a persistence decision',
    fn: () => {
      const t = read('skills/plan/SKILL.md');
      assert.match(t, /bdd-convention\.js detect/);
      assert.match(t, /Scenario Persistence/i);
      // The decision must NOT force Gherkin on a testdsl repo (export:false path documented).
      assert.match(t, /export: false/);
      assert.match(t, /export: true/);
    },
  },
  {
    name: 'atdd: /review seeds new learnings with status: unvalidated',
    fn: () => {
      const t = read('skills/review/SKILL.md');
      assert.match(t, /status: unvalidated/);
      // and forbids rewriting existing entries (append-only preserved).
      assert.match(t, /append-only/i);
    },
  },
  {
    name: 'atdd: the learnings digest example demonstrates the status field',
    fn: () => {
      assert.match(read('plans/process-retro/templates/learnings.example.md'), /_\(status: \w+\)_/);
    },
  },
  {
    name: 'atdd: the shared provenance footer is single-sourced with required fields',
    fn: () => {
      const t = read('plans/shared/provenance-footer.md');
      for (const field of ['repo', 'branch', 'commit', 'plugin v', 'generated']) {
        assert.ok(t.includes(field), `provenance footer missing field: ${field}`);
      }
      assert.match(t, /Not applicable/, 'empty-section rule present');
    },
  },
  {
    name: 'atdd: report-writing skills reference the shared footer (not restate it)',
    fn: () => {
      assert.match(read('skills/review/SKILL.md'), /provenance-footer\.md/);
      assert.match(read('skills/test-audit/SKILL.md'), /provenance-footer\.md/);
    },
  },
];
