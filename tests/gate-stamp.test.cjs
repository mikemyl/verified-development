'use strict';
/**
 * tests/gate-stamp.test.cjs — a verify command runs at most once per tree state.
 *
 * Real git repos and a real /bin/sh (seam rule). The command under test appends
 * to a counter file OUTSIDE the repo, so "did it run" is observed directly, not
 * inferred from the stamp the code under test wrote.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const CLI = path.join(__dirname, '..', 'hooks', 'lib', 'gate-stamp.js');

function g(cwd, args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
  return r.stdout;
}

function fixture() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-'));
  const log = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gs-log-')), 'runs');
  g(d, ['init', '-q']);
  g(d, ['config', 'user.email', 't@t']);
  g(d, ['config', 'user.name', 't']);
  fs.writeFileSync(path.join(d, '.gitignore'), 'out/\n');
  fs.writeFileSync(path.join(d, 'a.ts'), 'a\n');
  g(d, ['add', '.']);
  g(d, ['commit', '-qm', 'init']);
  return { d, log, runs: () => (fs.existsSync(log) ? fs.readFileSync(log, 'utf8').split('\n').filter(Boolean) : []) };
}

const cli = (cwd, ...args) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });

module.exports = [
  {
    name: 'run: a green command on an unchanged tree is not run again',
    fn() {
      const { d, log, runs } = fixture();
      const cmd = `echo x >> ${log}`;
      assert.equal(cli(d, 'run', '--', cmd).status, 0);
      const second = cli(d, 'run', '--', cmd);
      assert.equal(second.status, 0);
      assert.match(second.stdout, /not re-run/);
      assert.equal(runs().length, 1);
    },
  },
  {
    name: 'run: an edit, a new untracked file, or a deleted file makes it run again',
    fn() {
      const { d, log, runs } = fixture();
      const cmd = `echo x >> ${log}`;
      cli(d, 'run', '--', cmd);
      fs.writeFileSync(path.join(d, 'a.ts'), 'a2\n');
      cli(d, 'run', '--', cmd);
      fs.writeFileSync(path.join(d, 'new.ts'), 'n\n');
      cli(d, 'run', '--', cmd);
      assert.equal(runs().length, 3);
      fs.rmSync(path.join(d, 'new.ts'));
      cli(d, 'run', '--', cmd);
      assert.equal(runs().length, 4, 'a deleted file is a new tree too');
    },
  },
  {
    name: 'run: a file under .gitignore does not change the tree (build output, coverage files)',
    fn() {
      const { d, log, runs } = fixture();
      const cmd = `mkdir -p out && date +%N > out/cov.txt && echo x >> ${log}`;
      cli(d, 'run', '--', cmd);
      const second = cli(d, 'run', '--', cmd);
      assert.match(second.stdout, /not re-run/);
      assert.equal(runs().length, 1);
    },
  },
  {
    name: 'run: a red command keeps its exit code and is never stamped',
    fn() {
      const { d, log, runs } = fixture();
      const cmd = `echo x >> ${log}; exit 7`;
      assert.equal(cli(d, 'run', '--', cmd).status, 7);
      assert.equal(cli(d, 'run', '--', cmd).status, 7);
      assert.equal(runs().length, 2);
    },
  },
  {
    name: 'run: a command that rewrites the tree (a formatter) is not stamped',
    fn() {
      const { d, log, runs } = fixture();
      const cmd = `echo x >> ${log}; echo fmt >> a.ts`;
      cli(d, 'run', '--', cmd);
      const second = cli(d, 'run', '--', cmd);
      assert.doesNotMatch(second.stdout, /not re-run/);
      assert.match(second.stdout, /not stamped/);
      assert.equal(runs().length, 2);
    },
  },
  {
    name: 'run: a different command on the same tree runs; --force always runs',
    fn() {
      const { d, log, runs } = fixture();
      cli(d, 'run', '--', `echo a >> ${log}`);
      cli(d, 'run', '--', `echo b >> ${log}`);
      cli(d, 'run', '--force', '--', `echo a >> ${log}`);
      assert.deepEqual(runs(), ['a', 'b', 'a']);
    },
  },
  {
    name: 'run: the stamp lives in the git dir, outside the tree it describes',
    fn() {
      const { d, log } = fixture();
      cli(d, 'run', '--', `echo x >> ${log}`);
      assert.equal(g(d, ['status', '--porcelain']), '');
      assert.ok(fs.existsSync(path.join(d, '.git', 'verified-gate-stamps.json')));
    },
  },
  {
    name: 'run: outside a git repo the command always runs (no stamp, no error)',
    fn() {
      const d = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-nogit-'));
      const log = path.join(d, 'runs');
      cli(d, 'run', '--', `echo x >> ${log}`);
      cli(d, 'run', '--', `echo x >> ${log}`);
      assert.equal(fs.readFileSync(log, 'utf8').trim().split('\n').length, 2);
    },
  },
  {
    name: 'verify: runs each routed command with {files} filled in, stops at the first red, skips stamped ones',
    fn() {
      const { d, log, runs } = fixture();
      fs.mkdirSync(path.join(d, '.verified'));
      fs.mkdirSync(path.join(d, 'web'));
      fs.writeFileSync(path.join(d, 'web', 'g.tsx'), 'g\n');
      fs.writeFileSync(path.join(d, '.verified', 'config.json'), JSON.stringify({
        verify: { 'web/**': `cd web && echo ui {files:web} >> ${log}`, '**': `echo all >> ${log}` },
      }));
      const list = path.join(path.dirname(log), 'changed.txt');
      fs.writeFileSync(list, 'web/g.tsx\na.ts\n');

      const first = cli(d, 'verify', '--files-from', list);
      assert.equal(first.status, 0, first.stdout + first.stderr);
      assert.deepEqual(runs(), ['ui g.tsx', 'all']);
      assert.match(first.stdout, /verify green/);

      const again = cli(d, 'verify', '--files-from', list);
      assert.equal(again.status, 0);
      assert.equal(runs().length, 2, 'both stamped, neither re-run');

      fs.writeFileSync(path.join(d, '.verified', 'config.json'), JSON.stringify({
        verify: { 'web/**': 'exit 4', '**': `echo all-after-red >> ${log}` },
      }));
      const red = cli(d, 'verify', '--files-from', list);
      assert.equal(red.status, 4);
      assert.equal(runs().includes('all-after-red'), false, 'stops at the first red');
    },
  },
  {
    name: 'verify: no verify in config exits 3 and tells the model to discover the command',
    fn() {
      const { d, log } = fixture();
      const list = path.join(path.dirname(log), 'changed.txt');
      fs.writeFileSync(list, 'a.ts\n');
      const r = cli(d, 'verify', '--files-from', list);
      assert.equal(r.status, 3);
      assert.match(r.stdout, /discover/);
    },
  },
];
