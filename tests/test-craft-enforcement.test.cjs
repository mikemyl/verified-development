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
    name: 'testing skill single-sources the three must-not-ship blocking anti-patterns',
    fn: () => {
      const s = readSkill('testing');
      mustAll(
        s,
        ['Must-not-ship anti-patterns', 'Assert the specific error', 'declared boundary'],
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
    name: 'testing skill blocks violating a repo-declared anti-pattern for the test type',
    fn: () => {
      const s = readSkill('testing');
      mustAll(
        s,
        ['anti-patterns:', 'good-example:', 'TESTING.md'],
        'skills/testing/SKILL.md',
      );
      // The boundary rule must cover ARRANGE, not just assert — the hole that let a
      // handler-boundary test seed state through a DAO method pass review.
      assert.ok(
        /arrange/i.test(s) && /seed/i.test(s),
        'the boundary rule must cover arranging below the boundary, not only asserting',
      );
      // And it must be measured against the test's OWN type, not the layer the code lives in.
      assert.ok(
        ci(s, "your own test's declared boundary") || ci(s, 'own declared type'),
        'the boundary must be anchored on the test\'s own declared type',
      );
    },
  },
  {
    name: 'test-review resolves each test to its declared type BEFORE judging craft (5a)',
    fn: () => {
      const a = readAgent('test-review');
      assert.ok(ci(a, '5a'), 'test-review must have criterion 5a (resolve the declared type)');
      mustAll(
        a,
        ['match-paths', 'match-markers', 'good-example', 'anti-patterns', 'boundary:'],
        'agents/test-review.md',
      );
      // The repo-declared anti-pattern violation is an ERROR (mechanical), while taxonomy
      // FIT (criterion 8) stays a judgment call and non-blocking. Both must be present.
      assert.ok(
        /declared for that test's type/i.test(a),
        'criterion 5b must escalate repo-declared anti-pattern violations to error',
      );
      assert.ok(
        /fit is a judgment call/i.test(a),
        'criterion 8 must stay a non-blocking judgment call, distinct from 5b',
      );
    },
  },
  {
    name: 'a feature-specific dispatch brief cannot displace the standing rubric',
    fn: () => {
      const a = readAgent('test-review');
      const r = readSkill('review');
      assert.ok(
        ci(a, 'additive'),
        'test-review must treat a dispatch brief as additive to its rubric',
      );
      assert.ok(
        ci(r, 'additive, never a substitute') || ci(r, 'additive'),
        '/review must state that a feature-specific brief is additive, not a substitute',
      );
      assert.ok(
        ci(r, 'TESTING.md'),
        '/review must point test-review at the repo TESTING.md type table',
      );
    },
  },
  {
    name: 'executor loads the declared type golden path before writing a test',
    fn: () => {
      const e = readAgent('executor');
      mustAll(
        e,
        ['good-example', 'anti-patterns', 'golden path', '(test:'],
        'agents/executor.md',
      );
      // Extend-the-seam escape hatch, not a below-boundary shortcut.
      assert.ok(
        ci(e, 'extend the seam'),
        'executor must route a missing capability to extending the seam',
      );
    },
  },
  {
    name: 'the shipped seed declares the boundary anti-patterns (they are a review gate)',
    fn: () => {
      const { loadSeed } = require(path.join(REPO, 'hooks/lib/taxonomy.js'));
      const seed = loadSeed();
      const types = seed.types || seed;
      const acceptance = types['acceptance'];
      assert.ok(acceptance, 'seed must declare an `acceptance` type');

      const declared = (acceptance.anti_patterns || []).join(' | ').toLowerCase();
      // These are the smells that let a test look green while proving nothing —
      // the ones agents reproduce most often. They must survive edits to the seed.
      for (const needle of ['below the boundary', 'seeding state', 'mutating a fixture']) {
        assert.ok(
          declared.includes(needle),
          `seed acceptance anti-patterns must cover ${JSON.stringify(needle)}; got: ${declared}`,
        );
      }

      // A DAO-boundary test must not drop to raw SQL to read its own writes back.
      const dao = (types['dao'].anti_patterns || []).join(' | ').toLowerCase();
      assert.ok(dao.includes('raw-sql read-back'), 'seed dao anti-patterns must cover raw-SQL read-back');
    },
  },
  {
    name: 'circular oracles stay OUT of the seed (criterion 9 is non-blocking by default)',
    fn: () => {
      // Listing them in the seed would make oracle provenance a BLOCKING error for
      // every repo without its own taxonomy — contradicting criterion 9's
      // deliberately non-blocking framing and breaking any approval-testing repo.
      // A repo may escalate by declaring it; the seed must not impose it.
      const { loadSeed } = require(path.join(REPO, 'hooks/lib/taxonomy.js'));
      const types = loadSeed().types || loadSeed();
      for (const [id, type] of Object.entries(types)) {
        const declared = (type.anti_patterns || []).join(' | ').toLowerCase();
        assert.ok(
          !declared.includes('circular oracle'),
          `seed type ${id} must not declare circular oracles (that escalation is the repo's call)`,
        );
      }
      // ...and /map must explain that the escalation is opt-in.
      const map = readSkill('map');
      assert.ok(ci(map, 'circular oracles'), '/map must explain the circular-oracle escalation');
      assert.ok(ci(map, 'non-blocking'), '/map must state criterion 9 is non-blocking by default');
    },
  },
  {
    name: '/map treats anti-patterns as a gate and requires the boundary entries',
    fn: () => {
      const map = readSkill('map');
      mustAll(
        map,
        ['anti-patterns', 'blocks review', 'mechanical', 'boundary'],
        'skills/map/SKILL.md',
      );
      assert.ok(
        ci(map, 'primitives') && ci(map, 'observation'),
        '/map must tell the taxonomy to name the repo observations, not just its drivers',
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
