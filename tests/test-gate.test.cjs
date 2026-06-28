'use strict';

/**
 * Tests for the deterministic test-taxonomy gate (hooks/lib/test-gate.js).
 *
 * This suite (T006) DEFINES THE GATE CONTRACT for the BLOCKING cases and is
 * written RED, before test-gate.js exists — every test here must fail with
 * "cannot find module" until the implementation (T008) lands. T007 adds the
 * passing/edge/propagation cases; do not contradict it here.
 *
 * Contract under test:
 *   check({ planText, specText, testingDoc, approved }) → test-gate/v1
 *     { schema:"test-gate/v1",
 *       findings:[ { code, severity, task, detail } ],  // task null for spec-level
 *       summary:[ { task, test_type, scenarios } ],
 *       blocked:Boolean }
 *
 * Seed taxonomy tiers (testingDoc=null → fall back to seed):
 *   acceptance=default · dao=exception · unit=sign-off · none=sign-off
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { check } = require('../hooks/lib/test-gate.js');

const GATE_CLI = path.join(__dirname, '..', 'hooks', 'lib', 'test-gate.js');

const lines = (...l) => l.join('\n') + '\n';

// A spec carrying the given scenario ids as headings (matches the default
// acceptance-scenario-only pattern /\b(?:AS|S)-?\d+\b/g).
const spec = (...ids) => lines('# Spec', ...ids.map(id => `### ${id} — scenario`));

const codes = result => result.findings.map(f => f.code);
const findingFor = (result, code) => result.findings.filter(f => f.code === code);

module.exports = [
  {
    name: 'AS-001 missing test type on a behavioral task blocks',
    fn: () => {
      const planText = lines(
        '- [ ] T010 Add behavior (scenario: AS-001) (files: `a.js`)',
      );
      const r = check({ planText, specText: spec('AS-001'), testingDoc: null, approved: [] });
      assert.equal(r.schema, 'test-gate/v1');
      assert.ok(codes(r).includes('MISSING_TEST_TYPE'), 'expected MISSING_TEST_TYPE');
      const f = findingFor(r, 'MISSING_TEST_TYPE')[0];
      assert.equal(f.severity, 'error');
      assert.equal(f.task, 'T010');
      assert.equal(r.blocked, true);
    },
  },

  {
    name: 'AS-002 unknown test type (not in taxonomy) blocks and names the type',
    fn: () => {
      const planText = lines(
        '- [ ] T010 Add behavior (test: smoke) (scenario: AS-001) (files: `a.js`)',
      );
      const r = check({ planText, specText: spec('AS-001'), testingDoc: null, approved: [] });
      assert.ok(codes(r).includes('UNKNOWN_TEST_TYPE'), 'expected UNKNOWN_TEST_TYPE');
      const f = findingFor(r, 'UNKNOWN_TEST_TYPE')[0];
      assert.equal(f.severity, 'error');
      assert.equal(f.task, 'T010');
      assert.match(f.detail, /smoke/);
      assert.equal(r.blocked, true);
    },
  },

  {
    name: 'AS-003 sign-off-tier type (unit) with no approval blocks',
    fn: () => {
      const planText = lines(
        '- [ ] T010 Pure logic (test: unit) (scenario: AS-001) (files: `a.js`)',
      );
      const r = check({ planText, specText: spec('AS-001'), testingDoc: null, approved: [] });
      assert.ok(codes(r).includes('SIGNOFF_REQUIRED'), 'expected SIGNOFF_REQUIRED');
      const f = findingFor(r, 'SIGNOFF_REQUIRED')[0];
      assert.equal(f.severity, 'error');
      assert.equal(f.task, 'T010');
      assert.equal(r.blocked, true);
    },
  },

  {
    name: 'AS-003 sign-off-tier task PASSES that check when its id is approved',
    fn: () => {
      const planText = lines(
        '- [ ] T010 Pure logic (test: unit) (scenario: AS-001) (files: `a.js`)',
      );
      const r = check({ planText, specText: spec('AS-001'), testingDoc: null, approved: ['T010'] });
      assert.ok(
        !findingFor(r, 'SIGNOFF_REQUIRED').some(f => f.task === 'T010'),
        'approved sign-off task must not raise SIGNOFF_REQUIRED',
      );
    },
  },

  {
    name: 'AS-005 none type is sign-off tier — blocks without approval',
    fn: () => {
      const planText = lines(
        '- [ ] T010 Refactor only (test: none) (files: `a.js`)',
      );
      const r = check({ planText, specText: spec(), testingDoc: null, approved: [] });
      assert.ok(
        findingFor(r, 'SIGNOFF_REQUIRED').some(f => f.task === 'T010'),
        'expected SIGNOFF_REQUIRED for none-typed task',
      );
      assert.equal(r.blocked, true);
    },
  },

  {
    name: 'AS-005 none type is EXEMPT from the scenario-reference requirement',
    fn: () => {
      const planText = lines(
        '- [ ] T010 Refactor only (test: none) (files: `a.js`)',
      );
      const r = check({ planText, specText: spec(), testingDoc: null, approved: ['T010'] });
      assert.ok(
        !findingFor(r, 'UNTRACEABLE_TASK').some(f => f.task === 'T010'),
        'none-typed task must not raise UNTRACEABLE_TASK',
      );
    },
  },

  {
    name: 'AS-004 behavioral task (type != none) with no scenario blocks',
    fn: () => {
      const planText = lines(
        '- [ ] T010 Add behavior (test: acceptance) (files: `a.js`)',
      );
      const r = check({ planText, specText: spec(), testingDoc: null, approved: [] });
      assert.ok(codes(r).includes('UNTRACEABLE_TASK'), 'expected UNTRACEABLE_TASK');
      const f = findingFor(r, 'UNTRACEABLE_TASK')[0];
      assert.equal(f.severity, 'error');
      assert.equal(f.task, 'T010');
      assert.equal(r.blocked, true);
    },
  },

  {
    name: 'AS-007/EC-001/EC-008 dangling scenario ref (absent from spec) blocks and names the id',
    fn: () => {
      const planText = lines(
        '- [ ] T010 Add behavior (test: acceptance) (scenario: AS-999) (files: `a.js`)',
      );
      const r = check({ planText, specText: spec('AS-001'), testingDoc: null, approved: [] });
      assert.ok(codes(r).includes('DANGLING_SCENARIO'), 'expected DANGLING_SCENARIO');
      const f = findingFor(r, 'DANGLING_SCENARIO')[0];
      assert.equal(f.severity, 'error');
      assert.equal(f.task, 'T010');
      assert.match(f.detail, /AS-999/);
      assert.equal(r.blocked, true);
    },
  },

  {
    name: 'AS-008 spec scenario served by no task blocks and names the scenario',
    fn: () => {
      const planText = lines(
        '- [ ] T010 Add behavior (test: acceptance) (scenario: AS-001) (files: `a.js`)',
      );
      const r = check({ planText, specText: spec('AS-001', 'AS-002'), testingDoc: null, approved: [] });
      assert.ok(codes(r).includes('UNSERVED_SCENARIO'), 'expected UNSERVED_SCENARIO');
      const f = findingFor(r, 'UNSERVED_SCENARIO')[0];
      assert.equal(f.severity, 'error');
      assert.equal(f.task, null);
      assert.match(f.detail, /AS-002/);
      assert.equal(r.blocked, true);
    },
  },

  // ---------------------------------------------------------------------------
  // T007 — PASSING + edge + propagation cases (still RED until T008 lands).
  // ---------------------------------------------------------------------------

  {
    name: 'AS-006 valid annotated plan is not blocked and yields a per-task summary',
    fn: () => {
      const planText = lines(
        '- [ ] T010 Add behavior (test: acceptance) (scenario: AS-001) (files: `a.js`)',
        '- [ ] T011 Persist rows (test: dao) (scenario: AS-002) (files: `b.js`)',
        '- [ ] T012 Pure logic (test: unit) (scenario: AS-003) (files: `c.js`)',
        '- [ ] T013 Refactor only (test: none) (files: `d.js`)',
      );
      const r = check({
        planText,
        specText: spec('AS-001', 'AS-002', 'AS-003'),
        testingDoc: null,
        approved: ['T012', 'T013'], // sign-off tier (unit, none) approved
      });
      assert.equal(r.schema, 'test-gate/v1');
      assert.equal(r.blocked, false);
      assert.ok(
        !r.findings.some(f => f.severity === 'error'),
        'a valid plan must carry no error-severity findings',
      );
      // summary lists every task with its test_type and scenario(s).
      assert.equal(r.summary.length, 4);
      const byTask = Object.fromEntries(r.summary.map(s => [s.task, s]));
      assert.deepEqual(byTask.T010, { task: 'T010', test_type: 'acceptance', scenarios: ['AS-001'] });
      assert.equal(byTask.T013.test_type, 'none');
      assert.deepEqual(byTask.T013.scenarios, []);
    },
  },

  {
    name: 'EC-005 many-to-many task/scenario references are allowed',
    fn: () => {
      const planText = lines(
        '- [ ] T010 Add behavior (test: acceptance) (scenario: AS-001, AS-002) (files: `a.js`)',
        '- [ ] T011 More behavior (test: acceptance) (scenario: AS-003) (files: `b.js`)',
        '- [ ] T012 Also serves AS-003 (test: acceptance) (scenario: AS-003) (files: `c.js`)',
      );
      const r = check({
        planText,
        specText: spec('AS-001', 'AS-002', 'AS-003'),
        testingDoc: null,
        approved: [],
      });
      assert.equal(findingFor(r, 'DANGLING_SCENARIO').length, 0, 'no dangling refs');
      assert.equal(findingFor(r, 'UNSERVED_SCENARIO').length, 0, 'every scenario served');
      assert.equal(r.blocked, false);
      const t010 = r.summary.find(s => s.task === 'T010');
      assert.deepEqual(t010.scenarios, ['AS-001', 'AS-002'], 'one task may serve many scenarios');
    },
  },

  {
    name: 'EC-003 taxonomy defect (missing required field) propagates as error + blocks',
    fn: () => {
      // Repo taxonomy is authoritative; `acceptance` is missing its boundary field.
      const testingDoc = lines(
        '## Test Types',
        '',
        '### acceptance',
        '- **pattern:** actor-based Sends/Receives DSL',
        '- **location:** tests/acceptance',
        '- **tier:** default',
        '- **when-to-use:** default for behavior',
        '- **primitives:** Sends, Receives',
        '',
        '```mermaid',
        'flowchart LR',
        '  a --> b',
        '```',
      );
      const planText = lines(
        '- [ ] T010 Add behavior (test: acceptance) (scenario: AS-001) (files: `a.js`)',
      );
      const r = check({ planText, specText: spec('AS-001'), testingDoc, approved: [] });
      const defects = findingFor(r, 'TAXONOMY_DEFECT');
      assert.ok(defects.length >= 1, 'expected TAXONOMY_DEFECT');
      assert.equal(defects[0].severity, 'error');
      assert.match(defects[0].detail, /acceptance/, 'detail names the type');
      assert.match(defects[0].detail, /boundary/, 'detail names the missing field');
      assert.equal(r.blocked, true);
    },
  },

  {
    name: 'EC-004 prose-without-diagram propagates as warning and does not by itself block',
    fn: () => {
      const testingDoc = lines(
        '## Test Types',
        '',
        '### acceptance',
        '- **boundary:** public/API',
        '- **pattern:** actor-based Sends/Receives DSL',
        '- **location:** tests/acceptance',
        '- **tier:** default',
        '- **when-to-use:** default for behavior',
        '- **primitives:** Sends, Receives',
      );
      const planText = lines(
        '- [ ] T010 Add behavior (test: acceptance) (scenario: AS-001) (files: `a.js`)',
      );
      const r = check({ planText, specText: spec('AS-001'), testingDoc, approved: [] });
      const diag = findingFor(r, 'DIAGRAM_MISSING');
      assert.ok(diag.length >= 1, 'expected DIAGRAM_MISSING');
      assert.equal(diag[0].severity, 'warning');
      assert.ok(
        !r.findings.some(f => f.severity === 'error'),
        'a missing diagram is the only issue — no error findings',
      );
      assert.equal(r.blocked, false, 'a warning-only result is never blocked');
    },
  },

  {
    name: 'configurable scenarioPattern accepts non-AS ids; default tolerant accepts S001',
    fn: () => {
      const planText = lines(
        '- [ ] T010 Add behavior (test: acceptance) (scenario: STORY_12) (files: `a.js`)',
      );
      const r = check({
        planText,
        specText: spec('STORY_12'),
        testingDoc: null,
        approved: [],
        scenarioPattern: /\bSTORY_\d+\b/g,
      });
      assert.equal(
        findingFor(r, 'DANGLING_SCENARIO').length,
        0,
        'a custom-pattern id present in the spec must not dangle',
      );

      // Default tolerant pattern (no scenarioPattern given) accepts a non-`AS-` id.
      const r2 = check({
        planText: lines('- [ ] T020 Add behavior (test: acceptance) (scenario: S001) (files: `a.js`)'),
        specText: spec('S001'),
        testingDoc: null,
        approved: [],
      });
      assert.equal(
        findingFor(r2, 'DANGLING_SCENARIO').length,
        0,
        'default pattern must accept an id like S001',
      );
    },
  },

  {
    name: 'EC-006 zero-annotation plan yields a single MIGRATION_NEEDED finding, not per-task noise',
    fn: () => {
      const planText = lines(
        '- [ ] T010 Do a thing (files: `a.js`)',
        '- [ ] T011 Do another thing (files: `b.js`)',
      );
      const r = check({ planText, specText: spec('AS-001'), testingDoc: null, approved: [] });
      const migration = findingFor(r, 'MIGRATION_NEEDED');
      assert.equal(migration.length, 1, 'exactly one migration finding for the whole plan');
      assert.equal(migration[0].severity, 'error');
      assert.equal(migration[0].task, null);
      assert.equal(
        findingFor(r, 'MISSING_TEST_TYPE').length,
        0,
        'a pre-grammar plan must not emit one MISSING_TEST_TYPE per task',
      );
      assert.equal(r.blocked, true);
    },
  },

  {
    name: 'CLI exit codes: 0 valid · 2 blocked · 3 taxonomy defect',
    fn: () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-gate-cli-'));
      const write = (name, content) => {
        const p = path.join(dir, name);
        fs.writeFileSync(p, content);
        return p;
      };
      try {
        const specFile = write('spec.md', spec('AS-001'));

        // exit 0 — valid plan (acceptance is default tier, no sign-off needed).
        const validPlan = write(
          'valid.md',
          lines('- [ ] T010 Add behavior (test: acceptance) (scenario: AS-001) (files: `a.js`)'),
        );
        const ok = spawnSync('node', [GATE_CLI, 'check', validPlan, '--spec', specFile], {
          encoding: 'utf8',
        });
        assert.equal(ok.status, 0, `valid plan should exit 0\n${ok.stderr}`);

        // exit 2 — blocked (missing test type → error finding).
        const blockedPlan = write(
          'blocked.md',
          lines('- [ ] T010 Add behavior (scenario: AS-001) (files: `a.js`)'),
        );
        const blocked = spawnSync('node', [GATE_CLI, 'check', blockedPlan, '--spec', specFile], {
          encoding: 'utf8',
        });
        assert.equal(blocked.status, 2, `blocked plan should exit 2\n${blocked.stderr}`);

        // exit 3 — malformed taxonomy (a defect in the repo taxonomy).
        const defectiveDoc = write(
          'testing.md',
          lines(
            '## Test Types',
            '',
            '### acceptance',
            '- **pattern:** actor DSL',
            '- **location:** tests/acceptance',
            '- **tier:** default',
            '- **when-to-use:** default',
            '- **primitives:** Sends, Receives',
          ),
        );
        const defect = spawnSync(
          'node',
          [GATE_CLI, 'check', validPlan, '--spec', specFile, '--testing', defectiveDoc],
          { encoding: 'utf8' },
        );
        assert.equal(defect.status, 3, `taxonomy defect should exit 3\n${defect.stderr}`);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    },
  },

  // ---------------------------------------------------------------------------
  // Review-correction fixes.
  // ---------------------------------------------------------------------------

  {
    name: 'FIX1 default pattern treats only AS-/S- ids as scenarios, not FR-/EC-/SC- ids',
    fn: () => {
      // Spec mixes acceptance-scenario ids with requirement/edge/criterion ids.
      const specText = lines(
        '# Spec',
        '### AS-001 — a scenario',
        '- **FR-001** a requirement',
        '- **EC-001** an edge case',
        '- **SC-01** a success criterion',
      );
      // A single task serves the lone AS- scenario.
      const planText = lines(
        '- [ ] T010 Add behavior (test: acceptance) (scenario: AS-001) (files: `a.js`)',
      );
      const r = check({ planText, specText, testingDoc: null, approved: [] });
      // The FR-/EC-/SC- ids must NOT be treated as unserved scenarios.
      const unserved = findingFor(r, 'UNSERVED_SCENARIO').map(f => f.detail);
      assert.equal(unserved.length, 0, `no UNSERVED_SCENARIO expected, got: ${unserved.join(' | ')}`);
      assert.equal(r.blocked, false, 'plan serving the only AS- scenario must not block');
    },
  },

  {
    name: 'FIX2 repo type with empty boundary is traceability-exempt (but still sign-off)',
    fn: () => {
      // Repo taxonomy renames the non-behavioral type to `refactor`, boundary "—".
      const testingDoc = lines(
        '## Test Types',
        '',
        '### refactor',
        '- **boundary:** —',
        '- **pattern:** structural change, no new behavior',
        '- **location:** anywhere',
        '- **tier:** sign-off',
        '- **when-to-use:** pure refactors',
        '- **primitives:** none',
        '',
        '```mermaid',
        'flowchart LR',
        '  a --> b',
        '```',
      );
      const planText = lines(
        '- [ ] T010 Restructure (test: refactor) (files: `a.js`)',
      );
      // Not approved → SIGNOFF_REQUIRED still fires.
      const blocked = check({ planText, specText: spec(), testingDoc, approved: [] });
      assert.ok(
        findingFor(blocked, 'SIGNOFF_REQUIRED').some(f => f.task === 'T010'),
        'a sign-off-tier renamed type still requires approval',
      );
      // Approved → no UNTRACEABLE_TASK despite empty boundary and no scenario.
      const approved = check({ planText, specText: spec(), testingDoc, approved: ['T010'] });
      assert.ok(
        !findingFor(approved, 'UNTRACEABLE_TASK').some(f => f.task === 'T010'),
        'empty-boundary type must be exempt from the scenario-reference requirement',
      );
      assert.equal(approved.blocked, false, 'approved exempt refactor task must not block');
    },
  },

  {
    name: 'FIX4 string-form scenarioPattern compiles and matches',
    fn: () => {
      const planText = lines(
        '- [ ] T010 Add behavior (test: acceptance) (scenario: STORY_12) (files: `a.js`)',
      );
      const r = check({
        planText,
        specText: lines('# Spec', '### STORY_12 — scenario'),
        testingDoc: null,
        approved: [],
        scenarioPattern: 'STORY_\\d+', // a string, not a RegExp
      });
      assert.equal(findingFor(r, 'DANGLING_SCENARIO').length, 0, 'string pattern id must not dangle');
      assert.equal(findingFor(r, 'UNSERVED_SCENARIO').length, 0, 'string pattern scenario is served');
      assert.equal(r.blocked, false);
    },
  },

  {
    name: 'FIX4 non-global RegExp scenarioPattern is normalized and extracts every match',
    fn: () => {
      const planText = lines(
        '- [ ] T010 First (test: acceptance) (scenario: STORY_1) (files: `a.js`)',
        '- [ ] T011 Second (test: acceptance) (scenario: STORY_2) (files: `b.js`)',
      );
      const r = check({
        planText,
        specText: lines('# Spec', '### STORY_1 — scenario', '### STORY_2 — scenario'),
        testingDoc: null,
        approved: [],
        scenarioPattern: /STORY_\d+/, // NOTE: no `g` flag
      });
      // Both spec scenarios must be discovered (not just the first) → both served.
      assert.equal(findingFor(r, 'UNSERVED_SCENARIO').length, 0, 'both STORY ids must be extracted');
      assert.equal(findingFor(r, 'DANGLING_SCENARIO').length, 0, 'neither ref dangles');
      assert.equal(r.blocked, false);
    },
  },

  {
    name: 'FIX4 mixed-annotation plan fires MISSING_TEST_TYPE only for the bare task, no MIGRATION_NEEDED',
    fn: () => {
      const planText = lines(
        '- [ ] T010 Annotated (test: acceptance) (scenario: AS-1) (files: `a.js`)',
        '- [ ] T011 Bare task with no trailers (files: `b.js`)',
      );
      const r = check({ planText, specText: spec('AS-1'), testingDoc: null, approved: [] });
      assert.equal(findingFor(r, 'MIGRATION_NEEDED').length, 0, 'partial annotation must not trigger migration');
      const missing = findingFor(r, 'MISSING_TEST_TYPE');
      assert.equal(missing.length, 1, 'exactly one MISSING_TEST_TYPE');
      assert.equal(missing[0].task, 'T011', 'only the bare task is flagged');
      assert.equal(r.blocked, true);
    },
  },

  {
    name: 'FIX4 CLI exits 1 on usage error (missing --spec)',
    fn: () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-gate-cli1-'));
      try {
        const plan = path.join(dir, 'plan.md');
        fs.writeFileSync(
          plan,
          lines('- [ ] T010 Add behavior (test: acceptance) (scenario: AS-001) (files: `a.js`)'),
        );
        // No --spec flag at all → usage error → exit 1.
        const noSpec = spawnSync('node', [GATE_CLI, 'check', plan], { encoding: 'utf8' });
        assert.equal(noSpec.status, 1, `missing --spec should exit 1\n${noSpec.stdout}`);

        // --spec pointing at a missing file → read error → exit 1.
        const missingSpec = spawnSync(
          'node',
          [GATE_CLI, 'check', plan, '--spec', path.join(dir, 'does-not-exist.md')],
          { encoding: 'utf8' },
        );
        assert.equal(missingSpec.status, 1, `unreadable --spec should exit 1\n${missingSpec.stdout}`);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    },
  },
];
