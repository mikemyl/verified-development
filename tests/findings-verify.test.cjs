'use strict';

/**
 * Anchor test: /verify runs findings.js and surfaces the findings/v1 envelope as
 * a NON-BLOCKING informational section. The non-gating guarantee itself is
 * enforced by findings.js's CLI contract (exit 0, no `fail` status — unit-tested
 * in findings.test.cjs); this locks that the skill wiring says so and stays.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const verify = () =>
  fs.readFileSync(path.join(__dirname, '..', 'skills', 'verify', 'SKILL.md'), 'utf8');

module.exports = [
  {
    // structured-finding-layer/AS-8 + FR-010 — /verify runs findings.js
    name: 'verify wiring: /verify invokes findings.js scan',
    fn: () => {
      assert.match(verify(), /findings\.js scan/);
    },
  },
  {
    // structured-finding-layer/AS-8 + SC-005 — surfaced as non-blocking, gate untouched
    name: 'verify wiring: the findings section is explicitly non-gating',
    fn: () => {
      const t = verify();
      assert.match(t, /findings\/v1|structured findings/i, 'names the envelope section');
      assert.match(t, /non-?blocking|never (flips|gates|blocks)|informational/i, 'states non-gating');
      assert.match(t, /sole gate|remains the gate|pass\/fail gate/i, 'existing verify stays the gate');
    },
  },
];
