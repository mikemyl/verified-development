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
const ledger = require(LIB);

function tmpFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'review-ledger-'));
  return path.join(dir, '.verified', 'review-ledger.jsonl');
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
      ledger.record({ agent: 'test-review', outcome: 'fixed', errors: 1, warnings: 2, files: 3 }, { file });
      const [line] = lines(file);
      const entry = JSON.parse(line);
      assert.equal(entry.schema, 'review-ledger/v1');
      assert.equal(entry.agent, 'test-review');
      assert.equal(entry.outcome, 'fixed');
      assert.equal(entry.errors, 1);
      assert.equal(entry.warnings, 2);
      assert.equal(entry.files, 3);
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
      assert.throws(() => ledger.record({ agent: 'a', outcome: 'fixed', errors: 'two', files: 1 }, { file }), /errors/);
    },
  },

  {
    name: 'record: `fixed` without a changed-file count is rejected — the tree is the only witness to a self-reported fix',
    fn: () => {
      const file = tmpFile();
      assert.throws(() => ledger.record({ agent: 'a', outcome: 'fixed' }, { file }), /files/);
      assert.throws(() => ledger.record({ agent: 'a', outcome: 'fixed', files: 0 }, { file }), /files/);
      assert.equal(fs.existsSync(file), false, 'nothing written on a rejected record');
      const ok = ledger.record({ agent: 'a', outcome: 'fixed', files: 2 }, { file });
      assert.equal(ok.files, 2);
      ledger.record({ agent: 'a', outcome: 'dismissed' }, { file });
      assert.equal(lines(file).length, 2, 'the other outcomes need no file evidence');
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
      execFileSync('node', [LIB, 'record', '--agent', 'test-review', '--outcome', 'fixed', '--errors', '1', '--files', '2', '--file', file]);
      execFileSync('node', [LIB, 'record', '--agent', 'test-review', '--outcome', 'no-op', '--file', file]);
      const out = execFileSync('node', [LIB, 'report', '--file', file], { encoding: 'utf8' });
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
    name: 'CLI: record --outcome fixed without --files exits 1, names the checkpoint diff as the source, writes nothing',
    fn: () => {
      const file = tmpFile();
      const res = spawnSync('node', [LIB, 'record', '--agent', 'a', '--outcome', 'fixed', '--file', file], { encoding: 'utf8' });
      assert.equal(res.status, 1);
      assert.match(res.stderr, /files/);
      assert.match(res.stderr, /checkpoint\.js diff/);
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
