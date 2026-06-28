'use strict';

/**
 * Gate-wiring prompt-anchor regression net (enforced-test-taxonomy).
 *
 * The deterministic test-gate (hooks/lib/test-gate.js) must be wired into the
 * orchestrating skills. /plan runs the gate after wave compute, refuses to
 * present on `blocked`, renders a `## Test Boundaries` per-task summary, and
 * persists sign-off approvals to test-signoffs.json. /implement re-runs the
 * gate and gates each wave on `blocked`.
 *
 * These substrings are the SHARED CONTRACT: the T011 (/plan) and T012
 * (/implement) editors must include them verbatim. If a future edit removes
 * one, this test catches it before merge.
 *
 * Pattern lifted from tests/prompt-anchors.test.cjs: read the prompt markdown
 * and assert key strings are present.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILLS = path.resolve(__dirname, '..', 'skills');

function read(skill) {
  return fs.readFileSync(path.join(SKILLS, skill, 'SKILL.md'), 'utf8');
}

function mustContain(content, needles, file) {
  for (const n of needles) {
    assert.ok(
      content.includes(n),
      `${file}: expected to contain ${JSON.stringify(n)}`,
    );
  }
}

module.exports = [
  {
    name: '/plan wires the deterministic test-gate (gate, boundaries, sign-off persistence)',
    fn: () => {
      const content = read('plan');
      mustContain(
        content,
        ['test-gate.js', '## Test Boundaries', 'test-signoffs.json', 'sign-off'],
        'skills/plan/SKILL.md',
      );
    },
  },
  {
    name: '/implement re-runs the test-gate and reads persisted sign-offs',
    fn: () => {
      const content = read('implement');
      mustContain(
        content,
        ['test-gate.js', 'test-signoffs.json'],
        'skills/implement/SKILL.md',
      );
    },
  },
];
