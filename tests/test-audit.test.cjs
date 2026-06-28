'use strict';

/**
 * test-audit feature — prompt-anchor + single-source drift net.
 *
 * SHARED CONTRACT for tasks T010/T011/T012. These substrings are the exact
 * anchors the later skill/doc edits MUST include verbatim. Written RED first
 * (T009): the skill edits land later, so every assertion below must FAIL now.
 *
 * Single-source rule (AS-018 / SC-008): the six generic, language-neutral craft
 * rules live ONLY in skills/testing/SKILL.md. The audit skill, /map, tdd-go and
 * the TS testing skills must REFERENCE the `testing` skill, never restate the
 * canonical rule text. The drift guard enforces both halves.
 *
 * Pattern lifted from tests/test-taxonomy.test.cjs and tests/prompt-anchors.test.cjs:
 * read the prompt markdown and assert key strings are present (case-sensitive).
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Tolerant read: a not-yet-created skill file yields '' so the includes()
// assertions fail with the meaningful "missing substring" message rather than
// crashing on ENOENT.
function read(...parts) {
  const file = path.join(__dirname, '..', ...parts);
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}

function mustContain(content, needles, file) {
  for (const n of needles) {
    assert.ok(
      content.includes(n),
      `${file}: expected to contain ${JSON.stringify(n)}`,
    );
  }
}

function mustNotContain(content, needle, file) {
  assert.ok(
    !content.includes(needle),
    `${file}: must NOT contain ${JSON.stringify(needle)} (single-source: lives only in skills/tdd-go/SKILL.md)`,
  );
}

module.exports = [
  {
    name: 'testing skill names all six generic craft rules (single source — T010)',
    fn: () => {
      const file = 'skills/testing/SKILL.md';
      const content = read('skills', 'testing', 'SKILL.md');
      mustContain(
        content,
        [
          'immutable fixture chaining',
          'captured data',
          'single behavior',
          'Sends',
          'Receives',
        ],
        file,
      );
    },
  },
  {
    name: 'test-audit skill has required anchors (T011)',
    fn: () => {
      const file = 'skills/test-audit/SKILL.md';
      const content = read('skills', 'test-audit', 'SKILL.md');
      mustContain(
        content,
        [
          'test-corpus.js',
          '## Test Types',
          '/map',
          '.verified/audits/',
          'test-design-reviewer',
          'read-only',
          'advisory',
          // Behavior anchors — close the SC-001 coverage gap the spec-compliance gate found:
          'configurable', // AS-005 — N (deep-dive count) is configurable
          'not deep-reviewed', // AS-005 / EC-005 — surface the un-reviewed tail, no silent truncation
          'Farley score', // AS-006 / FR-005 — per-test quality score
          'craft verdict', // AS-006 — the verdict the deep-dive produces
          'recommendation', // AS-006 — concrete fix per offender
          'craft patterns', // AS-015 — verdict cites which patterns hold/violate
          'overwrites', // AS-012 — re-run regenerates the report
          'fall back', // EC-009 — generic rules when a type has no exemplars
          'stale', // EC-010 — note a dead good-example reference, don't fail
        ],
        file,
      );
    },
  },
  {
    name: 'map skill populates the new taxonomy fields (T012)',
    fn: () => {
      const file = 'skills/map/SKILL.md';
      const content = read('skills', 'map', 'SKILL.md');
      mustContain(
        content,
        ['match-paths', 'match-markers', 'good-example', 'anti-patterns'],
        file,
      );
    },
  },
  {
    name: 'drift guard: audit skill REFERENCES the testing skill, does not restate the rules (AS-018/SC-008)',
    fn: () => {
      const file = 'skills/test-audit/SKILL.md';
      const content = read('skills', 'test-audit', 'SKILL.md');
      mustContain(content, ['testing'], file);
      mustNotContain(content, 'immutable fixture chaining', file);
    },
  },
  {
    name: 'drift guard: /map REFERENCES the testing skill, does not restate the rules (AS-018/SC-008)',
    fn: () => {
      const file = 'skills/map/SKILL.md';
      const content = read('skills', 'map', 'SKILL.md');
      mustContain(content, ['testing'], file);
      mustNotContain(content, 'immutable fixture chaining', file);
    },
  },
  {
    name: 'drift guard: tdd-go relocated the rules, does not restate immutable fixture chaining (AS-018/SC-008)',
    fn: () => {
      const file = 'skills/tdd-go/SKILL.md';
      const content = read('skills', 'tdd-go', 'SKILL.md');
      mustContain(content, ['testing'], file);
      mustNotContain(content, 'immutable fixture chaining', file);
    },
  },
];
