'use strict';

/**
 * Tests for hooks/lib/finding-signature.js — finding identity across review
 * rounds and the three deterministic termination rules of /review's correction
 * loop.
 *
 * The behaviour under test is the one the old "max 2 iterations" rule could not
 * express: telling "this round found the SAME problem again" from "this round
 * found something genuinely NEW", and deciding — without an LLM — whether the
 * loop has converged, is still working, or is churning and must escalate.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.resolve(__dirname, '..');
const fsig = require(path.join(REPO, 'hooks', 'lib', 'finding-signature.js'));

const f = (over = {}) => ({
  agent: 'correctness-review',
  file: 'internal/pay/refund.go',
  line: 42,
  category: 'off-by-one',
  message: 'Loop bound excludes the final element',
  severity: 'error',
  confidence: 'high',
  ...over,
});

module.exports = [
  // --- identity -------------------------------------------------------------
  {
    name: 'signature: identical findings hash identically',
    fn: () => {
      assert.equal(fsig.signature(f()), fsig.signature(f()));
    },
  },
  {
    name: 'signature: line number is NOT part of the hash (proximity is not an equivalence relation)',
    fn: () => {
      assert.equal(fsig.signature(f({ line: 6 })), fsig.signature(f({ line: 7 })));
      assert.equal(fsig.signature(f({ line: 900 })), fsig.signature(f({ line: 1 })));
    },
  },
  {
    name: 'signature: agent, file and category each change identity',
    fn: () => {
      const base = fsig.signature(f());
      assert.notEqual(base, fsig.signature(f({ agent: 'security-review' })));
      assert.notEqual(base, fsig.signature(f({ file: 'internal/pay/charge.go' })));
      assert.notEqual(base, fsig.signature(f({ category: 'nil-deref' })));
    },
  },
  {
    name: 'signature: category absent — two different findings at one file do not collide on message alone',
    fn: () => {
      const a = fsig.signature(f({ category: undefined, message: 'Guard is inverted' }));
      const b = fsig.signature(f({ category: undefined, message: 'Error is swallowed' }));
      assert.notEqual(a, b);
    },
  },

  // --- message normalization ------------------------------------------------
  {
    name: 'normalizeMessage: a rename inside a quoted span keeps the finding identity',
    fn: () => {
      const before = fsig.signature(f({ message: "`getUser` ignores the returned error" }));
      const after = fsig.signature(f({ message: "`fetchUser` ignores the returned error" }));
      assert.equal(before, after, 'a fix that renames an identifier must not read as a NEW finding');
    },
  },
  {
    name: 'normalizeMessage: line/column references, digests and case are volatile',
    fn: () => {
      const a = fsig.normalizeMessage('Missing guard at refund.go:120:4 (sha 1a2b3c4d5e6f)');
      const b = fsig.normalizeMessage('missing   guard at refund.go:87:11 (sha 9f8e7d6c5b4a)');
      assert.equal(a, b);
    },
  },
  {
    name: 'normalizeMessage: two genuinely different messages stay different',
    fn: () => {
      assert.notEqual(
        fsig.normalizeMessage('Loop bound excludes the final element'),
        fsig.normalizeMessage('Error is swallowed by the deferred close'),
      );
    },
  },
  {
    name: 'normalizeMessage: strips run-to-run volatile tokens (durations, timestamps, addresses, temp paths)',
    fn: () => {
      const withDuration = fsig.normalizeMessage('handler is slow: took 250ms to settle');
      const without = fsig.normalizeMessage('handler is slow: took to settle');
      assert.equal(withDuration, without);
      assert.equal(fsig.stripVolatile('at 2026-10-15T10:00:00Z pid 4242 0xdeadbeef /tmp/x1 (0.01s)'), 'at');
      assert.equal(fsig.stripVolatile('took 250ms'), fsig.stripVolatile('took'));
    },
  },

  // --- new vs carried -------------------------------------------------------
  {
    name: 'matchCarried: same finding re-reported 3 lines away is CARRIED, not new',
    fn: () => {
      const prev = [f({ line: 42 })];
      const cur = [f({ line: 45 })];
      const r = fsig.matchCarried(prev, cur);
      assert.equal(r.carried.length, 1);
      assert.equal(r.new.length, 0);
    },
  },
  {
    name: 'matchCarried: same signature far away is NEW (tolerance is ±3, not unbounded)',
    fn: () => {
      const r = fsig.matchCarried([f({ line: 42 })], [f({ line: 90 })]);
      assert.equal(r.new.length, 1);
      assert.equal(r.carried.length, 0);
    },
  },
  {
    name: 'matchCarried: a missing line on either side falls back to signature equality',
    fn: () => {
      const r = fsig.matchCarried([f({ line: null })], [f({ line: 42 })]);
      assert.equal(r.carried.length, 1);
    },
  },
  {
    name: 'matchCarried: an empty previous round makes every finding new',
    fn: () => {
      const r = fsig.matchCarried([], [f(), f({ category: 'nil-deref' })]);
      assert.equal(r.new.length, 2);
    },
  },

  // --- severity floor -------------------------------------------------------
  {
    name: 'clearsFloor: error/warning at high or medium confidence clears it',
    fn: () => {
      assert.equal(fsig.clearsFloor(f({ severity: 'error', confidence: 'high' })), true);
      assert.equal(fsig.clearsFloor(f({ severity: 'warning', confidence: 'medium' })), true);
    },
  },
  {
    name: 'clearsFloor: suggestions and low-confidence findings do not',
    fn: () => {
      assert.equal(fsig.clearsFloor(f({ severity: 'suggestion' })), false);
      assert.equal(fsig.clearsFloor(f({ severity: 'error', confidence: 'low' })), false);
    },
  },
  {
    name: 'clearsFloor: a missing confidence is treated as high (include-biased — never converge on a guess)',
    fn: () => {
      assert.equal(fsig.clearsFloor(f({ confidence: undefined })), true);
      assert.equal(fsig.clearsFloor(f({ confidence: 'unrecognised-value' })), true);
    },
  },

  // --- termination rules ----------------------------------------------------
  {
    name: 'classifyRound: round 1 always continues (its actionability is the report table, not the floor)',
    fn: () => {
      const r = fsig.classifyRound({ round: 1, previous: [], current: [f({ severity: 'suggestion' })] });
      assert.equal(r.decision, 'continue');
    },
  },
  {
    name: 'classifyRound: zero new findings converges as loop-until-dry',
    fn: () => {
      const r = fsig.classifyRound({ round: 2, previous: [f()], current: [f({ line: 43 })] });
      assert.equal(r.decision, 'converged');
      assert.equal(r.reason, 'loop-until-dry');
      assert.equal(r.carried, 1);
      assert.equal(r.new, 0);
    },
  },
  {
    name: 'classifyRound: new findings that all sit below the floor converge (logged, never chased)',
    fn: () => {
      const r = fsig.classifyRound({
        round: 3,
        previous: [f()],
        current: [f({ category: 'naming', severity: 'suggestion' })],
      });
      assert.equal(r.decision, 'converged');
      assert.equal(r.reason, 'severity-floor');
      assert.equal(r.new, 1);
      assert.equal(r.actionable_new, 0);
    },
  },
  {
    name: 'classifyRound: a new actionable finding keeps the loop running',
    fn: () => {
      const r = fsig.classifyRound({
        round: 2,
        previous: [f()],
        current: [f(), f({ category: 'nil-deref', line: 200 })],
      });
      assert.equal(r.decision, 'continue');
      assert.equal(r.actionable_new, 1);
    },
  },
  {
    name: 'classifyRound: the hard round cap escalates and outranks every other rule',
    fn: () => {
      const r = fsig.classifyRound({ round: 4, previous: [f()], current: [] });
      assert.equal(r.decision, 'escalate');
      assert.equal(r.reason, 'round-cap');
    },
  },
  {
    name: 'classifyRound: the cap is configurable but defaults to 4 (initial panel + 3)',
    fn: () => {
      assert.equal(fsig.MAX_ROUNDS, 4);
      const r = fsig.classifyRound({ round: 2, previous: [f()], current: [], maxRounds: 2 });
      assert.equal(r.decision, 'escalate');
    },
  },
  {
    name: 'classifyRound: emits the contract schema and the round ledger',
    fn: () => {
      const r = fsig.classifyRound({ round: 2, previous: [f()], current: [f({ line: 44 })] });
      assert.equal(r.schema, 'finding-signature/v1');
      assert.equal(r.round, 2);
      assert.ok(Array.isArray(r.new_findings) && Array.isArray(r.carried_findings));
    },
  },

  // --- fix provenance -------------------------------------------------------
  {
    name: 'fixProvenance: a new finding landing inside the previous fix delta is attributed to the fix',
    fn: () => {
      const diff = [
        'diff --git a/internal/pay/refund.go b/internal/pay/refund.go',
        '--- a/internal/pay/refund.go',
        '+++ b/internal/pay/refund.go',
        '@@ -40,3 +40,5 @@',
        ' ctx := r.Context()',
        '+if amount < 0 {',
        '+  return ErrNegative',
        '+}',
        ' return nil',
      ].join('\n');
      const r = fsig.fixProvenance([f({ line: 42 })], diff);
      assert.equal(r.inside, 1);
      assert.equal(r.total, 1);
    },
  },
  {
    name: 'fixProvenance: a finding in an untouched region is not attributed to the fix',
    fn: () => {
      const diff = [
        'diff --git a/internal/pay/refund.go b/internal/pay/refund.go',
        '--- a/internal/pay/refund.go',
        '+++ b/internal/pay/refund.go',
        '@@ -400,2 +400,3 @@',
        ' x := 1',
        '+y := 2',
      ].join('\n');
      const r = fsig.fixProvenance([f({ line: 42 })], diff);
      assert.equal(r.inside, 0);
    },
  },
  {
    name: 'fixProvenance: no diff, an unparseable diff, or a line-less finding attributes nothing (never invents churn)',
    fn: () => {
      assert.equal(fsig.fixProvenance([f()], '').inside, 0);
      assert.equal(fsig.fixProvenance([f()], 'not a diff at all').inside, 0);
      assert.equal(fsig.fixProvenance([f({ line: null })], 'diff --git a/x b/x\n@@ -1,1 +1,2 @@\n+z').inside, 0);
    },
  },
  {
    name: 'classifyRound: fix provenance rides along when the previous round fix diff is supplied',
    fn: () => {
      const diff = 'diff --git a/internal/pay/refund.go b/internal/pay/refund.go\n@@ -40,3 +40,5 @@\n+guard\n';
      const r = fsig.classifyRound({
        round: 2,
        previous: [],
        current: [f()],
        fixDiff: diff,
      });
      assert.equal(r.fix_provenance_new, 1);
    },
  },

  // --- robustness -----------------------------------------------------------
  {
    name: 'never throws on malformed input',
    fn: () => {
      assert.doesNotThrow(() => fsig.signature({}));
      assert.doesNotThrow(() => fsig.matchCarried(null, undefined));
      assert.doesNotThrow(() => fsig.classifyRound({}));
      assert.doesNotThrow(() => fsig.normalizeMessage(undefined));
    },
  },

  // --- wiring ---------------------------------------------------------------
  {
    name: '/review correction loop is governed by the round ledger, not a bare iteration count',
    fn: () => {
      const review = fs.readFileSync(path.join(REPO, 'skills', 'review', 'SKILL.md'), 'utf8');
      assert.ok(review.includes('finding-signature.js'), '/review must run the round ledger');
      assert.ok(review.includes('--max-rounds 2'), '/review caps at one verification round');
      assert.ok(review.includes('blocking_new_errors'), '/review reads what the round would ship');
      assert.ok(review.includes('converged'), '/review follows the ledger decision');
    },
  },

  // --- CLI seam -------------------------------------------------------------
  {
    name: 'CLI: round prints the contract JSON and exits 0',
    fn: () => {
      const os = require('node:os');
      const cp = require('node:child_process');
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fsig-'));
      const cur = path.join(dir, 'cur.json');
      fs.writeFileSync(cur, JSON.stringify([f()]));
      const r = cp.spawnSync(process.execPath, [
        path.join(REPO, 'hooks', 'lib', 'finding-signature.js'), 'round', '--round', '1', '--current', cur,
      ], { encoding: 'utf8' });
      assert.equal(r.status, 0, r.stderr);
      const out = JSON.parse(r.stdout);
      assert.equal(out.schema, 'finding-signature/v1');
      assert.equal(out.decision, 'continue');
    },
  },
  {
    name: 'CLI: a missing subcommand or --current is a usage error (exit 1), never a crash',
    fn: () => {
      const cp = require('node:child_process');
      const bin = path.join(REPO, 'hooks', 'lib', 'finding-signature.js');
      assert.equal(cp.spawnSync(process.execPath, [bin], { encoding: 'utf8' }).status, 1);
      assert.equal(cp.spawnSync(process.execPath, [bin, 'round'], { encoding: 'utf8' }).status, 1);
    },
  },
  {
    name: 'CLI: an unreadable or malformed findings file degrades to empty, never throws',
    fn: () => {
      const os = require('node:os');
      const cp = require('node:child_process');
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fsig-'));
      const bad = path.join(dir, 'bad.json');
      fs.writeFileSync(bad, '{not json');
      const r = cp.spawnSync(process.execPath, [
        path.join(REPO, 'hooks', 'lib', 'finding-signature.js'), 'round', '--round', '2',
        '--current', bad, '--previous', path.join(dir, 'absent.json'),
      ], { encoding: 'utf8' });
      assert.equal(r.status, 0, r.stderr);
      assert.equal(JSON.parse(r.stdout).new, 0);
    },
  },
];
