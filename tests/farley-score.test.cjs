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
 *   4. The scoring anchors are published: a score needs a citation, `Unknown`
 *      drops a property from BOTH numerator and denominator, and the worked
 *      example's arithmetic is actually correct (a rubric that demands shown
 *      arithmetic and then shows wrong arithmetic teaches the defect).
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.resolve(__dirname, '..');
const readSkill = name => fs.readFileSync(path.join(REPO, 'skills', name, 'SKILL.md'), 'utf8');
const readAgent = name => fs.readFileSync(path.join(REPO, 'agents', `${name}.md`), 'utf8');
const ci = (h, n) => h.toLowerCase().includes(n.toLowerCase());
// Markdown emphasis and line wrapping must not break a content assertion.
const flat = t => t.replace(/\*/g, '').replace(/\s+/g, ' ');

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

  // --- scoring anchors (ported from agentic-dev-team #1816) ------------------
  {
    name: 'rubric publishes cross-property scoring anchors and the citation rule',
    fn: () => {
      const rubric = readSkill('test-design-reviewer');
      assert.ok(
        /##\s*Scoring anchors/i.test(rubric),
        'rubric must publish the scoring-anchor bands, not just the per-property bands',
      );
      assert.ok(
        ci(rubric, 'A score with no citation is a guess'),
        'rubric must state that every score needs a citation',
      );
      assert.ok(
        /9-10 requires no counter-example/i.test(flat(rubric)),
        'rubric must state what earns the top band',
      );
    },
  },
  {
    name: 'rubric forbids inventing a score for a property with no evidence',
    fn: () => {
      const rubric = readSkill('test-design-reviewer');
      assert.ok(rubric.includes('`Unknown`'), 'rubric must define the Unknown outcome');
      assert.ok(
        /never substitute a default/i.test(flat(rubric)),
        'rubric must forbid substituting a default (e.g. 5) for missing evidence',
      );
      assert.ok(
        /numerator and (?:the )?(?:weight total|denominator)/i.test(flat(rubric)),
        'rubric must state that Unknown drops the property from BOTH numerator and denominator',
      );
    },
  },
  {
    name: 'an Unknown property renormalizes: the divisor is the weights actually scored',
    fn: () => {
      // The published rule, reimplemented: excluding First (weight 1.0) from a
      // uniform-8 suite must still yield 8 — not 8×8/9, which is what dropping
      // the numerator term alone would give.
      const scored = { U: 8, M: 8, R: 8, A: 8, N: 8, G: 8, F: 8 }; // T (First) = Unknown
      const weights = Object.entries(WEIGHTS).filter(([k]) => k !== 'T');
      const num = weights.reduce((acc, [k, w]) => acc + scored[k] * w, 0);
      const den = weights.reduce((acc, [, w]) => acc + w, 0);
      assert.equal(den, 8);
      assert.equal(num / den, 8);
      assert.notEqual(num / SUM, 8, 'dropping only the numerator term would silently deflate the score');
    },
  },
  {
    name: 'rubric states the 1-10 scale is never a percentage',
    fn: () => {
      const rubric = readSkill('test-design-reviewer');
      assert.ok(
        /never multiply it by 10 and never present it as a percentage/i.test(flat(rubric)),
        'rubric must forbid presenting the score as a percentage',
      );
    },
  },
  {
    name: 'rubric ships a worked example whose arithmetic is CORRECT',
    fn: () => {
      const rubric = readSkill('test-design-reviewer');
      assert.ok(/##\s*Worked Example/i.test(rubric), 'rubric must ship a worked example');
      // Extract "a×w + a×w + …" from the example and re-add it. A rubric that
      // demands shown arithmetic must not itself show arithmetic that is wrong.
      const m = rubric.match(/Farley Score = \(([^)]*×[^)]*)\)\s*\/\s*9\.0/);
      assert.ok(m, 'worked example must show the weighted sum');
      const total = m[1]
        .split('+')
        .map(term => term.split('×').map(x => parseFloat(x.trim())))
        .reduce((acc, [score, weight]) => acc + score * weight, 0);
      const shown = rubric.match(/=\s*([\d.]+)\s*\/\s*9\.0\s*=\s*\*\*([\d.]+)/);
      assert.ok(shown, 'worked example must show the total and the final score');
      assert.equal(total, parseFloat(shown[1]), 'the weighted rows do not add up to the shown total');
      assert.equal(
        Math.round((total / 9) * 10) / 10,
        parseFloat(shown[2]),
        'the shown Farley Score does not match total / 9.0',
      );
    },
  },
  {
    name: 'rubric disambiguates the properties that produce unreproducible scores',
    fn: () => {
      const rubric = readSkill('test-design-reviewer');
      assert.ok(
        /same result object are one behavior/i.test(flat(rubric)),
        'Atomic: multiple assertions on one result object must not be penalized',
      );
      assert.ok(
        /must name the other test/i.test(flat(rubric)),
        'Necessary: a duplication claim must name the duplicate',
      );
    },
  },
];
