'use strict';

/**
 * Tests for hooks/lib/review-ledger.js — the per-dispatch find/fix/no-op
 * ledger (contract review-ledger/v1).
 *
 * The 1.x plugin never measured whether a review dispatch paid for itself; the
 * only evidence was a day of log mining. The ledger records one line per
 * dispatch (agent, outcome, severity counts) and reports yield per agent, so
 * the next pruning decision reads a file instead of a transcript.
 *
 * Every scenario runs against a real temp file; the CLI seam gets a direct
 * subprocess test (seam rule).
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const REPO = path.resolve(__dirname, '..');
const LIB = path.join(REPO, 'hooks', 'lib', 'review-ledger.js');
const CHECKPOINT = path.join(REPO, 'hooks', 'lib', 'checkpoint.js');
const ledger = require(LIB);

function tmpFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'review-ledger-'));
  return path.join(dir, '.verified', 'review-ledger.jsonl');
}

// Stand-in for checkpoint.diff: the paths changed since `ref`.
const changedSince = map => ref => {
  if (!(ref in map)) throw new Error(`unknown checkpoint ref ${ref}`);
  return map[ref];
};

function g(cwd, args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
  return r.stdout;
}

function gitRepo() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'review-ledger-git-'));
  g(d, ['init', '-q']);
  g(d, ['config', 'user.email', 't@t']);
  g(d, ['config', 'user.name', 't']);
  fs.writeFileSync(path.join(d, 'a.txt'), 'a\n');
  g(d, ['add', '.']);
  g(d, ['commit', '-qm', 'init']);
  return d;
}

function lines(file) {
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
}

module.exports = [
  // --- record ---------------------------------------------------------------
  {
    name: 'record: appends one JSON line carrying the schema, agent, outcome and counts',
    fn: () => {
      const file = tmpFile();
      const diff = changedSince({ 'refs/verified/checkpoints/review/001-test-review': ['a.go', 'b.go', 'c.go'] });
      ledger.record({ agent: 'test-review', outcome: 'fixed', errors: 1, warnings: 2, since: 'refs/verified/checkpoints/review/001-test-review' }, { file, diff });
      const [line] = lines(file);
      const entry = JSON.parse(line);
      assert.equal(entry.schema, 'review-ledger/v1');
      assert.equal(entry.agent, 'test-review');
      assert.equal(entry.outcome, 'fixed');
      assert.equal(entry.errors, 1);
      assert.equal(entry.warnings, 2);
      assert.equal(entry.files, 3, 'the script counts the files, not the caller');
      assert.deepEqual(entry.changed, ['a.go', 'b.go', 'c.go'], 'paths kept for spot-checks');
      assert.equal(entry.since, 'refs/verified/checkpoints/review/001-test-review');
      assert.equal(entry.suggestions, 0, 'an omitted count is 0, not undefined');
      assert.match(entry.ts, /^\d{4}-\d{2}-\d{2}T/, 'timestamp is ISO');
    },
  },
  {
    name: 'record: creates the .verified/ parent and appends, never overwrites',
    fn: () => {
      const file = tmpFile();
      assert.equal(fs.existsSync(path.dirname(file)), false);
      ledger.record({ agent: 'a', outcome: 'no-op' }, { file });
      ledger.record({ agent: 'b', outcome: 'dismissed' }, { file });
      assert.equal(lines(file).length, 2);
    },
  },
  {
    name: 'record: rejects an unknown outcome and a missing agent (a ledger of guesses is worse than none)',
    fn: () => {
      const file = tmpFile();
      assert.throws(() => ledger.record({ agent: 'a', outcome: 'maybe' }, { file }), /outcome/);
      assert.throws(() => ledger.record({ outcome: 'fixed' }, { file }), /agent/);
      assert.equal(fs.existsSync(file), false, 'nothing written on a rejected record');
    },
  },
  {
    name: 'record: a non-numeric count is rejected, not coerced to NaN',
    fn: () => {
      const file = tmpFile();
      const diff = () => { throw new Error('no git call on a malformed entry'); };
      assert.throws(() => ledger.record({ agent: 'a', outcome: 'fixed', errors: 'two', since: 'r' }, { file, diff }), /errors/);
    },
  },

  {
    name: 'record: `fixed` without --since is rejected; a caller-supplied file count is not evidence',
    fn: () => {
      const file = tmpFile();
      assert.throws(() => ledger.record({ agent: 'a', outcome: 'fixed' }, { file }), /--since/);
      assert.throws(() => ledger.record({ agent: 'a', outcome: 'fixed', files: 4 }, { file }), /--since/);
      assert.equal(fs.existsSync(file), false, 'nothing written on a rejected record');
      ledger.record({ agent: 'a', outcome: 'dismissed' }, { file });
      assert.equal(lines(file).length, 1, 'the other outcomes need no checkpoint');
    },
  },
  {
    name: 'record: `fixed` whose checkpoint shows no changed file is rejected, whatever --files says',
    fn: () => {
      const file = tmpFile();
      const diff = changedSince({ r1: [] });
      assert.throws(() => ledger.record({ agent: 'a', outcome: 'fixed', since: 'r1', files: 4 }, { file, diff }), /no file|changed/);
      assert.equal(fs.existsSync(file), false);
    },
  },
  {
    name: 'record: one checkpoint cannot witness two agents\' fixes (the six-lines-one-snapshot ledger)',
    fn: () => {
      const file = tmpFile();
      const diff = changedSince({ r1: ['x.go'], r2: ['y.go'] });
      ledger.record({ agent: 'correctness-review', outcome: 'fixed', since: 'r1' }, { file, diff });
      assert.throws(
        () => ledger.record({ agent: 'test-review', outcome: 'fixed', since: 'r1' }, { file, diff }),
        /already witnesses correctness-review/,
      );
      ledger.record({ agent: 'correctness-review', outcome: 'fixed', since: 'r1', round: 2 }, { file, diff });
      ledger.record({ agent: 'test-review', outcome: 'fixed', since: 'r2' }, { file, diff });
      assert.equal(lines(file).length, 3, 'same agent may reuse its ref (round 2); a fresh ref per agent is accepted');
    },
  },

  // --- parse ----------------------------------------------------------------
  {
    name: 'parseLines: skips malformed and foreign-schema lines and counts them',
    fn: () => {
      const text = [
        JSON.stringify({ schema: 'review-ledger/v1', agent: 'a', outcome: 'fixed', errors: 1, warnings: 0, suggestions: 0 }),
        'not json',
        JSON.stringify({ schema: 'other/v9', agent: 'a', outcome: 'fixed' }),
        '',
        JSON.stringify({ schema: 'review-ledger/v1', agent: 'b', outcome: 'no-op', errors: 0, warnings: 0, suggestions: 0 }),
      ].join('\n');
      const { entries, malformed } = ledger.parseLines(text);
      assert.equal(entries.length, 2);
      assert.equal(malformed, 2);
    },
  },

  // --- report ---------------------------------------------------------------
  {
    name: 'report: aggregates per agent — dispatches, outcome counts, severity sums, yield',
    fn: () => {
      const entries = [
        { agent: 'test-review', outcome: 'fixed', errors: 1, warnings: 2, suggestions: 0, files: 2 },
        { agent: 'test-review', outcome: 'no-op', errors: 0, warnings: 0, suggestions: 1 },
        { agent: 'test-review', outcome: 'dismissed', errors: 0, warnings: 1, suggestions: 0 },
        { agent: 'test-review', outcome: 'fixed', errors: 0, warnings: 1, suggestions: 0, files: 1 },
        { agent: 'complexity-review', outcome: 'no-op', errors: 0, warnings: 0, suggestions: 0 },
      ];
      const r = ledger.report(entries);
      assert.equal(r.schema, 'review-ledger/v1');
      const tr = r.agents['test-review'];
      assert.equal(tr.dispatches, 4);
      assert.deepEqual(tr.outcomes, { 'no-op': 1, fixed: 2, dismissed: 1, escalated: 0 });
      assert.equal(tr.errors, 1);
      assert.equal(tr.warnings, 4);
      assert.equal(tr.suggestions, 1);
      assert.equal(tr.files, 3, 'changed-file evidence summed per agent');
      assert.equal(tr.yield, 0.5, 'yield = fixed / dispatches');
      assert.equal(r.agents['complexity-review'].yield, 0);
      assert.equal(r.total.dispatches, 5);
    },
  },
  {
    name: 'report: --last N windows to the most recent entries',
    fn: () => {
      const entries = [
        { agent: 'a', outcome: 'fixed', errors: 1, warnings: 0, suggestions: 0 },
        { agent: 'a', outcome: 'no-op', errors: 0, warnings: 0, suggestions: 0 },
        { agent: 'a', outcome: 'no-op', errors: 0, warnings: 0, suggestions: 0 },
      ];
      const r = ledger.report(entries, { last: 2 });
      assert.equal(r.agents.a.dispatches, 2);
      assert.equal(r.agents.a.outcomes.fixed, 0, 'the older fixed entry fell outside the window');
    },
  },
  {
    name: 'report: an empty ledger reports zero dispatches, never throws',
    fn: () => {
      const r = ledger.report([]);
      assert.equal(r.total.dispatches, 0);
      assert.deepEqual(r.agents, {});
    },
  },

  // --- CLI seam (real subprocess) --------------------------------------------
  {
    name: 'CLI: record twice then report → per-agent JSON on stdout, exit 0',
    fn: () => {
      const file = tmpFile();
      const cwd = gitRepo();
      const cp = JSON.parse(execFileSync('node', [CHECKPOINT, 'create', '--feature', 'review', '--label', 'test-review'], { cwd, encoding: 'utf8' }));
      fs.writeFileSync(path.join(cwd, 'a.txt'), 'changed\n');
      fs.writeFileSync(path.join(cwd, 'new_test.go'), 'package x\n');
      execFileSync('node', [LIB, 'record', '--agent', 'test-review', '--outcome', 'fixed', '--errors', '1', '--since', cp.ref, '--file', file], { cwd });
      execFileSync('node', [LIB, 'record', '--agent', 'test-review', '--outcome', 'no-op', '--file', file], { cwd });
      const out = execFileSync('node', [LIB, 'report', '--file', file], { encoding: 'utf8' });
      assert.deepEqual(JSON.parse(lines(file)[0]).changed.sort(), ['a.txt', 'new_test.go'], 'the real checkpoint diff, read by the script');
      const r = JSON.parse(out);
      assert.equal(r.agents['test-review'].dispatches, 2);
      assert.equal(r.agents['test-review'].errors, 1);
      assert.equal(r.agents['test-review'].files, 2);
      assert.equal(r.agents['test-review'].yield, 0.5);
      assert.equal(r.malformed, 0);
    },
  },
  {
    name: 'CLI: an unknown outcome exits 1 with a usage message and writes nothing',
    fn: () => {
      const file = tmpFile();
      const res = spawnSync('node', [LIB, 'record', '--agent', 'a', '--outcome', 'maybe', '--file', file], { encoding: 'utf8' });
      assert.equal(res.status, 1);
      assert.match(res.stderr, /outcome/);
      assert.equal(fs.existsSync(file), false);
    },
  },
  {
    name: 'CLI: record --outcome fixed without --since exits 1, names the checkpoint step, writes nothing',
    fn: () => {
      const file = tmpFile();
      const res = spawnSync('node', [LIB, 'record', '--agent', 'a', '--outcome', 'fixed', '--files', '3', '--file', file], { encoding: 'utf8' });
      assert.equal(res.status, 1);
      assert.match(res.stderr, /--since/);
      assert.match(res.stderr, /checkpoint\.js create/);
      assert.equal(fs.existsSync(file), false);
    },
  },
  {
    name: 'CLI: record --outcome fixed against a checkpoint with no change since exits 1 and writes nothing',
    fn: () => {
      const file = tmpFile();
      const cwd = gitRepo();
      const cp = JSON.parse(execFileSync('node', [CHECKPOINT, 'create', '--feature', 'review', '--label', 'a'], { cwd, encoding: 'utf8' }));
      const res = spawnSync('node', [LIB, 'record', '--agent', 'a', '--outcome', 'fixed', '--since', cp.ref, '--file', file], { cwd, encoding: 'utf8' });
      assert.equal(res.status, 1);
      assert.equal(fs.existsSync(file), false);
    },
  },
  {
    name: 'CLI: report on an absent ledger exits 0 with zero dispatches (nothing recorded yet is not an error)',
    fn: () => {
      const file = tmpFile();
      const res = spawnSync('node', [LIB, 'report', '--file', file], { encoding: 'utf8' });
      assert.equal(res.status, 0);
      assert.equal(JSON.parse(res.stdout).total.dispatches, 0);
    },
  },
  {
    name: 'CLI: no command → usage, exit 1',
    fn: () => {
      const res = spawnSync('node', [LIB], { encoding: 'utf8' });
      assert.equal(res.status, 1);
      assert.match(res.stderr, /usage/);
    },
  },
];
