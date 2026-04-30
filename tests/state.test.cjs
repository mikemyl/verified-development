'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const state = require('../hooks/lib/state.js');

function tmpProjectDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vd-state-'));
  fs.mkdirSync(path.join(dir, '.verified'), { recursive: true });
  return dir;
}

function writeRaw(dir, contents) {
  fs.writeFileSync(path.join(dir, '.verified', 'state.md'), contents, 'utf8');
}

const V1_LEGACY = `---
feature: legacy-feature
phase: implement
status: in_progress
last_activity: 2026-04-15
---

## Notes

Some legacy body content.
`;

const V2_FRESH = `---
feature: brand-new
phase: specify
status: in_progress
last_activity: 2020-01-01
active_phase: ""
next_action: "/plan"
next_phases: ["plan", "ui-spec"]
schema_version: 2
---

# Body
`;

module.exports = [
  {
    name: 'parseFrontmatter handles a typical block',
    fn: () => {
      const { frontmatter, body } = state.parseFrontmatter(V2_FRESH);
      assert.equal(frontmatter.feature, 'brand-new');
      assert.equal(frontmatter.next_action, '/plan');
      assert.deepEqual(frontmatter.next_phases, ['plan', 'ui-spec']);
      assert.equal(frontmatter.schema_version, 2);
      assert.ok(body.includes('# Body'));
    },
  },
  {
    name: 'parseFrontmatter returns body untouched when no frontmatter',
    fn: () => {
      const { frontmatter, body } = state.parseFrontmatter('plain text\n');
      assert.deepEqual(frontmatter, {});
      assert.equal(body, 'plain text\n');
    },
  },
  {
    name: 'read returns null when state.md is absent',
    fn: () => {
      const dir = tmpProjectDir();
      try {
        assert.equal(state.read(dir), null);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    },
  },
  {
    name: 'read of v1 legacy file applies defaults and reports schema_version: 1',
    fn: () => {
      const dir = tmpProjectDir();
      try {
        writeRaw(dir, V1_LEGACY);
        const result = state.read(dir);
        assert.equal(result.frontmatter.feature, 'legacy-feature');
        assert.equal(result.frontmatter.phase, 'implement');
        assert.equal(result.frontmatter.active_phase, '', 'missing field defaulted');
        assert.equal(result.frontmatter.next_action, '', 'missing field defaulted');
        assert.deepEqual(result.frontmatter.next_phases, []);
        assert.equal(result.frontmatter.schema_version, 1, 'v1 file reports v1');
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    },
  },
  {
    name: 'next write of a v1 file bumps to v2 without dropping unknown fields',
    fn: () => {
      const dir = tmpProjectDir();
      try {
        // v1 file with an extra unknown key — must not be dropped on upgrade
        writeRaw(
          dir,
          `---
feature: legacy-feature
phase: plan
status: in_progress
last_activity: 2026-04-20
custom_field: keepme
---

body
`,
        );
        state.update(dir, { phase: 'implement' });
        const after = state.read(dir);
        assert.equal(after.frontmatter.schema_version, 2, 'bumped to v2');
        assert.equal(after.frontmatter.phase, 'implement');
        assert.equal(after.frontmatter.custom_field, 'keepme', 'unknown field preserved');
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    },
  },
  {
    name: 'update auto-refreshes last_activity unless caller provides one',
    fn: () => {
      const dir = tmpProjectDir();
      try {
        writeRaw(dir, V2_FRESH);
        const before = state.read(dir).frontmatter.last_activity;
        // Force a different date to ensure update would change it.
        state.update(dir, { phase: 'plan' });
        const after = state.read(dir).frontmatter.last_activity;
        const today = new Date().toISOString().slice(0, 10);
        assert.equal(after, today);
        assert.notEqual(before, after, 'last_activity refreshed');
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    },
  },
  {
    name: 'write rejects state.md exceeding 100 lines',
    fn: () => {
      const dir = tmpProjectDir();
      try {
        writeRaw(dir, V2_FRESH);
        const huge = 'line\n'.repeat(200);
        const current = state.read(dir);
        assert.throws(
          () => state.write(dir, { frontmatter: current.frontmatter, body: huge }),
          /size cap/,
        );
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    },
  },
  {
    name: 'validate rejects unknown phase',
    fn: () => {
      assert.throws(
        () =>
          state.validate({
            feature: 'x',
            phase: 'plan-phase',
            status: '',
            last_activity: '',
            active_phase: '',
            next_action: '',
            next_phases: [],
          }),
        /phase/,
      );
    },
  },
  {
    name: 'roundtrip preserves body content',
    fn: () => {
      const dir = tmpProjectDir();
      try {
        writeRaw(dir, V2_FRESH);
        const before = state.read(dir);
        state.write(dir, { frontmatter: before.frontmatter, body: before.body });
        const after = state.read(dir);
        assert.equal(after.body, before.body);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    },
  },
];
