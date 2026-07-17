'use strict';

/**
 * Tests for hooks/lib/test-weakening.js — the deterministic detector that flags a
 * test file which LOST assertions in a change (a possible regression-hiding
 * weakening). `analyze(entries)` is pure over pre-resolved before/after contents;
 * `scan()` owns the git+fs IO (covered by a real-git integration test — the
 * finding-injection lesson that a fake-seam-only suite hides real bugs).
 *
 * Requirement ids trace to .verified/features/test-weakening-detection/spec.md.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { analyze, scan, testMatchers, SCHEMA } = require('../hooks/lib/test-weakening.js');

// N testify require. calls — the Go adapter's countAssertions counts these.
const goTest = n => 'package p\nimport "testing"\nfunc TestX(t *testing.T){\n' +
  Array.from({ length: n }, (_, i) => `  require.Equal(t, ${i}, f(${i}))`).join('\n') + '\n}\n';

const entry = (file, before, after) => ({ file, before, after });

module.exports = [
  {
    // test-weakening/AS-1 — a test that lost assertions is flagged with the delta
    name: 'analyze: a test file with fewer assertions is flagged with before/after/delta',
    fn: () => {
      const r = analyze([entry('foo_test.go', goTest(5), goTest(3))]);
      assert.equal(r.schema, SCHEMA);
      assert.equal(r.schema, 'test-weakening/v1');
      assert.equal(r.flagged.length, 1);
      assert.deepEqual(
        { file: r.flagged[0].file, before: r.flagged[0].before, after: r.flagged[0].after, delta: r.flagged[0].delta },
        { file: 'foo_test.go', before: 5, after: 3, delta: -2 },
      );
    },
  },
  {
    // test-weakening/AS-2 — equal or higher count is not weakening
    name: 'analyze: equal or increased assertion count is not flagged',
    fn: () => {
      assert.deepEqual(analyze([entry('a_test.go', goTest(3), goTest(3))]).flagged, []);
      assert.deepEqual(analyze([entry('a_test.go', goTest(3), goTest(5))]).flagged, []);
    },
  },
  {
    // test-weakening/EC-002 + EC-004 — identical count, and net-zero, are not flagged
    name: 'analyze: an identical-count edit is not flagged',
    fn: () => {
      // same number of assertions, different bodies → count unchanged → not flagged
      const before = goTest(4);
      const after = goTest(4).replace('f(0)', 'g(0)');
      assert.deepEqual(analyze([entry('a_test.go', before, after)]).flagged, []);
    },
  },
  {
    // test-weakening/AS-4 — a deleted test (after null) is flagged removed
    name: 'analyze: a deleted test with assertions is flagged removed:true, after:0',
    fn: () => {
      const r = analyze([entry('gone_test.go', goTest(3), null)]);
      assert.equal(r.flagged.length, 1);
      assert.equal(r.flagged[0].removed, true);
      assert.equal(r.flagged[0].after, 0);
      assert.equal(r.flagged[0].delta, -3);
    },
  },
  {
    // test-weakening/AS-6 + EC-005 — unsupported language → not_analyzed, never flagged
    name: 'analyze: a test in a language with no adapter is not_analyzed, not flagged',
    fn: () => {
      const r = analyze([entry('spec_test.rb', 'expect(x).to eq 1', 'expect(x).to eq 2')]);
      assert.deepEqual(r.flagged, []);
      assert.equal(r.not_analyzed.length, 1);
      assert.match(r.not_analyzed[0].reason, /no adapter/i);
      // a deleted unsupported file is also not_analyzed (can't prove it had assertions)
      assert.deepEqual(analyze([entry('spec_test.rb', 'expect(x).to eq 1', null)]).flagged, []);
    },
  },
  {
    // test-weakening/EC-001 — a modified file with an unreadable base → not_analyzed
    name: 'analyze: a null base content (unreadable) → not_analyzed, not flagged',
    fn: () => {
      const r = analyze([entry('a_test.go', null, goTest(2))]);
      assert.deepEqual(r.flagged, []);
      assert.match(r.not_analyzed[0].reason, /base/i);
    },
  },
  {
    // test-weakening/AS-3 + AS-5 + EC-003 — real git: the scan CLI over a throwaway repo
    name: 'scan (real git): flags a weakened test, ignores added tests and non-test files',
    fn: () => {
      const { spawnSync } = require('node:child_process');
      const g = (cwd, args) => spawnSync('git', args, { cwd, encoding: 'utf8' });
      if (g('.', ['--version']).status !== 0) return; // git unavailable — skip
      const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-'));
      const w = (p, s) => { fs.mkdirSync(path.dirname(path.join(repo, p)), { recursive: true }); fs.writeFileSync(path.join(repo, p), s); };
      try {
        g(repo, ['init', '-q']); g(repo, ['config', 'user.email', 't@t']); g(repo, ['config', 'user.name', 't']);
        w('foo_test.go', goTest(3));
        w('prod.go', 'package p\nfunc f(x int) int { return x }\n');
        g(repo, ['add', '.']); g(repo, ['commit', '-qm', 'base']);
        const base = g(repo, ['rev-parse', 'HEAD']).stdout.trim();

        // (empty change → nothing flagged) EC-003
        assert.deepEqual(scan(base, repo).flagged, [], 'no changes → empty');

        // (a) weaken the tracked test, (b) add a brand-new test, (c) edit a non-test file
        w('foo_test.go', goTest(1));                       // 3 → 1 assertions
        w('added_test.go', goTest(9));                     // new test — must NOT be flagged
        w('prod.go', 'package p\nfunc f(x int) int { return x + 1 }\n'); // non-test edit
        const r = scan(base, repo);
        assert.equal(r.schema, SCHEMA);
        const files = r.flagged.map(f => f.file);
        assert.ok(files.some(f => f.endsWith('foo_test.go')), 'the weakened test is flagged');
        assert.ok(!files.some(f => f.endsWith('added_test.go')), 'an added test is NOT flagged (AS-3)');
        assert.ok(!files.some(f => f.endsWith('prod.go')), 'a non-test file is NOT flagged (AS-5)');
      } finally {
        fs.rmSync(repo, { recursive: true, force: true });
      }
    },
  },
  {
    // test-weakening/AS-4 through the scan wiring — a git-rm'd test drives the status==='D' branch
    name: 'scan (real git): a deleted test file is flagged removed via the D-status branch',
    fn: () => {
      const { spawnSync } = require('node:child_process');
      const g = (cwd, args) => spawnSync('git', args, { cwd, encoding: 'utf8' });
      if (g('.', ['--version']).status !== 0) return;
      const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-del-'));
      try {
        g(repo, ['init', '-q']); g(repo, ['config', 'user.email', 't@t']); g(repo, ['config', 'user.name', 't']);
        fs.writeFileSync(path.join(repo, 'foo_test.go'), goTest(4));
        g(repo, ['add', '.']); g(repo, ['commit', '-qm', 'base']);
        const base = g(repo, ['rev-parse', 'HEAD']).stdout.trim();
        g(repo, ['rm', '-q', 'foo_test.go']); // delete → status D
        const flag = scan(base, repo).flagged.find(f => f.file.endsWith('foo_test.go'));
        assert.ok(flag, 'the deleted test is flagged');
        assert.equal(flag.removed, true);
        assert.equal(flag.after, 0);
      } finally {
        fs.rmSync(repo, { recursive: true, force: true });
      }
    },
  },
  {
    // test-weakening/FR-004 — testMatchers uses a repo's own TESTING.md match-paths when present
    name: 'testMatchers: a repo TESTING.md match-paths drives classification (not the adapter fallback)',
    fn: () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-tax-'));
      try {
        const testing = '# Testing\n\n## Test Types\n\n### spec\n- **match-paths:** **/*.spec.custom\n- **tier:** default\n';
        fs.mkdirSync(path.join(dir, '.verified', 'codebase'), { recursive: true });
        fs.writeFileSync(path.join(dir, '.verified', 'codebase', 'TESTING.md'), testing);
        const matchers = testMatchers(dir); // compiled RegExps from the repo match-paths
        assert.ok(matchers.some(re => re.test('pkg/foo.spec.custom')), 'repo match-path classifies its own test');
        assert.ok(!matchers.some(re => re.test('foo_test.go')), 'the adapter-glob fallback was NOT used');
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    },
  },
  {
    // test-weakening/FR-006 — the git-failure and invalid-ref branches degrade to an empty note
    name: 'scan: an invalid/unresolvable base ref → empty result with a note, never throws',
    fn: () => {
      const bad = scan('-oops', '.'); // option-like ref rejected before git
      assert.deepEqual(bad.flagged, []);
      assert.match(bad.note, /invalid base ref/i);
      const missing = scan('deadbeefdeadbeef', '.'); // real git, unresolvable ref
      assert.deepEqual(missing.flagged, []);
      assert.match(missing.note, /could not diff|invalid/i);
    },
  },
];
