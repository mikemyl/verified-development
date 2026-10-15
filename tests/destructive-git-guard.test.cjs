'use strict';
/**
 * tests/destructive-git-guard.test.cjs — AS-013 (ledger) + AS-014 (prose anchors)
 *
 * The libs are tested in git-guard.test.cjs / checkpoint.test.cjs. This file
 * locks the wiring: the project-rules template carries the class rule (not a
 * list), /review snapshots before its one verification round, the FAIL rule
 * for new errors, and test-review criterion 13 staying non-blocking.
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
    name: 'review: snapshot before the verification round; FAIL when blocking_new_errors > 0; no third round (AS-014)',
    fn() {
      const t = read('skills/review/SKILL.md');
      assert.match(t, /checkpoint\.js create --feature review\s+--label round-2/);
      assert.match(t, /blocking_new_errors > 0[\s\S]*Status FAIL/);
      assert.match(t, /There is no round 3/);
    },
  },
  {
    name: 'project-rules template: forbids the CLASS of work-discarding git commands and names the restore path (AS-014)',
    fn() {
      const t = read('templates/project-rules.md');
      assert.match(t, /the class, not a list/);
      for (const verb of ['git stash', 'git checkout', 'git switch', 'git restore', 'git reset --hard', 'git clean', 'git rebase', 'worktree remove', '--abort']) {
        assert.ok(t.includes(verb), `template enumerates ${verb}`);
      }
      assert.match(t, /checkpoint\.js restore <ref> <path>/);
      assert.match(t, /git-guard/);
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
    name: 'docs: how-it-works.md documents the hooks.git_guard opt-out and the env switch',
    fn() {
      const d = read('docs/how-it-works.md');
      assert.match(d, /hooks\.git_guard/);
      assert.match(d, /VERIFIED_GIT_GUARD/);
    },
  },
];
