'use strict';

/**
 * Tests for write-time test-craft prevention + selective blocking, and the
 * comment-economy / feature-qualified-ID executor guidance (v1.11.0).
 *
 *   1. The `testing` skill single-sources two "must-not-ship" blocking anti-patterns
 *      (weak assertion on a named error; assertion below the declared test boundary).
 *   2. `test-review` promotes exactly those two to `error` (blocking) via criterion 5b,
 *      WITHOUT disturbing the non-blocking framing of Farley (criterion 7) / taxonomy
 *      (criterion 8) — that lock lives in farley-score.test.cjs.
 *   3. The `executor` agent prevents them at write-time and carries the comment-economy
 *      + feature-qualified requirement-ID guidance.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.resolve(__dirname, '..');
const readSkill = name => fs.readFileSync(path.join(REPO, 'skills', name, 'SKILL.md'), 'utf8');
const readAgent = name => fs.readFileSync(path.join(REPO, 'agents', `${name}.md`), 'utf8');
const ci = (h, n) => h.toLowerCase().includes(n.toLowerCase());
const mustAll = (hay, needles, where) => {
  for (const n of needles) {
    assert.ok(ci(hay, n), `${where}: missing ${JSON.stringify(n)}`);
  }
};

module.exports = [
  {
    name: 'testing skill single-sources the two must-not-ship blocking anti-patterns',
    fn: () => {
      const s = readSkill('testing');
      mustAll(
        s,
        ['Must-not-ship anti-patterns', 'Assert the specific error', 'declared test boundary'],
        'skills/testing/SKILL.md',
      );
      // ErrorIs is the illustrative fix for the named-error rule.
      assert.ok(ci(s, 'ErrorIs'), 'testing skill should illustrate asserting the specific error');
    },
  },
  {
    name: 'test-review criterion 5b makes exactly the two craft violations blocking (error)',
    fn: () => {
      const a = readAgent('test-review');
      assert.ok(ci(a, '5b'), 'test-review must have criterion 5b');
      assert.ok(ci(a, 'BLOCKING'), 'criterion 5b must mark itself blocking');
      mustAll(
        a,
        ['Weak assertion on a named error', 'below the declared test boundary'],
        'agents/test-review.md',
      );
      // The Rules list routes these two to `error` and keeps multi-behavior at warning.
      assert.ok(
        /error.*must-not-ship craft violations/is.test(a) || ci(a, 'BLOCK the review'),
        'Rules must route the two craft violations to error/blocking',
      );
      assert.ok(ci(a, 'multi-behavior'), 'Rules must keep multi-behavior at warning');
    },
  },
  {
    name: 'test-review keeps taxonomy/Farley non-blocking (no regression)',
    fn: () => {
      const a = readAgent('test-review');
      // Criterion 8 taxonomy fit and criterion 7 Farley remain non-blocking.
      assert.ok(ci(a, 'non-blocking'), 'test-review must still mark signals non-blocking');
      assert.ok(
        ci(a, 'NEVER escalates') || ci(a, 'never changes'),
        'taxonomy/Farley must still be documented as never gating on their own',
      );
    },
  },
  {
    name: 'executor prevents the two craft violations at write-time',
    fn: () => {
      const e = readAgent('executor');
      mustAll(
        e,
        ['Test craft (write-time', 'specific error', 'declared taxonomy boundary'],
        'agents/executor.md',
      );
    },
  },
  {
    name: 'executor carries comment-economy + feature-qualified requirement IDs',
    fn: () => {
      const e = readAgent('executor');
      mustAll(
        e,
        ['Comments & traceability', 'Feature-qualify', '<feature-slug>/FR-015', 'self-documenting'],
        'agents/executor.md',
      );
      // The instruction to put IDs on the test, not the implementation narration.
      assert.ok(
        ci(e, 'requirement IDs on the test'),
        'executor must steer requirement IDs onto tests, not implementation prose',
      );
    },
  },
];
