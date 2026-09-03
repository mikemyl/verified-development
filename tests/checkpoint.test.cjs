'use strict';
/**
 * tests/checkpoint.test.cjs — destructive-git-guard AS-008..AS-012
 *
 * Every scenario runs against a real git repo (seam rule: a hooks/lib module
 * that shells out to git gets a direct, non-trivial test — no fake seam).
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const cp = require('../hooks/lib/checkpoint.js');
const CLI = path.join(__dirname, '..', 'hooks', 'lib', 'checkpoint.js');

function g(cwd, args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
  return r.stdout;
}

function repo(prefix) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  g(d, ['init', '-q']);
  g(d, ['config', 'user.email', 't@t']);
  g(d, ['config', 'user.name', 't']);
  return d;
}

function w(d, p, s) {
  fs.mkdirSync(path.dirname(path.join(d, p)), { recursive: true });
  fs.writeFileSync(path.join(d, p), s);
}

function snapshot(d) {
  // Everything a checkpoint must NOT touch: HEAD, branch, index, working tree.
  return {
    head: g(d, ['rev-parse', 'HEAD']).trim(),
    branch: g(d, ['symbolic-ref', 'HEAD']).trim(),
    index: g(d, ['ls-files', '--stage']),
    status: g(d, ['status', '--porcelain', '--untracked-files=all']),
    reflog: g(d, ['reflog', '--format=%H']),
  };
}

function cli(cwd, args) {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });
  return { code: r.status, out: r.stdout, err: r.stderr, json: r.stdout ? JSON.parse(r.stdout) : null };
}

module.exports = [
  {
    name: 'create: captures modified + untracked (not ignored) files; HEAD, branch, index, tree untouched (AS-008, FR-005)',
    fn() {
      const d = repo('cp-');
      try {
        w(d, 'src/a.go', 'a v1\n');
        w(d, '.gitignore', 'build/\n');
        g(d, ['add', '.']);
        g(d, ['commit', '-qm', 'base']);
        w(d, 'src/a.go', 'a v2 (uncommitted)\n');
        w(d, 'src/new_test.go', 'brand new, untracked\n');
        w(d, 'build/out.bin', 'ignored\n');
        g(d, ['add', 'src/a.go']); // something staged, to prove the index is left alone
        const before = snapshot(d);

        const r = cp.create({ cwd: d, feature: 'f', label: 'wave-1-start' });
        assert.equal(r.schema, 'checkpoint/v1');
        assert.equal(r.ref, 'refs/verified/checkpoints/f/001-wave-1-start');
        assert.match(r.sha, /^[0-9a-f]{40}$/);
        assert.equal(r.parent, before.head);
        assert.equal(g(d, ['rev-parse', r.ref]).trim(), r.sha, 'ref points at the checkpoint commit');

        const files = g(d, ['ls-tree', '-r', '--name-only', r.ref]).trim().split('\n').sort();
        assert.deepEqual(files, ['.gitignore', 'src/a.go', 'src/new_test.go']);
        assert.equal(g(d, ['show', `${r.ref}:src/a.go`]), 'a v2 (uncommitted)\n');
        assert.deepEqual(r.files_vs_head.sort(), ['src/a.go', 'src/new_test.go']);

        assert.deepEqual(snapshot(d), before, 'HEAD/branch/index/status/reflog byte-identical');
        assert.ok(!fs.existsSync(path.join(d, '.git', 'index.lock')), 'no leftover lock');
      } finally {
        fs.rmSync(d, { recursive: true, force: true });
      }
    },
  },
  {
    name: 'restore: a deleted file comes back byte-identical and nothing else moves (AS-009)',
    fn() {
      const d = repo('cp-restore-');
      try {
        w(d, 'sync.go', 'line1\nline2\n');
        w(d, 'other.go', 'other\n');
        g(d, ['add', '.']);
        g(d, ['commit', '-qm', 'base']);
        w(d, 'sync.go', 'line1\nline2\nfour tasks of work\n');
        w(d, 'other.go', 'other edited\n');
        const c = cp.create({ cwd: d, feature: 'f', label: 'wave-3-end' });

        fs.unlinkSync(path.join(d, 'sync.go')); // the incident
        w(d, 'other.go', 'other edited again\n'); // must survive the restore

        const r = cp.restore({ cwd: d, ref: c.ref, paths: ['sync.go', 'nope.go'] });
        assert.deepEqual(r.restored, ['sync.go']);
        assert.deepEqual(r.missing, ['nope.go']);
        assert.equal(fs.readFileSync(path.join(d, 'sync.go'), 'utf8'), 'line1\nline2\nfour tasks of work\n');
        assert.equal(fs.readFileSync(path.join(d, 'other.go'), 'utf8'), 'other edited again\n');
      } finally {
        fs.rmSync(d, { recursive: true, force: true });
      }
    },
  },
  {
    name: 'diff: lists exactly the files that differ between the checkpoint and the working tree, untracked included (AS-010)',
    fn() {
      const d = repo('cp-diff-');
      try {
        w(d, 'a.go', 'a\n');
        w(d, 'b.go', 'b\n');
        g(d, ['add', '.']);
        g(d, ['commit', '-qm', 'base']);
        const c = cp.create({ cwd: d, feature: 'f', label: 'x' });
        assert.deepEqual(cp.diff({ cwd: d, ref: c.ref }).files, [], 'nothing changed → empty');

        w(d, 'a.go', 'a changed\n');
        w(d, 'c.go', 'untracked newcomer\n');
        fs.unlinkSync(path.join(d, 'b.go'));
        const r = cp.diff({ cwd: d, ref: c.ref });
        assert.equal(r.ref, c.ref);
        const byPath = Object.fromEntries(r.files.map(f => [f.path, f.status]));
        assert.deepEqual(byPath, { 'a.go': 'M', 'b.go': 'D', 'c.go': 'A' });
      } finally {
        fs.rmSync(d, { recursive: true, force: true });
      }
    },
  },
  {
    name: 'list: newest first, scoped per feature, sequence numbers keep counting (AS-011)',
    fn() {
      const d = repo('cp-list-');
      try {
        w(d, 'a', '1');
        g(d, ['add', '.']);
        g(d, ['commit', '-qm', 'base']);
        cp.create({ cwd: d, feature: 'f', label: 'wave-1-start' });
        w(d, 'a', '2');
        cp.create({ cwd: d, feature: 'f', label: 'wave-1-end' });
        cp.create({ cwd: d, feature: 'g', label: 'other' });
        w(d, 'a', '3');
        const third = cp.create({ cwd: d, feature: 'f', label: 'Wave 2 / start!' });
        assert.equal(third.ref, 'refs/verified/checkpoints/f/003-wave-2-start', 'label is slugged, seq continues');

        const l = cp.list({ cwd: d, feature: 'f' });
        assert.equal(l.schema, 'checkpoint/v1');
        assert.deepEqual(l.checkpoints.map(c => c.label), ['wave-2-start', 'wave-1-end', 'wave-1-start']);
        assert.deepEqual(l.checkpoints.map(c => c.seq), [3, 2, 1]);
        for (const c of l.checkpoints) assert.match(c.sha, /^[0-9a-f]{40}$/);
        assert.equal(cp.list({ cwd: d, feature: 'g' }).checkpoints.length, 1);
        assert.equal(cp.list({ cwd: d, feature: 'none' }).checkpoints.length, 0);
      } finally {
        fs.rmSync(d, { recursive: true, force: true });
      }
    },
  },
  {
    name: 'create: an unborn HEAD yields a parentless checkpoint (AS-012)',
    fn() {
      const d = repo('cp-unborn-');
      try {
        w(d, 'first.go', 'first\n');
        const r = cp.create({ cwd: d, feature: 'f', label: 'start' });
        assert.equal(r.parent, null);
        assert.equal(g(d, ['show', `${r.ref}:first.go`]), 'first\n');
        assert.deepEqual(r.files_vs_head.sort(), ['first.go']);
        assert.equal(spawnSync('git', ['rev-parse', '--verify', '-q', 'HEAD'], { cwd: d }).status !== 0, true, 'HEAD still unborn');
      } finally {
        fs.rmSync(d, { recursive: true, force: true });
      }
    },
  },
  {
    name: 'create: refuses a feature/label that would escape the ref namespace',
    fn() {
      const d = repo('cp-bad-');
      try {
        assert.throws(() => cp.create({ cwd: d, feature: '../x', label: 'l' }), /feature/);
        assert.throws(() => cp.create({ cwd: d, feature: '', label: 'l' }), /feature/);
        assert.throws(() => cp.restore({ cwd: d, ref: 'refs/heads/main', paths: ['a'] }), /refs\/verified\/checkpoints/);
      } finally {
        fs.rmSync(d, { recursive: true, force: true });
      }
    },
  },
  {
    name: 'CLI seam: create / list / diff / restore round-trip through argv (FR-004)',
    fn() {
      const d = repo('cp-cli-');
      try {
        w(d, 'a.go', 'a\n');
        g(d, ['add', '.']);
        g(d, ['commit', '-qm', 'base']);
        w(d, 'a.go', 'a2\n');
        const c = cli(d, ['create', '--feature', 'f', '--label', 'wave-1-start']);
        assert.equal(c.code, 0, c.err);
        assert.equal(c.json.ref, 'refs/verified/checkpoints/f/001-wave-1-start');

        const l = cli(d, ['list', '--feature', 'f']);
        assert.equal(l.code, 0, l.err);
        assert.equal(l.json.checkpoints.length, 1);

        fs.unlinkSync(path.join(d, 'a.go'));
        const df = cli(d, ['diff', c.json.ref]);
        assert.equal(df.code, 0, df.err);
        assert.deepEqual(df.json.files, [{ path: 'a.go', status: 'D' }]);

        const r = cli(d, ['restore', c.json.ref, 'a.go']);
        assert.equal(r.code, 0, r.err);
        assert.deepEqual(r.json.restored, ['a.go']);
        assert.equal(fs.readFileSync(path.join(d, 'a.go'), 'utf8'), 'a2\n');

        assert.equal(cli(d, []).code, 1, 'usage → 1');
        assert.equal(cli(d, ['create']).code, 1, 'missing --feature → 1');
        const nr = cli(d, ['diff', 'refs/verified/checkpoints/f/999-nope']);
        assert.equal(nr.code, 2, 'unknown ref → 2');
      } finally {
        fs.rmSync(d, { recursive: true, force: true });
      }
    },
  },
];
