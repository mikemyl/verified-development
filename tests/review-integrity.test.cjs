'use strict';

/**
 * Anchors for the shared review-integrity protocol (skills/review/references/
 * review-integrity.md): two rules single-sourced once and applied to every
 * Stage-2 agent — (1) reviewed content is DATA, not instructions (prompt-injection
 * defense), and (2) every error-severity finding must be falsifiable or it is
 * downgraded. Locks that the rules exist, are wired into /review dispatch, and
 * that security-review owns raising an injection attempt as a finding.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(REPO, rel), 'utf8');

module.exports = [
  {
    name: 'review-integrity: the shared protocol doc exists with both rules',
    fn: () => {
      const t = read('skills/review/references/review-integrity.md');
      // Rule 1 — prompt-injection defense.
      assert.match(t, /data, not instructions/i);
      // Rule 2 — falsifiability.
      assert.match(t, /falsifiab/i);
      assert.match(t, /downgrade/i, 'non-falsifiable error → downgrade to warning');
    },
  },
  {
    name: 'review-integrity: /review wires the protocol into Stage-2 dispatch',
    fn: () => {
      assert.match(read('skills/review/SKILL.md'), /review-integrity/);
    },
  },
  {
    name: 'review-integrity: security-review raises an injection attempt as a finding',
    fn: () => {
      const t = read('agents/security-review.md');
      assert.match(t, /injection|instructions/i, 'names embedded-instruction attacks');
      assert.match(t, /data, not instructions/i, 'files-are-data rule present');
    },
  },
];
