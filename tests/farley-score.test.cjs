'use strict';

/**
 * Tests for the Farley Score test-quality signal.
 *
 *   1. The weighted formula is locked: a pure-function reimplementation must
 *      agree with the formula string published in the rubric (single source of
 *      truth: skills/test-design-reviewer/SKILL.md). If anyone edits the weights
 *      in prose without updating the math (or vice-versa), this fails.
 *   2. The rubric documents all 8 properties and the score bands.
 *   3. The signal is wired into test-review / review / verify as NON-BLOCKING.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.resolve(__dirname, '..');
const readSkill = name => fs.readFileSync(path.join(REPO, 'skills', name, 'SKILL.md'), 'utf8');
const readAgent = name => fs.readFileSync(path.join(REPO, 'agents', `${name}.md`), 'utf8');
const ci = (h, n) => h.toLowerCase().includes(n.toLowerCase());

// The canonical formula string, as published in the rubric. Both the rubric and
// the test-review agent must contain it verbatim — that is the drift lock.
const FORMULA = '(U×1.5 + M×1.5 + R×1.25 + A×1.0 + N×1.0 + G×1.0 + F×0.75 + T×1.0) / 9';

// Pure-function reimplementation of the same weighted mean.
const WEIGHTS = { U: 1.5, M: 1.5, R: 1.25, A: 1.0, N: 1.0, G: 1.0, F: 0.75, T: 1.0 };
const SUM = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
function farley(s) {
  const num =
    s.U * WEIGHTS.U + s.M * WEIGHTS.M + s.R * WEIGHTS.R + s.A * WEIGHTS.A +
    s.N * WEIGHTS.N + s.G * WEIGHTS.G + s.F * WEIGHTS.F + s.T * WEIGHTS.T;
  return num / SUM;
}
const uniform = v => ({ U: v, M: v, R: v, A: v, N: v, G: v, F: v, T: v });

module.exports = [
  {
    name: 'weights sum to 9 (the divisor) so a uniform score returns itself',
    fn: () => {
      assert.equal(SUM, 9);
      assert.equal(farley(uniform(10)), 10);
      assert.equal(farley(uniform(5)), 5);
      assert.equal(farley(uniform(1)), 1);
    },
  },
  {
    name: 'weighting bites: a low Understandable (1.5×) hurts more than a low Fast (0.75×)',
    fn: () => {
      const lowU = farley({ ...uniform(10), U: 2 });
      const lowF = farley({ ...uniform(10), F: 2 });
      assert.ok(lowU < lowF, `expected low-U (${lowU}) < low-F (${lowF})`);
    },
  },
  {
    name: 'rubric publishes the exact formula the code implements (drift lock)',
    fn: () => {
      const rubric = readSkill('test-design-reviewer');
      assert.ok(rubric.includes(FORMULA), 'test-design-reviewer must publish the canonical formula');
    },
  },
  {
    name: 'rubric documents all 8 Farley properties and the score bands',
    fn: () => {
      const rubric = readSkill('test-design-reviewer');
      for (const prop of ['Understandable', 'Maintainable', 'Repeatable', 'Atomic', 'Necessary', 'Granular', 'Fast', 'First']) {
        assert.ok(ci(rubric, prop), `rubric missing property: ${prop}`);
      }
      assert.ok(ci(rubric, 'Farley Score'), 'rubric must name the Farley Score');
      assert.ok(ci(rubric, 'Exemplary') && ci(rubric, 'Critical'), 'rubric must define score bands');
    },
  },
  {
    name: 'test-review agent computes Farley from the single-source rubric, NON-BLOCKING',
    fn: () => {
      const agent = readAgent('test-review');
      assert.ok(agent.includes(FORMULA), 'test-review must reference the canonical formula');
      assert.ok(agent.includes('skills/test-design-reviewer/SKILL.md'), 'test-review must cite the rubric source');
      assert.ok(ci(agent, 'non-blocking'), 'test-review must mark Farley non-blocking');
      assert.ok(
        /never.*(status|PASS\/WARN\/FAIL)/is.test(agent),
        'test-review must state Farley never changes PASS/WARN/FAIL',
      );
    },
  },
  {
    name: '/review surfaces the Farley Score as a non-blocking signal',
    fn: () => {
      const review = readSkill('review');
      assert.ok(ci(review, 'Farley Score'), '/review must surface the Farley Score');
      assert.ok(ci(review, 'non-blocking'), '/review must mark it non-blocking');
    },
  },
  {
    name: '/verify points at the Farley signal without gating on it',
    fn: () => {
      const verify = readSkill('verify');
      assert.ok(ci(verify, 'Farley Score'), '/verify must mention the Farley signal');
      assert.ok(ci(verify, 'non-blocking'), '/verify must mark it non-blocking');
    },
  },
];
