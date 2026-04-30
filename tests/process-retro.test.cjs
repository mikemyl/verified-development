'use strict';

/**
 * Process-retro extension tests.
 *
 *   1. /review SKILL contains the new step 8c with required anchors.
 *   2. /review SKILL distinguishes process-level from code-level capture.
 *   3. retro.template.md has the four documented sections.
 *   4. learnings.example.md is shaped as an append-only digest.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.resolve(__dirname, '..');

const REVIEW_MD = fs.readFileSync(path.join(REPO, 'skills', 'review', 'SKILL.md'), 'utf8');
const RETRO_TPL = fs.readFileSync(
  path.join(REPO, 'plans', 'process-retro', 'templates', 'retro.template.md'),
  'utf8',
);
const LEARN_TPL = fs.readFileSync(
  path.join(REPO, 'plans', 'process-retro', 'templates', 'learnings.example.md'),
  'utf8',
);

module.exports = [
  {
    name: '/review references retro.md and learnings.md',
    fn: () => {
      assert.ok(REVIEW_MD.includes('retro.md'), '/review must reference retro.md');
      assert.ok(REVIEW_MD.includes('learnings.md'), '/review must reference learnings.md');
    },
  },
  {
    name: '/review documents the four retro sections',
    fn: () => {
      const sections = ['What worked', "What didn't", 'Workflow tuning signals', 'Top process learning'];
      for (const s of sections) {
        assert.ok(
          REVIEW_MD.toLowerCase().includes(s.toLowerCase()),
          `/review must mention section: ${s}`,
        );
      }
    },
  },
  {
    name: '/review distinguishes process-level from code-level capture',
    fn: () => {
      // The whole point: process retro is NOT a duplicate of the existing
      // CONCERNS.md / CONVENTIONS.md / ADR capture. The skill must say so
      // explicitly so future edits don't blur the line.
      assert.ok(
        /process[- ]level/i.test(REVIEW_MD),
        '/review must explicitly call out "process-level"',
      );
      assert.ok(
        /code[- ]level/i.test(REVIEW_MD),
        '/review must explicitly call out "code-level"',
      );
      // And must list at least one example of what does NOT belong in retro.
      assert.ok(
        /CONCERNS\.md|CONVENTIONS\.md|ADR/i.test(REVIEW_MD),
        '/review must reference at least one alternative destination for code learnings',
      );
    },
  },
  {
    name: '/review documents the append-only learnings.md format',
    fn: () => {
      assert.ok(
        /append[- ]only|do NOT modify|append exactly ONE/i.test(REVIEW_MD),
        '/review must document append-only discipline',
      );
      assert.ok(
        /\{YYYY-MM-DD\}|YYYY-MM-DD/.test(REVIEW_MD),
        '/review must show the date format for the digest line',
      );
    },
  },
  {
    name: 'retro.template.md has the four documented sections',
    fn: () => {
      const sections = ['What worked', "What didn't", 'Workflow tuning signals', 'Top process learning'];
      for (const s of sections) {
        assert.ok(RETRO_TPL.includes(s), `retro.template.md missing section: ${s}`);
      }
    },
  },
  {
    name: 'retro.template.md frontmatter has feature/created/phase',
    fn: () => {
      const fm = RETRO_TPL.match(/^---\n([\s\S]*?)\n---/);
      assert.ok(fm, 'retro.template.md must have frontmatter');
      for (const key of ['feature:', 'created:', 'phase:']) {
        assert.ok(fm[1].includes(key), `frontmatter missing ${key}`);
      }
    },
  },
  {
    name: 'learnings.example.md is shaped as a digest list',
    fn: () => {
      // Each non-header line should be a bullet matching the date-feature-learning shape.
      const lines = LEARN_TPL.split('\n').filter(l => l.startsWith('- '));
      assert.ok(lines.length >= 3, 'example must demonstrate multiple entries');
      for (const line of lines) {
        assert.ok(
          /^- \d{4}-\d{2}-\d{2} \*\*[^*]+\*\* —/.test(line),
          `entry does not match digest format: ${line}`,
        );
      }
    },
  },
];
