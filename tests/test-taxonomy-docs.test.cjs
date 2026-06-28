'use strict';

/**
 * Doc-framing prompt-anchor net for the enforced-test-taxonomy feature (T010).
 *
 * Locks the DOC-FRAMING edits made later by T013 (/map), T014 (/init),
 * T015 (tdd-go + testing), T016 (test-review + test-design-reviewer).
 *
 * These assertions are the SHARED CONTRACT for those editors: each required
 * substring below must appear verbatim (case-sensitive) in its file, and the
 * forbidden substring must be removed. Until those edits land, this suite FAILS.
 *
 * Pattern mirrors tests/prompt-anchors.test.cjs: read the markdown, assert
 * the anchor strings are present (or, for the negative case, absent).
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function mustContain(content, needles, label) {
  for (const n of needles) {
    assert.ok(
      content.includes(n),
      `${label}: expected to contain ${JSON.stringify(n)}`,
    );
  }
}

module.exports = [
  {
    name: '/map writes a Test Types section seeded from the seed file with Mermaid',
    fn: () => {
      const content = read('skills/map/SKILL.md');
      mustContain(
        content,
        ['## Test Types', 'test-types-seed.md', 'mermaid'],
        'skills/map/SKILL.md',
      );
    },
  },
  {
    name: '/init-project scaffolds a Test Types section from the seed file',
    fn: () => {
      const content = read('skills/init-project/SKILL.md');
      mustContain(
        content,
        ['## Test Types', 'test-types-seed.md'],
        'skills/init-project/SKILL.md',
      );
    },
  },
  {
    name: 'tdd-go frames coverage as a consequence and drops the per-error mandate',
    fn: () => {
      const content = read('skills/tdd-go/SKILL.md');
      mustContain(content, ['coverage is a consequence'], 'skills/tdd-go/SKILL.md');
      assert.ok(
        !content.toLowerCase().includes('every error return needs a test'),
        'skills/tdd-go/SKILL.md: expected NOT to contain "Every error return needs a test" (case-insensitive)',
      );
    },
  },
  {
    name: 'testing skill names the sanctioned boundary',
    fn: () => {
      const content = read('skills/testing/SKILL.md');
      mustContain(content, ['sanctioned boundary'], 'skills/testing/SKILL.md');
    },
  },
  {
    name: 'test-review treats taxonomy/quality findings as WARN-only',
    fn: () => {
      const content = read('agents/test-review.md');
      mustContain(
        content,
        ['sanctioned test type', 'non-blocking `warning`'],
        'agents/test-review.md',
      );
    },
  },
  {
    name: 'test-design-reviewer treats taxonomy mismatch as a non-blocking signal',
    fn: () => {
      const content = read('skills/test-design-reviewer/SKILL.md');
      mustContain(
        content,
        ['sanctioned test type', 'non-blocking, advisory'],
        'skills/test-design-reviewer/SKILL.md',
      );
    },
  },
];
