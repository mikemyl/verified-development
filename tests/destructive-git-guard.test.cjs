'use strict';
/**
 * tests/destructive-git-guard.test.cjs — AS-013 (ledger) + AS-014 (prose anchors)
 *
 * The libs are tested in git-guard.test.cjs / checkpoint.test.cjs. This file
 * locks the wiring: the class rule (not a list) in the executor, checkpoints
 * at wave/round boundaries, no SendMessage redirects, the FAIL-at-cap rule,
 * and test-review criterion 13 staying non-blocking.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const fsig = require('../hooks/lib/finding-signature.js');
const read = rel => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

const f = (o = {}) => ({
  agent: 'security-review', file: 'a.go', line: 10, category: 'injection',
  message: 'marker escape', severity: 'error', confidence: 'high', ...o,
});

module.exports = [
  {
    name: 'ledger: the round cap reports what it would ship — blocking_new_errors (AS-013, FR-006)',
    fn() {
      const r = fsig.classifyRound({ round: 4, previous: [], current: [f(), f({ message: 'other', severity: 'warning' }), f({ message: 'low', confidence: 'low' })] });
      assert.equal(r.decision, 'escalate');
      assert.equal(r.reason, 'round-cap');
      assert.equal(r.blocking_new_errors, 1, 'one new high-confidence error; the warning and the low-confidence error do not count');
      const clean = fsig.classifyRound({ round: 4, previous: [f()], current: [f({ line: 12 })] });
      assert.equal(clean.blocking_new_errors, 0, 'a carried error is not NEW — it was already reported');
      assert.equal(fsig.classifyRound({ round: 2, previous: [], current: [f()] }).blocking_new_errors, 1, 'field is present on every round');
    },
  },
  {
    name: 'executor: forbids the CLASS of work-discarding git commands, names the hook and the restore path, no "checkpoint-commit" (AS-014)',
    fn() {
      const t = read('agents/executor.md');
      assert.match(t, /Never run a git command that can discard uncommitted work/);
      assert.match(t, /the CLASS, not a\s+list/);
      for (const verb of ['git stash', 'git checkout', 'git switch', 'git restore', 'reset --hard', 'git clean', 'git rebase', 'worktree remove', '--abort']) {
        assert.ok(t.includes(verb), `executor enumerates ${verb}`);
      }
      assert.match(t, /hooks\/git-guard\.js/);
      assert.match(t, /checkpoint\.js restore <ref> <path>/);
      assert.match(t, /not a\s+puzzle to route around/);
      assert.doesNotMatch(t, /checkpoint-commit/, 'the repair loop must not tell an executor to commit');
    },
  },
  {
    name: 'implement: checkpoints at wave start/end, ListAgents before dispatch, no SendMessage redirect, golden path first in the brief (AS-014)',
    fn() {
      const t = read('skills/implement/SKILL.md');
      assert.match(t, /checkpoint\.js create[\s\S]*--label wave-\{N\}-start/);
      assert.match(t, /--label\s+wave-\{N\}-end/);
      assert.match(t, /refs\/verified\/checkpoints/);
      assert.match(t, /Before every dispatch, run `ListAgents`/);
      assert.match(t, /Never redirect a running or completed agent with `SendMessage`/);
      assert.match(t, /golden path, FIRST and as a hard constraint/);
      assert.match(t, /extend the DSL/);
    },
  },
  {
    name: 'review: snapshot before each correction round; FAIL at the cap when blocking_new_errors > 0; only the user raises the cap (AS-014)',
    fn() {
      const t = read('skills/review/SKILL.md');
      assert.match(t, /checkpoint\.js create --feature\s+\{feature-name\} --label review-round-\{N\}/);
      assert.match(t, /blocking_new_errors > 0[\s\S]*Status is FAIL/);
      assert.match(t, /never raise it yourself/);
    },
  },
  {
    name: 'quick + continue: checkpoint before GREEN; no rewind via checkout/reset (AS-014)',
    fn() {
      assert.match(read('skills/quick/SKILL.md'), /checkpoint\.js create --feature quick/);
      const c = read('skills/continue/SKILL.md');
      assert.match(c, /checkpoint\.js list --feature <feature>/);
      assert.doesNotMatch(c, /rewind to handoff sha/);
    },
  },
  {
    name: 'test-review: criterion 13 (contract doubles missing a new field) is present and NON-blocking (AS-014)',
    fn() {
      const t = read('agents/test-review.md');
      assert.match(t, /### 13\. Contract Doubles That Omit a New Field \(test-quality signal — non-blocking\)/);
      assert.match(t, /hand-written mock/i);
      assert.match(t, /contract doubles that omit a new field \(13\) are all non-blocking/);
      assert.match(t, /Only criteria 1–6 \(and the two 5b craft violations\) gate/);
    },
  },
  {
    name: 'docs: configuration.md documents the hooks.git_guard opt-out and the env switch',
    fn() {
      const d = read('docs/configuration.md');
      assert.match(d, /hooks\.git_guard/);
      assert.match(d, /VERIFIED_GIT_GUARD/);
    },
  },
];
