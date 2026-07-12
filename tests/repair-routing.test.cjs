'use strict';

/**
 * Tests for the deterministic repair-loop router (hooks/lib/repair-routing.js).
 *
 * The router's whole point is that failure classification, the dead-end
 * decision, and the resolved/remaining diff are made by code, not the LLM — so
 * every branch is unit-tested model-free, mirroring waves.js / test-gate.js.
 *
 * Requirement ids trace to .verified/features/deterministic-repair-loop/spec.md.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  classify,
  signature,
  isDeadEnd,
  failingTests,
  failureDiff,
  SCHEMA,
} = require('../hooks/lib/repair-routing.js');

const REPO = path.resolve(__dirname, '..');
const executor = () => fs.readFileSync(path.join(REPO, 'agents', 'executor.md'), 'utf8');

module.exports = [
  {
    // deterministic-repair-loop/AS-1 + FR-004
    name: 'classify: compile symbol error routes fix-inline',
    fn: () => {
      const r = classify('./main.go:12:2: undefined: fooBar', 2);
      assert.equal(r.class, 'compile');
      assert.equal(r.route, 'fix-inline');
    },
  },
  {
    // deterministic-repair-loop/AS-2 + FR-003 — unknown degrades to today's retry
    name: 'classify: unmatched output degrades to unclassified/retry',
    fn: () => {
      const r = classify('some entirely novel diagnostic with no signal', 1);
      assert.equal(r.class, 'unclassified');
      assert.equal(r.route, 'retry');
    },
  },
  {
    // deterministic-repair-loop/AS-3 — security dispatches to the right agent
    name: 'classify: security finding dispatches security-review',
    fn: () => {
      const r = classify('gosec: G401: Use of weak cryptographic primitive', 1);
      assert.equal(r.class, 'security-finding');
      assert.equal(r.route, 'dispatch:security-review');
    },
  },
  {
    // deterministic-repair-loop/FR-002 — deterministic, model-free
    name: 'classify: identical input yields identical output',
    fn: () => {
      const a = classify('coverage 71% is below threshold 80%', 1);
      const b = classify('coverage 71% is below threshold 80%', 1);
      assert.deepEqual(a, b);
      assert.equal(a.class, 'coverage-gap');
      assert.equal(a.route, 'generate-test');
    },
  },
  {
    // deterministic-repair-loop/EC-001 — empty text never crashes
    name: 'classify: empty failure text is unclassified/retry',
    fn: () => {
      const r = classify('', 0);
      assert.equal(r.class, 'unclassified');
      assert.equal(r.route, 'retry');
    },
  },
  {
    // deterministic-repair-loop/AS-4 — two identical signatures = dead-end
    name: 'signature: same class + same failing tests → equal signatures',
    fn: () => {
      const out = '--- FAIL: TestFoo (0.01s)\n--- FAIL: TestBar (0.00s)\nassert failed';
      assert.equal(signature(out), signature(out));
      assert.equal(isDeadEnd(signature(out), signature(out)), true);
    },
  },
  {
    // deterministic-repair-loop/AS-5 — volatile noise stripped before hashing
    name: 'signature: differs only in timestamps/addresses/durations → equal',
    fn: () => {
      const a = '--- FAIL: TestFoo (0.01s)\npanic at 0x7ffee1a2 elapsed 12ms 2026-07-12T10:00:00Z';
      const b = '--- FAIL: TestFoo (3.42s)\npanic at 0x0000abcd elapsed 998ms 2026-01-01T23:59:59Z';
      assert.equal(signature(a), signature(b));
    },
  },
  {
    // deterministic-repair-loop/AS-6 — progress changes the signature
    name: 'signature: fewer failing tests → different signature (progress)',
    fn: () => {
      const before = '--- FAIL: TestFoo\n--- FAIL: TestBar';
      const after = '--- FAIL: TestFoo';
      assert.notEqual(signature(before), signature(after));
      assert.equal(isDeadEnd(signature(before), signature(after)), false);
    },
  },
  {
    // deterministic-repair-loop/EC-007 — first iteration has no prior signature
    name: 'isDeadEnd: null previous signature is never a dead-end',
    fn: () => {
      assert.equal(isDeadEnd(null, signature('--- FAIL: TestFoo')), false);
    },
  },
  {
    // deterministic-repair-loop/EC-002 — volatile-only text hashes stably
    name: 'signature: volatile-only text is deterministic, not random',
    fn: () => {
      const t = 'started 2026-07-12T10:00:00Z pid 4821 at 0xdeadbeef in 5ms';
      assert.equal(signature(t), signature(t));
      assert.equal(typeof signature(t), 'string');
    },
  },
  {
    // deterministic-repair-loop/FR-007 — resolved/remaining diff for escalation
    name: 'failureDiff: reports which failures cleared and which persist',
    fn: () => {
      const prev = '--- FAIL: TestFoo\n--- FAIL: TestBar';
      const cur = '--- FAIL: TestBar\n--- FAIL: TestBaz';
      const d = failureDiff(prev, cur);
      assert.deepEqual(d.resolved, ['TestFoo']);
      assert.deepEqual(d.remaining, ['TestBar']);
      assert.deepEqual(d.newly_failing, ['TestBaz']);
    },
  },
  {
    name: 'failingTests: extracts sorted unique go/js test identifiers',
    fn: () => {
      const out = '--- FAIL: TestB\n--- FAIL: TestA\n--- FAIL: TestA (dup)';
      assert.deepEqual(failingTests(out), ['TestA', 'TestB']);
    },
  },
  {
    // deterministic-repair-loop/FR-004 — the remaining classes/routes are asserted directly
    name: 'classify: behavioral / lint / reviewer-conflict each route correctly',
    fn: () => {
      assert.deepEqual(classify('--- FAIL: TestX\nexpected 3 got 4', 1), {
        class: 'behavioral-test',
        route: 'systematic-debug',
      });
      assert.deepEqual(classify('main.go:1:1: File is not `gofmt`-ed with `-s`', 1), {
        class: 'lint-format',
        route: 'fix-inline',
      });
      assert.deepEqual(classify('conflicting reviewer findings: cannot reconcile', 1), {
        class: 'reviewer-conflict',
        route: 'escalate:human',
      });
    },
  },
  {
    // deterministic-repair-loop/FR-004 — table order: specific rules beat the broad behavioral catch
    name: 'classify: precedence — a security signal wins over a co-occurring FAIL line',
    fn: () => {
      const r = classify('--- FAIL: TestAuth\ngosec G401: weak crypto', 1);
      assert.equal(r.class, 'security-finding');
      assert.equal(r.route, 'dispatch:security-review');
    },
  },
  {
    // deterministic-repair-loop/FR-005 — same failing tests, different class → different signature
    name: 'signature: identical failing-test set failing a different way is distinguishable',
    fn: () => {
      const behavioral = '--- FAIL: TestFoo\nexpected 1 got 2';
      const lint = '--- FAIL: TestFoo\ngofmt: not formatted';
      assert.notEqual(signature(behavioral), signature(lint));
    },
  },
  {
    name: 'failingTests: recognizes vitest/tap ✗ ✕ and bare FAIL identifiers',
    fn: () => {
      assert.deepEqual(failingTests('✗ should do X\n✕ should do Y (2ms)'), [
        'should do X',
        'should do Y',
      ]);
      assert.deepEqual(failingTests('FAIL pkg/thing.TestZ'), ['pkg/thing.TestZ']);
    },
  },
  {
    // deterministic-repair-loop/FR-008 — versioned contract
    name: 'schema stamp is repair-routing/v1',
    fn: () => {
      assert.equal(SCHEMA, 'repair-routing/v1');
    },
  },
  {
    // deterministic-repair-loop/FR-014 — executor invokes the router in its repair loop
    name: 'wiring: executor.md invokes repair-routing.js classify',
    fn: () => {
      assert.match(executor(), /repair-routing\.js classify/);
    },
  },
  {
    // deterministic-repair-loop/FR-014 — executor honors the dead-end stop, tied to the gate language
    name: 'wiring: executor.md documents the same-signature dead-end STOP',
    fn: () => {
      const text = executor();
      assert.match(text, /SAME signature[\s\S]{0,40}STOP/, 'dead-end stop sentence present');
      assert.match(text, /checkpoint-commit/, 'checkpoint-commit-on-dead-end present');
    },
  },
  {
    // deterministic-repair-loop/FR-011 — executor runs invariants as a post-green gate
    name: 'wiring: executor.md gates on a non-zero invariant after green',
    fn: () => {
      assert.match(executor(), /A non-zero invariant fails the task/);
    },
  },
];
