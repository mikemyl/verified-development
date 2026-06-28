'use strict';

/**
 * Tests for the deterministic wave engine (hooks/lib/waves.js).
 *
 * The engine's whole point is that the parallel schedule is computed by code,
 * not eyeballed by the LLM — so it must be exhaustively unit-tested: layering,
 * range deps, file-collision detection, undeclared surfaces, and every reject
 * path (unknown dep, cycle, duplicate id).
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { analyze, expandDeps, AnalysisError, SCHEMA } = require('../hooks/lib/waves.js');

const REPO = path.resolve(__dirname, '..');
const readSkill = name => fs.readFileSync(path.join(REPO, 'skills', name, 'SKILL.md'), 'utf8');

const plan = (...lines) => lines.join('\n') + '\n';

module.exports = [
  {
    name: 'schema stamp is plan-waves/v1',
    fn: () => {
      const r = analyze(plan('- [ ] T001 a (files: `a.go`)'));
      assert.equal(r.schema, SCHEMA);
      assert.equal(r.schema, 'plan-waves/v1');
    },
  },

  {
    name: 'linear chain → one singleton wave per task, not parallel',
    fn: () => {
      const r = analyze(plan(
        '- [ ] T001 a (files: `a.go`)',
        '- [ ] T002 b (files: `b.go`) (depends on T001)',
        '- [ ] T003 c (files: `c.go`) (depends on T002)',
      ));
      assert.deepEqual(r.waves, [['T001'], ['T002'], ['T003']]);
      assert.equal(r.parallel, false);
      assert.deepEqual(r.collisions, []);
      assert.deepEqual(r.undeclared, []);
      assert.equal(r.tasks.T002.wave, 2);
    },
  },

  {
    name: 'independent tasks collapse into a single parallel wave',
    fn: () => {
      const r = analyze(plan(
        '- [ ] T001 a (files: `a.go`)',
        '- [ ] T002 b (files: `b.go`)',
      ));
      assert.deepEqual(r.waves, [['T001', 'T002']]);
      assert.equal(r.parallel, true);
      assert.deepEqual(r.collisions, []);
    },
  },

  {
    name: 'diamond dependency lays out as 3 waves',
    fn: () => {
      const r = analyze(plan(
        '- [ ] T001 a (files: `a.go`)',
        '- [ ] T002 b (files: `b.go`) (depends on T001)',
        '- [ ] T003 c (files: `c.go`) (depends on T001)',
        '- [ ] T004 d (files: `d.go`) (depends on T002, T003)',
      ));
      assert.deepEqual(r.waves, [['T001'], ['T002', 'T003'], ['T004']]);
      assert.equal(r.parallel, true);
    },
  },

  {
    name: 'ready set is numeric-sorted (T2 before T10)',
    fn: () => {
      const r = analyze(plan(
        '- [ ] T010 j (files: `j.go`)',
        '- [ ] T002 b (files: `b.go`)',
      ));
      assert.deepEqual(r.waves, [['T002', 'T010']]);
    },
  },

  {
    name: 'range dependency T001-T003 expands inclusively',
    fn: () => {
      const r = analyze(plan(
        '- [ ] T001 a (files: `a.go`)',
        '- [ ] T002 b (files: `b.go`)',
        '- [ ] T003 c (files: `c.go`)',
        '- [ ] T010 d (files: `d.go`) (depends on T001-T003)',
      ));
      assert.deepEqual(r.tasks.T010.depends_on, ['T001', 'T002', 'T003']);
      assert.deepEqual(r.waves, [['T001', 'T002', 'T003'], ['T010']]);
    },
  },

  {
    name: '"depends on none" parses as no dependencies',
    fn: () => {
      const r = analyze(plan('- [ ] T001 a (files: `a.go`) (depends on none)'));
      assert.deepEqual(r.tasks.T001.depends_on, []);
      assert.equal(r.tasks.T001.wave, 1);
    },
  },

  {
    name: 'same-wave tasks touching the same file are a collision',
    fn: () => {
      const r = analyze(plan(
        '- [ ] T001 write test (files: `shared.go`)',
        '- [ ] T002 impl (files: `shared.go`)',
      ));
      assert.equal(r.collisions.length, 1);
      assert.deepEqual(r.collisions[0], { wave: 1, tasks: ['T001', 'T002'], file: 'shared.go' });
    },
  },

  {
    name: 'sequential tasks sharing a file are NOT a collision (different waves)',
    fn: () => {
      const r = analyze(plan(
        '- [ ] T001 write test (files: `shared.go`)',
        '- [ ] T002 impl (files: `shared.go`) (depends on T001)',
      ));
      assert.deepEqual(r.collisions, []);
    },
  },

  {
    name: 'undeclared file surface flagged only with a same-wave peer',
    fn: () => {
      const parallelNoFiles = analyze(plan(
        '- [ ] T001 a',
        '- [ ] T002 b',
      ));
      assert.deepEqual(parallelNoFiles.undeclared.sort(), ['T001', 'T002']);

      const sequentialNoFiles = analyze(plan(
        '- [ ] T001 a',
        '- [ ] T002 b (depends on T001)',
      ));
      assert.deepEqual(sequentialNoFiles.undeclared, []);
    },
  },

  {
    name: 'files: clause strips backticks and whitespace',
    fn: () => {
      const r = analyze(plan('- [ ] T001 a (files: `a.go`, ` b.go `)'));
      assert.deepEqual(r.tasks.T001.files, ['a.go', 'b.go']);
      assert.equal(r.tasks.T001.files_undeclared, false);
    },
  },

  {
    name: 'completed [x] tasks are still parsed and waved',
    fn: () => {
      const r = analyze(plan(
        '- [x] T001 done (files: `a.go`)',
        '- [ ] T002 b (files: `b.go`) (depends on T001)',
      ));
      assert.equal(r.tasks.T001.status, 'x');
      assert.equal(r.tasks.T001.wave, 1);
      assert.equal(r.tasks.T002.wave, 2);
    },
  },

  {
    name: 'unknown dependency reference is rejected by name',
    fn: () => {
      assert.throws(
        () => analyze(plan(
          '- [ ] T001 a (files: `a.go`)',
          '- [ ] T002 b (files: `b.go`) (depends on T099)',
        )),
        err => err instanceof AnalysisError && /unknown dependency/i.test(err.message) && /T099/.test(err.message),
      );
    },
  },

  {
    name: 'dependency cycle is rejected and names the tasks',
    fn: () => {
      assert.throws(
        () => analyze(plan(
          '- [ ] T001 a (files: `a.go`) (depends on T002)',
          '- [ ] T002 b (files: `b.go`) (depends on T001)',
        )),
        err => err instanceof AnalysisError && /cycle/i.test(err.message) && /T001/.test(err.message) && /T002/.test(err.message),
      );
    },
  },

  {
    name: 'self-dependency is rejected',
    fn: () => {
      assert.throws(
        () => analyze(plan('- [ ] T001 a (files: `a.go`) (depends on T001)')),
        err => err instanceof AnalysisError && /itself/i.test(err.message),
      );
    },
  },

  {
    name: 'duplicate task id is rejected',
    fn: () => {
      assert.throws(
        () => analyze(plan(
          '- [ ] T001 a (files: `a.go`)',
          '- [ ] T001 b (files: `b.go`)',
        )),
        err => err instanceof AnalysisError && /duplicate/i.test(err.message),
      );
    },
  },

  {
    name: 'a plan with no task lines is rejected',
    fn: () => {
      assert.throws(
        () => analyze(plan('# Implementation Plan', 'Some prose, no tasks.')),
        err => err instanceof AnalysisError && /no tasks/i.test(err.message),
      );
    },
  },

  // ----- expandDeps unit coverage ---------------------------------------
  {
    name: 'expandDeps handles ranges, lists, none, and empty',
    fn: () => {
      assert.deepEqual(expandDeps('T001-T003'), ['T001', 'T002', 'T003']);
      assert.deepEqual(expandDeps('T001, T005'), ['T001', 'T005']);
      assert.deepEqual(expandDeps('T001-T003, T007'), ['T001', 'T002', 'T003', 'T007']);
      assert.deepEqual(expandDeps('none'), []);
      assert.deepEqual(expandDeps(''), []);
    },
  },

  // ----- skill wiring anchors (the engine must stay wired into the workflow) -----
  {
    name: '/plan requires the machine-readable (files: …) task trailer',
    fn: () => {
      const content = readSkill('plan');
      assert.ok(content.includes('(files:'), '/plan must document the files: trailer');
      assert.ok(content.includes('Declare its file surface'), '/plan task rules must require a file surface');
    },
  },
  {
    name: '/implement computes waves via the engine, not by eyeballing',
    fn: () => {
      const content = readSkill('implement');
      assert.ok(content.includes('hooks/lib/waves.js'), '/implement must call the wave engine');
      assert.ok(/collision gate/i.test(content), '/implement must document the collision gate');
    },
  },

  // ----- test-taxonomy grammar extension (T005 makes these pass) ----------
  {
    name: '(test: <type>) trailer captured as task.test_type',
    fn: () => {
      const r = analyze(plan(
        '- [ ] T001 a (test: acceptance) (files: `a.js`)',
        '- [ ] T002 b (test: unit) (files: `b.js`)',
        '- [ ] T003 c (test: none) (files: `c.js`)',
      ));
      assert.equal(r.tasks.T001.test_type, 'acceptance');
      assert.equal(r.tasks.T002.test_type, 'unit');
      assert.equal(r.tasks.T003.test_type, 'none');
    },
  },
  {
    name: '(scenario: …) trailer captured as task.scenarios array, comma/space tolerant',
    fn: () => {
      const r = analyze(plan(
        '- [ ] T001 a (scenario: AS-001, AS-002) (files: `a.js`)',
        '- [ ] T002 b (scenario: AS-003 AS-004) (files: `b.js`)',
      ));
      assert.deepEqual(r.tasks.T001.scenarios, ['AS-001', 'AS-002']);
      assert.deepEqual(r.tasks.T002.scenarios, ['AS-003', 'AS-004']);
    },
  },
  {
    name: 'task with neither trailer → test_type null and scenarios []',
    fn: () => {
      const r = analyze(plan('- [ ] T001 a (files: `a.js`)'));
      assert.equal(r.tasks.T001.test_type, null);
      assert.deepEqual(r.tasks.T001.scenarios, []);
    },
  },
  {
    name: 'test: and scenario: clauses are stripped from task.title',
    fn: () => {
      const r = analyze(plan(
        '- [ ] T010 Implement X (test: acceptance) (scenario: AS-001, AS-002) (files: `a.js`) (depends on T001)',
        '- [ ] T001 Setup (files: `setup.js`)',
      ));
      const title = r.tasks.T010.title;
      assert.ok(!/test:/i.test(title), `title must not contain "test:" — got: ${title}`);
      assert.ok(!/scenario:/i.test(title), `title must not contain "scenario:" — got: ${title}`);
      assert.equal(title, 'Implement X');
    },
  },
  {
    name: 'new trailers coexist with files/deps parsing and leave wave math unchanged',
    fn: () => {
      const r = analyze(plan(
        '- [ ] T001 Setup (files: `setup.js`)',
        '- [ ] T010 Implement X (test: acceptance) (scenario: AS-001, AS-002) (files: `a.js`) (depends on T001)',
      ));
      // files + deps still parse correctly alongside the new trailers
      assert.deepEqual(r.tasks.T010.files, ['a.js']);
      assert.equal(r.tasks.T010.files_undeclared, false);
      assert.deepEqual(r.tasks.T010.depends_on, ['T001']);
      // and the new fields are captured
      assert.equal(r.tasks.T010.test_type, 'acceptance');
      assert.deepEqual(r.tasks.T010.scenarios, ['AS-001', 'AS-002']);
      // wave math is unchanged: linear chain, no collisions, not parallel
      assert.deepEqual(r.waves, [['T001'], ['T010']]);
      assert.equal(r.parallel, false);
      assert.deepEqual(r.collisions, []);
      assert.deepEqual(r.undeclared, []);
    },
  },
];
