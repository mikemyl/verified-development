'use strict';

/**
 * Tests for the test-taxonomy resolver (hooks/lib/taxonomy.js — T003).
 *
 * The taxonomy resolves repo-defined `## Test Types` when present and falls
 * back to the shipped seed otherwise (authoritative-not-merged, FR-003/AS-010).
 * This suite is RED until taxonomy.js exists.
 *
 * Parsed-object field contract (T003 must match):
 *   - markdown `- **boundary:** …`     → type.boundary    (string)
 *   - markdown `- **pattern:** …`      → type.pattern     (string)
 *   - markdown `- **location:** …`     → type.location    (string)
 *   - markdown `- **tier:** …`         → type.tier        (string)
 *   - markdown `- **when-to-use:** …`  → type.when_to_use (string, hyphen→underscore)
 *   - markdown `- **primitives:** …`   → type.primitives  (string)
 *   - a ```mermaid fence in the subsection → type.has_diagram (boolean)
 *
 * parseTaxonomy(md) → { types: {<name>: typeObj}, defects: [{type, field}] }
 * loadSeed()        → same shape, read from hooks/lib/test-types-seed.md
 * resolve({repoDoc})→ { types, source: "repo"|"seed", defects: [] }
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { parseTaxonomy, loadSeed, resolve } = require('../hooks/lib/taxonomy.js');

const CLI = path.join(__dirname, '..', 'hooks', 'lib', 'taxonomy.js');

const REQUIRED_FIELDS = ['boundary', 'pattern', 'location', 'tier', 'when_to_use', 'primitives'];

// A minimal but valid repo `## Test Types` doc with its OWN type list:
// {acceptance, handler} — deliberately omits the seed-only `dao`/`unit`/`none`.
const repoDocOwnTypes = `# Testing

Some intro prose.

## Test Types

### acceptance
- **boundary:** public/API
- **pattern:** actor-based Sends/Receives DSL
- **location:** tests/acceptance
- **tier:** default
- **when-to-use:** Default for user-observable behavior.
- **primitives:** Sends, Receives, world fixtures

\`\`\`mermaid
flowchart LR
    actor([Actor]) --> sut[SUT]
\`\`\`

### handler
- **boundary:** HTTP handler
- **pattern:** httptest recorder
- **location:** internal/http
- **tier:** exception
- **when-to-use:** When asserting transport-level concerns.
- **primitives:** httptest.NewRecorder, request builders

\`\`\`mermaid
flowchart LR
    req([Request]) --> handler[Handler under test]
\`\`\`
`;

// repoDoc with no `## Test Types` section at all → fall back to seed.
const repoDocNoSection = `# Testing

We test things. No taxonomy section here.

## Fixtures

Some fixture notes.
`;

// repoDoc whose `## Test Types` section is present but empty → fall back to seed.
const repoDocEmptySection = `# Testing

## Test Types

## Something Else
`;

// repoDoc with a type missing a required field (no boundary) → defect.
const repoDocMissingField = `## Test Types

### acceptance
- **pattern:** actor-based Sends/Receives DSL
- **location:** tests/acceptance
- **tier:** default
- **when-to-use:** Default.
- **primitives:** Sends, Receives

\`\`\`mermaid
flowchart LR
    a --> b
\`\`\`
`;

// repoDoc with a type that has prose but no mermaid fence → has_diagram:false, no throw.
const repoDocNoDiagram = `## Test Types

### acceptance
- **boundary:** public/API
- **pattern:** actor-based Sends/Receives DSL
- **location:** tests/acceptance
- **tier:** default
- **when-to-use:** Default for user-observable behavior.
- **primitives:** Sends, Receives
`;

module.exports = [
  {
    name: 'seed parses to exactly the four seed types with all fields + diagrams',
    fn: () => {
      const { types } = loadSeed();
      assert.deepEqual(Object.keys(types).sort(), ['acceptance', 'dao', 'none', 'unit']);

      for (const name of Object.keys(types)) {
        const t = types[name];
        for (const f of REQUIRED_FIELDS) {
          assert.equal(typeof t[f], 'string', `${name}.${f} should be a string`);
          assert.ok(t[f].length > 0, `${name}.${f} should be non-empty`);
        }
        assert.equal(t.has_diagram, true, `${name} should have a mermaid diagram`);
      }

      // tier mapping from the seed
      assert.equal(types.acceptance.tier, 'default');
      assert.equal(types.dao.tier, 'exception');
      assert.equal(types.unit.tier, 'sign-off');
      assert.equal(types.none.tier, 'sign-off');
    },
  },

  {
    name: 'resolve uses the repo taxonomy when a non-empty section is present',
    fn: () => {
      const r = resolve({ repoDoc: repoDocOwnTypes });
      assert.equal(r.source, 'repo');
      assert.ok(r.types.acceptance, 'repo acceptance type present');
      assert.equal(r.types.acceptance.boundary, 'public/API');
      assert.deepEqual(r.defects, []);
    },
  },

  {
    name: 'resolve falls back to seed when no Test Types section exists (EC-002)',
    fn: () => {
      const r = resolve({ repoDoc: repoDocNoSection });
      assert.equal(r.source, 'seed');
      assert.deepEqual(Object.keys(r.types).sort(), ['acceptance', 'dao', 'none', 'unit']);
    },
  },

  {
    name: 'resolve falls back to seed when the Test Types section is empty (EC-002)',
    fn: () => {
      const r = resolve({ repoDoc: repoDocEmptySection });
      assert.equal(r.source, 'seed');
      assert.deepEqual(Object.keys(r.types).sort(), ['acceptance', 'dao', 'none', 'unit']);
    },
  },

  {
    name: 'repo taxonomy is authoritative, not merged with the seed (AS-010)',
    fn: () => {
      const r = resolve({ repoDoc: repoDocOwnTypes });
      assert.equal(r.source, 'repo');
      assert.deepEqual(Object.keys(r.types).sort(), ['acceptance', 'handler']);
      assert.equal(r.types.dao, undefined, 'seed-only type dao must NOT be merged in');
      assert.equal(r.types.unit, undefined, 'seed-only type unit must NOT be merged in');
    },
  },

  {
    name: 'a type missing a required field is reported as a defect (EC-003)',
    fn: () => {
      const r = resolve({ repoDoc: repoDocMissingField });
      assert.ok(Array.isArray(r.defects), 'defects is an array');
      assert.ok(r.defects.length > 0, 'a defect should be reported');
      const d = r.defects.find(d => d.type === 'acceptance' && d.field === 'boundary');
      assert.ok(d, `defect naming type=acceptance field=boundary expected — got ${JSON.stringify(r.defects)}`);
    },
  },

  {
    name: 'prose without a mermaid fence sets has_diagram:false and does not throw (EC-004)',
    fn: () => {
      const { types } = parseTaxonomy(repoDocNoDiagram);
      assert.equal(types.acceptance.has_diagram, false);
      // and the field data still parsed
      assert.equal(types.acceptance.boundary, 'public/API');
    },
  },

  {
    name: 'CLI: resolve - reads stdin, exits 0, and reports source:"repo" for a repo doc with a Test Types section',
    fn: () => {
      const r = spawnSync('node', [CLI, 'resolve', '-'], {
        input: repoDocOwnTypes,
        encoding: 'utf8',
      });
      assert.equal(r.status, 0, `expected exit 0, got ${r.status}; stderr: ${r.stderr}`);
      const out = JSON.parse(r.stdout);
      assert.equal(out.source, 'repo');
      assert.ok(out.types.acceptance, 'repo acceptance type present in CLI output');
    },
  },

  {
    name: 'CLI: resolve - on a doc with no Test Types section falls back to source:"seed"',
    fn: () => {
      const r = spawnSync('node', [CLI, 'resolve', '-'], {
        input: repoDocNoSection,
        encoding: 'utf8',
      });
      assert.equal(r.status, 0, `expected exit 0, got ${r.status}; stderr: ${r.stderr}`);
      const out = JSON.parse(r.stdout);
      assert.equal(out.source, 'seed');
    },
  },

  {
    name: 'CLI: resolve <file> reads a repo TESTING.md from disk and reports source:"repo"',
    fn: () => {
      const tmp = path.join(os.tmpdir(), `taxonomy-cli-${process.pid}-${Date.now()}.md`);
      try {
        fs.writeFileSync(tmp, repoDocOwnTypes, 'utf8');
        const r = spawnSync('node', [CLI, 'resolve', tmp], { encoding: 'utf8' });
        assert.equal(r.status, 0, `expected exit 0, got ${r.status}; stderr: ${r.stderr}`);
        const out = JSON.parse(r.stdout);
        assert.equal(out.source, 'repo');
      } finally {
        fs.rmSync(tmp, { force: true });
      }
    },
  },
];
