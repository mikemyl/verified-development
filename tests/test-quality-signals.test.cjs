'use strict';

/**
 * Anchors for the test-quality-signals additions (roadmap #3): oracle provenance
 * (circular-test taxonomy), unarmored-region detection, and reflection-into-privates
 * — all NON-BLOCKING signals added to test-review, with oracle provenance co-located
 * with Farley's Necessary property in test-design-reviewer and referenced (not
 * restated) from test-audit. Locks the content and, critically, that none of these
 * regress the blocking framing (only criteria 1–6 + 5b gate).
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(REPO, rel), 'utf8');

module.exports = [
  {
    name: 'test-review: oracle provenance criterion classifies circular oracles, non-blocking',
    fn: () => {
      const t = read('agents/test-review.md');
      assert.match(t, /Oracle Provenance/i);
      assert.match(t, /CIRCULAR/);
      assert.match(t, /SPEC-DERIVED/);
      assert.match(t, /snapshot/i, 'names circular-oracle signals');
      // Must be tied to Farley Necessary and be non-blocking.
      assert.match(t, /Necessary/);
    },
  },
  {
    name: 'test-review: unarmored-region and reflection-into-privates criteria present',
    fn: () => {
      const t = read('agents/test-review.md');
      assert.match(t, /Unarmored Regions/i);
      assert.match(t, /neither[\s\S]{0,40}coverage/i, 'unarmored = neither coverage nor defense');
      assert.match(t, /Reflection Into Privates/i);
      assert.match(t, /reaching around the seam/i);
    },
  },
  {
    name: 'test-review: the three new signals are explicitly non-blocking (framing not regressed)',
    fn: () => {
      const t = read('agents/test-review.md');
      // The gate-framing line must still name only 1–6 + 5b as gating.
      assert.match(t, /Only criteria 1–6 \(and the two 5b craft violations\) gate/);
      // 5b stays blocking; the new criteria are in the warning list.
      assert.match(t, /5b\. Must-not-ship craft violations \(BLOCKING/);
      assert.match(t, /circular oracles \(criterion 9\)/);
    },
  },
  {
    name: 'test-design-reviewer: oracle provenance is the lens for the Necessary property',
    fn: () => {
      const t = read('skills/test-design-reviewer/SKILL.md');
      assert.match(t, /Oracle provenance/i);
      assert.match(t, /CIRCULAR/);
      assert.match(t, /lower its N score/i);
    },
  },
  {
    name: 'test-audit: references oracle/unarmored from test-review (single-sourced)',
    fn: () => {
      const t = read('skills/test-audit/SKILL.md');
      assert.match(t, /oracle provenance/i);
      assert.match(t, /unarmored/i);
      // Must point at test-review's criteria, not restate the definitions.
      assert.match(t, /test-review\.md.*criteria 9/i);
    },
  },
  {
    // test-weakening-detection/AS-7 + SC-005 — the fourth non-blocking signal joins the lock
    name: 'test-weakening: test-review carries a NON-BLOCKING test-weakening criterion',
    fn: () => {
      const t = read('agents/test-review.md');
      assert.match(t, /test-weakening|weakened|lost assertions/i, 'the criterion is present');
      // The gate framing must STILL name only 1–6 + 5b as gating — this signal does not gate.
      assert.match(t, /Only criteria 1–6 \(and the two 5b craft violations\) gate/);
    },
  },
  {
    // test-weakening-detection/design-Sug1 — name the dominant legitimate cause (esp. actor-BDD)
    name: 'test-weakening: the criterion names consolidation / fixture-chaining as legit causes',
    fn: () => {
      const t = read('agents/test-review.md');
      assert.match(t, /consolidat|table-driven/i, 'assertion consolidation named');
      assert.match(t, /Sends|Receives|fixture[- ]chain/i, 'actor-BDD fixture-chaining named');
    },
  },
  {
    // test-weakening-detection/AS-7 — /review runs the scan over the review range
    name: 'test-weakening: /review runs test-weakening.js scan over the git range',
    fn: () => {
      assert.match(read('skills/review/SKILL.md'), /test-weakening\.js scan/);
    },
  },
];
