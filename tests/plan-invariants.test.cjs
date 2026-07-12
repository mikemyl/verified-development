'use strict';

/**
 * Tests for the additive plan-grammar extension in hooks/lib/waves.js:
 * per-task (invariants: …) and (rollback: …) trailers, resolveRollback(), and
 * the declared-scope advisory. Kept in a SEPARATE file from waves.test.cjs so
 * the legacy corpus stays byte-for-byte unchanged (spec SC-004).
 *
 * Requirement ids trace to .verified/features/deterministic-repair-loop/spec.md.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  analyze,
  resolveRollback,
  declaredScopeAdvisory,
  AnalysisError,
} = require('../hooks/lib/waves.js');

const plan = (...lines) => lines.join('\n') + '\n';
const REPO = path.resolve(__dirname, '..');
const implementSkill = () => fs.readFileSync(path.join(REPO, 'skills', 'implement', 'SKILL.md'), 'utf8');

module.exports = [
  {
    // deterministic-repair-loop/AS-7 + FR-009 — invariants parsed onto the task
    name: 'invariants: (invariants: a; b) parses to a command list',
    fn: () => {
      const r = analyze(plan('- [ ] T001 build (files: `a.go`) (invariants: just lint; just build)'));
      assert.deepEqual(r.tasks.T001.invariants, ['just lint', 'just build']);
    },
  },
  {
    // deterministic-repair-loop/AS-8 + FR-009 — rollback anchor parsed
    name: 'rollback: symbolic anchor parses onto the task',
    fn: () => {
      const r = analyze(plan('- [ ] T001 x (files: `a.go`) (rollback: plan-start)'));
      assert.equal(r.tasks.T001.rollback, 'plan-start');
    },
  },
  {
    // deterministic-repair-loop/AS-9 + FR-012 + SC-005 — legacy plan byte-identical
    name: 'additive: a trailer-less plan carries no new keys',
    fn: () => {
      const r = analyze(plan(
        '- [ ] T001 a (files: `a.go`)',
        '- [ ] T002 b (files: `b.go`) (depends on T001) (test: unit) (scenario: S1)',
      ));
      assert.ok(!('invariants' in r.tasks.T001), 'no invariants key when absent');
      assert.ok(!('rollback' in r.tasks.T001), 'no rollback key when absent');
      // The exact key set the pre-feature engine emitted, in order.
      assert.deepEqual(Object.keys(r.tasks.T002), [
        'title', 'depends_on', 'files', 'files_undeclared', 'status', 'test_type', 'scenarios', 'wave',
      ]);
    },
  },
  {
    // deterministic-repair-loop/AS-7 — trailers don't leak into the title
    name: 'invariants/rollback trailers are stripped from the task title',
    fn: () => {
      const r = analyze(plan('- [ ] T001 Build it (files: `a.go`) (invariants: just ci) (rollback: wave-start)'));
      assert.equal(r.tasks.T001.title, 'Build it');
    },
  },
  {
    // deterministic-repair-loop/EC-003 — empty invariant list is not an error
    name: 'EC-003: empty (invariants:) trailer is tolerated, not thrown',
    fn: () => {
      const r = analyze(plan('- [ ] T001 x (files: `a.go`) (invariants:  )'));
      assert.deepEqual(r.tasks.T001.invariants, []);
    },
  },
  {
    // deterministic-repair-loop/EC-003 (symmetry) — a blank (rollback:) is silently no rollback
    name: 'empty (rollback:) trailer is tolerated and attaches no rollback key',
    fn: () => {
      const r = analyze(plan('- [ ] T001 x (files: `a.go`) (rollback:  )'));
      assert.ok(!('rollback' in r.tasks.T001));
    },
  },
  {
    // deterministic-repair-loop/EC-006 — malformed trailer is a hard reject (exit 2)
    name: 'EC-006: unterminated (invariants: throws AnalysisError naming the task',
    fn: () => {
      assert.throws(
        () => analyze(plan('- [ ] T001 x (files: `a.go`) (invariants: just lint')),
        e => e instanceof AnalysisError && /T001/.test(e.message),
      );
    },
  },
  {
    // deterministic-repair-loop/EC-006 — unknown rollback anchor rejected
    name: 'EC-006: unknown *-start rollback anchor throws',
    fn: () => {
      assert.throws(
        () => analyze(plan('- [ ] T001 x (files: `a.go`) (rollback: task-start)')),
        e => e instanceof AnalysisError && /task-start/.test(e.message),
      );
    },
  },
  {
    // deterministic-repair-loop/FR-010 — symbolic anchor resolves via provided map
    name: 'resolveRollback: known anchor resolves from the anchors map',
    fn: () => {
      assert.equal(resolveRollback('plan-start', { 'plan-start': 'abc1234' }), 'abc1234');
    },
  },
  {
    // deterministic-repair-loop/FR-010 — a raw git ref resolves via the resolver
    name: 'resolveRollback: git ref resolves via injected resolver',
    fn: () => {
      const fake = ref => (ref === 'HEAD~1' ? 'deadbeef' : null);
      assert.equal(resolveRollback('HEAD~1', {}, fake), 'deadbeef');
    },
  },
  {
    // deterministic-repair-loop/EC-004 — unresolvable ref errors, never falls back
    name: 'EC-004: unresolvable rollback ref throws naming the ref',
    fn: () => {
      const fake = () => null;
      assert.throws(
        () => resolveRollback('nope-sha', {}, fake),
        e => e instanceof AnalysisError && /nope-sha/.test(e.message),
      );
    },
  },
  {
    // deterministic-repair-loop/FR-010 — a recorded symbolic anchor with no map entry errors
    name: 'resolveRollback: symbolic anchor with no recorded SHA throws',
    fn: () => {
      assert.throws(
        () => resolveRollback('slice-start', {}),
        e => e instanceof AnalysisError && /slice-start/.test(e.message),
      );
    },
  },
  {
    // deterministic-repair-loop/FR-009+FR-010 — mixed-case anchor canonicalizes, doesn't degrade to a ref
    name: 'rollback: a mixed-case anchor canonicalizes and resolves symbolically',
    fn: () => {
      const r = analyze(plan('- [ ] T001 x (files: `a.go`) (rollback: Plan-Start)'));
      assert.equal(r.tasks.T001.rollback, 'plan-start');
      // Must resolve from the anchors map, NOT fall through to the git resolver.
      const resolver = () => assert.fail('mixed-case anchor leaked to the git resolver');
      assert.equal(resolveRollback(r.tasks.T001.rollback, { 'plan-start': 'abc' }, resolver), 'abc');
    },
  },
  {
    // deterministic-repair-loop/AS-10 + FR-013 — out-of-scope write is advisory only
    name: 'declaredScopeAdvisory: warns (not errors) on a write outside (files:)',
    fn: () => {
      const r = analyze(plan('- [ ] T001 x (files: `a.js`)'));
      const warnings = declaredScopeAdvisory(r.tasks.T001, ['a.js', 'b.js']);
      assert.equal(warnings.length, 1);
      assert.match(warnings[0], /b\.js/);
    },
  },
  {
    // deterministic-repair-loop/AS-10 — a fully in-scope write set yields no warning
    name: 'declaredScopeAdvisory: no warning when all writes are declared',
    fn: () => {
      const r = analyze(plan('- [ ] T001 x (files: `a.js`, `b.js`)'));
      assert.deepEqual(declaredScopeAdvisory(r.tasks.T001, ['a.js']), []);
    },
  },
  {
    // deterministic-repair-loop/EC-005 — invariant commands aren't file writes
    name: 'EC-005: an invariant command is never counted as an out-of-scope write',
    fn: () => {
      const r = analyze(plan('- [ ] T001 x (files: `a.js`) (invariants: go build ./...)'));
      // The executor passes only actually-written files; the command string is
      // not among them, so the advisory sees only real writes.
      assert.deepEqual(declaredScopeAdvisory(r.tasks.T001, ['a.js']), []);
    },
  },
  {
    // deterministic-repair-loop/FR-013 — undeclared surface can't be scope-checked
    name: 'declaredScopeAdvisory: task with no declared files yields no warnings',
    fn: () => {
      const r = analyze(plan('- [ ] T001 x'));
      assert.deepEqual(declaredScopeAdvisory(r.tasks.T001, ['whatever.js']), []);
    },
  },
  {
    // deterministic-repair-loop/FR-010+FR-013 — /implement actually invokes the primitives (no vaporware)
    name: 'wiring: /implement invokes resolveRollback and declaredScopeAdvisory',
    fn: () => {
      const text = implementSkill();
      assert.match(text, /resolveRollback\(/, 'rollback resolution wired into /implement');
      assert.match(text, /declaredScopeAdvisory\(/, 'scope advisory wired into /implement');
    },
  },
];
