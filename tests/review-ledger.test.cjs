'use strict';

/**
 * Tests for hooks/lib/review-ledger.js (review-ledger/v2) and the Stop hook
 * that writes it, hooks/ledger-writer.js.
 *
 * Why v2 (2026-11-06): the v1 ledger was written by the model that triaged the
 * findings. Its `fixed` share was 0.3–0.6 for every lens, complexity included,
 * so it could not tell a useful lens from a useless one, and recording cost a
 * turn per review plus a per-agent checkpoint and a Stop-hook block. v2 is
 * written by the hook from the agents' own reports: agent, severity counts,
 * status, tier and diff size. No model call writes it, and no line is graded
 * by the model that wrote the change.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');

const REPO = path.resolve(__dirname, '..');
const rl = require(path.join(REPO, 'hooks', 'lib', 'review-ledger.js'));
const BIN = path.join(REPO, 'hooks', 'lib', 'review-ledger.js');
const HOOK = path.join(REPO, 'hooks', 'ledger-writer.js');

// --- transcript builders (the shapes Claude Code writes) ---------------------
let clock = 0;
const ts = () => new Date(Date.UTC(2026, 10, 6, 9, 0, clock++)).toISOString();
const line = o => JSON.stringify({ sessionId: 'S1', timestamp: ts(), ...o });
const typed = text => line({ type: 'user', origin: { kind: 'human' }, message: { role: 'user', content: text } });
const dispatch = (id, agent, prompt = 'Review with your standing rubric.') =>
  line({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id, name: 'Agent', input: { subagent_type: `verified-development:${agent}`, description: agent, prompt } }] } });
const syncResult = (id, text, isError = false) =>
  line({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, is_error: isError, content: [{ type: 'text', text }] }] } });
const asyncLaunch = (id, agentId) => syncResult(id, `Async agent launched successfully.\nagentId: ${agentId} (internal)`);
const handBack = (agentId, text) =>
  line({ type: 'queue-operation', operation: 'enqueue', content: `<agent-message from="${agentId}">\n[Subagent hand-back]\n${text}\n</agent-message>` });
const scopeCall = (id, contract) => [
  line({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id, name: 'Bash', input: { command: 'node review-scope.js select --files-from /tmp/changed.txt' } }] } }),
  syncResult(id, JSON.stringify(contract, null, 2)),
];
const transcript = (...ls) => ls.flat().join('\n') + '\n';

const JSON_REPORT = '**Status:** FAIL\n```json\n[{"file":"a.go","line":3,"severity":"error","message":"x"},{"file":"a.go","line":9,"severity":"warning","message":"y"},{"file":"b.go","line":1,"severity":"suggestion","message":"z"}]\n```';
const TABLE_REPORT = '# Complexity Review\n\n**Status:** WARN\n\n| Severity | Location | Metric |\n|---|---|---|\n| warning  | a.go:10 | nesting |\n| warning | a.go:40 | length |\n| suggestion | b.go:2 | args |\n';
const CLEAN_REPORT = '**Status:** PASS\n\nNo findings.\n```json\n[]\n```';

function governedRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rl-'));
  fs.mkdirSync(path.join(dir, '.verified'));
  return dir;
}

module.exports = [
  // --- counting findings from a report ---------------------------------------
  {
    name: 'countFindings: a JSON findings array is counted by severity, with the status',
    fn: () => {
      const c = rl.countFindings(JSON_REPORT);
      assert.deepEqual(c.counts, { error: 1, warning: 1, suggestion: 1 });
      assert.equal(c.status, 'FAIL');
      assert.equal(c.parsed, true);
    },
  },
  {
    name: 'countFindings: a markdown findings table is counted when there is no JSON',
    fn: () => {
      const c = rl.countFindings(TABLE_REPORT);
      assert.deepEqual(c.counts, { error: 0, warning: 2, suggestion: 1 });
      assert.equal(c.status, 'WARN');
    },
  },
  {
    name: 'countFindings: JSON wins over a table of the same findings (no double count)',
    fn: () => {
      const c = rl.countFindings(TABLE_REPORT + '\n' + JSON_REPORT);
      assert.deepEqual(c.counts, { error: 1, warning: 1, suggestion: 1 });
    },
  },
  {
    name: 'countFindings: a clean PASS is parsed with zero counts; prose with no status is unparsed',
    fn: () => {
      const clean = rl.countFindings(CLEAN_REPORT);
      assert.equal(clean.parsed, true);
      assert.deepEqual(clean.counts, { error: 0, warning: 0, suggestion: 0 });
      const prose = rl.countFindings('I looked at the code and it seems fine overall.');
      assert.equal(prose.parsed, false);
    },
  },

  // --- reading a session transcript -------------------------------------------
  {
    name: 'entriesFrom: one entry per finished review dispatch, async hand-back and sync result alike',
    fn: () => {
      const t = transcript(
        typed('review it'),
        dispatch('t1', 'security-review'),
        asyncLaunch('t1', 'aaa111'),
        dispatch('t2', 'complexity-review'),
        handBack('aaa111', JSON_REPORT),
        syncResult('t2', TABLE_REPORT),
      );
      const es = rl.entriesFrom(t);
      assert.deepEqual(es.map(e => e.agent), ['security-review', 'complexity-review']);
      const sec = es[0];
      assert.equal(sec.schema, 'review-ledger/v2');
      assert.equal(sec.dispatch_id, 't1');
      assert.equal(sec.session, 'S1');
      assert.deepEqual(sec.counts, { error: 1, warning: 1, suggestion: 1 });
      assert.equal(sec.mode, 'panel');
      assert.deepEqual(es[1].counts, { error: 0, warning: 2, suggestion: 1 });
    },
  },
  {
    name: 'entriesFrom: a review still running, or one that failed, writes nothing yet',
    fn: () => {
      const t = transcript(
        dispatch('t1', 'security-review'), asyncLaunch('t1', 'aaa111'),
        dispatch('t2', 'test-review'), syncResult('t2', 'agent crashed', true),
      );
      assert.deepEqual(rl.entriesFrom(t), []);
    },
  },
  {
    name: 'entriesFrom: plan critics and other agents are not review dispatches',
    fn: () => {
      const t = transcript(
        line({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'p1', name: 'Agent', input: { subagent_type: 'verified-development:plan-critic-design', prompt: 'x' } }] } }),
        syncResult('p1', JSON_REPORT),
      );
      assert.deepEqual(rl.entriesFrom(t), []);
    },
  },
  {
    name: 'entriesFrom: carries the tier and diff size from the review-scope output before the dispatch',
    fn: () => {
      const t = transcript(
        scopeCall('b1', { schema: 'review-scope/v1', selected: [], skipped: [], tier: 'light', tier_reason: 'requested', changed_files: 6, changed_lines: 83 }),
        dispatch('t1', 'security-review'),
        syncResult('t1', CLEAN_REPORT),
      );
      const [e] = rl.entriesFrom(t);
      assert.equal(e.tier, 'light');
      assert.equal(e.changed_lines, 83);
      assert.equal(e.changed_files, 6);
    },
  },
  {
    name: 'entriesFrom: a verification-mode re-dispatch is marked mode verification',
    fn: () => {
      const t = transcript(
        dispatch('t1', 'correctness-review', 'Verification mode: answer confirmed | not-fixed | insufficient-context for this finding.'),
        syncResult('t1', '**Status:** PASS\nconfirmed'),
      );
      assert.equal(rl.entriesFrom(t)[0].mode, 'verification');
    },
  },
  {
    name: 'entriesFrom: an unparseable carrier falls back to the subagent transcript, when one is readable',
    fn: () => {
      const t = transcript(dispatch('t1', 'security-review'), asyncLaunch('t1', 'aaa111'), handBack('aaa111', 'done, see my notes'));
      const read = id => (id === 'aaa111' ? JSON_REPORT : null);
      const [e] = rl.entriesFrom(t, { readSubagent: read });
      assert.equal(e.parsed, true);
      assert.deepEqual(e.counts, { error: 1, warning: 1, suggestion: 1 });
      const [u] = rl.entriesFrom(t);
      assert.equal(u.parsed, false, 'no fallback → recorded as unparsed, never guessed');
    },
  },
  {
    name: 'pending: a dispatch already in the ledger is not written twice (every Stop rescans)',
    fn: () => {
      const t = transcript(dispatch('t1', 'security-review'), syncResult('t1', CLEAN_REPORT), dispatch('t2', 'test-review'), syncResult('t2', CLEAN_REPORT));
      const first = rl.pending(t, '');
      assert.equal(first.length, 2);
      const ledger = first.slice(0, 1).map(e => JSON.stringify(e)).join('\n') + '\n';
      assert.deepEqual(rl.pending(t, ledger).map(e => e.dispatch_id), ['t2']);
    },
  },

  // --- the report ---------------------------------------------------------------
  {
    name: 'report: per agent — dispatches, hit rate (≥1 error or warning), severity sums, unparsed',
    fn: () => {
      const e = (agent, error, warning, suggestion, parsed = true) => ({ schema: 'review-ledger/v2', agent, counts: { error, warning, suggestion }, parsed, mode: 'panel' });
      const r = rl.report([e('security-review', 1, 0, 0), e('security-review', 0, 0, 2), e('security-review', 0, 0, 0, false), e('complexity-review', 0, 3, 1)]);
      const s = r.agents['security-review'];
      assert.equal(s.dispatches, 3);
      assert.equal(s.unparsed, 1);
      assert.equal(s.with_findings, 1);
      assert.equal(s.hit_rate, 0.5, 'hit rate is over parsed dispatches');
      assert.equal(s.errors, 1);
      assert.equal(s.suggestions, 2);
      assert.equal(r.agents['complexity-review'].hit_rate, 1);
    },
  },
  {
    name: 'report: v1 lines (model-graded outcomes) still count their severity sums; the outcome is ignored',
    fn: () => {
      const { entries, malformed } = rl.parseLines([
        JSON.stringify({ schema: 'review-ledger/v1', ts: 'x', agent: 'test-review', outcome: 'fixed', errors: 0, warnings: 2, suggestions: 1 }),
        JSON.stringify({ schema: 'review-ledger/v2', ts: 'y', agent: 'test-review', counts: { error: 1, warning: 0, suggestion: 0 }, parsed: true }),
        'not json',
        JSON.stringify({ schema: 'other' }),
      ].join('\n'));
      assert.equal(malformed, 2);
      const t = rl.report(entries).agents['test-review'];
      assert.equal(t.dispatches, 2);
      assert.equal(t.with_findings, 2);
      assert.equal(t.warnings, 2);
      assert.equal(t.errors, 1);
      assert.equal(t.outcomes, undefined, 'self-graded outcomes are not reported any more');
    },
  },
  {
    name: 'report: verification dispatches are counted apart and do not dilute the panel hit rate',
    fn: () => {
      const r = rl.report([
        { schema: 'review-ledger/v2', agent: 'x-review', counts: { error: 1, warning: 0, suggestion: 0 }, parsed: true, mode: 'panel' },
        { schema: 'review-ledger/v2', agent: 'x-review', counts: { error: 0, warning: 0, suggestion: 0 }, parsed: true, mode: 'verification' },
      ]);
      assert.equal(r.agents['x-review'].dispatches, 1);
      assert.equal(r.agents['x-review'].verifications, 1);
      assert.equal(r.agents['x-review'].hit_rate, 1);
    },
  },
  {
    name: 'report: --last N windows to the most recent entries; an empty ledger never throws',
    fn: () => {
      const e = agent => ({ schema: 'review-ledger/v2', agent, counts: { error: 0, warning: 0, suggestion: 0 }, parsed: true });
      assert.deepEqual(Object.keys(rl.report([e('a-review'), e('b-review')], { last: 1 }).agents), ['b-review']);
      assert.equal(rl.report([]).window, 0);
    },
  },

  // --- CLI and hook seams -------------------------------------------------------
  {
    name: 'CLI: backfill writes the entries a transcript holds, once; report reads them back',
    fn: () => {
      const dir = governedRepo();
      const tpath = path.join(dir, 'session.jsonl');
      fs.writeFileSync(tpath, transcript(dispatch('t1', 'security-review'), syncResult('t1', JSON_REPORT)));
      const ledger = path.join(dir, '.verified', 'review-ledger.jsonl');
      const run = (...a) => cp.spawnSync(process.execPath, [BIN, ...a], { encoding: 'utf8', cwd: dir });
      assert.equal(run('backfill', '--transcript', tpath).status, 0);
      assert.equal(run('backfill', '--transcript', tpath).status, 0);
      assert.equal(fs.readFileSync(ledger, 'utf8').trim().split('\n').length, 1, 'backfill is idempotent');
      const r = run('report');
      assert.equal(r.status, 0, r.stderr);
      assert.equal(JSON.parse(r.stdout).agents['security-review'].errors, 1);
    },
  },
  {
    name: 'CLI: record is gone — the model writes nothing to the ledger',
    fn: () => {
      const r = cp.spawnSync(process.execPath, [BIN, 'record', '--agent', 'x-review', '--outcome', 'fixed'], { encoding: 'utf8' });
      assert.equal(r.status, 1);
      assert.match(r.stderr, /usage/);
    },
  },
  {
    name: 'hook seam: the Stop hook appends finished dispatches to the repo ledger, prints nothing, never blocks',
    fn: () => {
      const dir = governedRepo();
      const tpath = path.join(dir, 'session.jsonl');
      fs.writeFileSync(tpath, transcript(dispatch('t1', 'security-review'), syncResult('t1', JSON_REPORT), dispatch('t2', 'test-review'), asyncLaunch('t2', 'bbb')));
      const input = JSON.stringify({ hook_event_name: 'Stop', transcript_path: tpath, cwd: dir, stop_hook_active: false });
      const r = cp.spawnSync(process.execPath, [HOOK], { input, encoding: 'utf8', env: { ...process.env, VERIFIED_REVIEW_LEDGER: '' } });
      assert.equal(r.status, 0, r.stderr);
      assert.equal(r.stdout, '', 'the hook never emits a decision');
      const lines = fs.readFileSync(path.join(dir, '.verified', 'review-ledger.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l));
      assert.deepEqual(lines.map(l => l.agent), ['security-review'], 'the running test-review waits for a later Stop');
    },
  },
  {
    name: 'hook seam: reads the async report from the subagent transcript beside the session',
    fn: () => {
      const dir = governedRepo();
      const tpath = path.join(dir, 'S1.jsonl');
      fs.writeFileSync(tpath, transcript(dispatch('t1', 'security-review'), asyncLaunch('t1', 'ccc'), handBack('ccc', 'see notes')));
      fs.mkdirSync(path.join(dir, 'S1', 'subagents'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'S1', 'subagents', 'agent-ccc.jsonl'),
        JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: JSON_REPORT }] } }) + '\n');
      const input = JSON.stringify({ hook_event_name: 'Stop', transcript_path: tpath, cwd: dir });
      assert.equal(cp.spawnSync(process.execPath, [HOOK], { input, encoding: 'utf8' }).status, 0);
      const [l] = fs.readFileSync(path.join(dir, '.verified', 'review-ledger.jsonl'), 'utf8').trim().split('\n').map(x => JSON.parse(x));
      assert.equal(l.parsed, true);
      assert.equal(l.counts.error, 1);
    },
  },
  {
    name: 'hook seam: outside a .verified/ repo, with hooks.review_ledger false, or VERIFIED_REVIEW_LEDGER=0 → no file',
    fn: () => {
      const make = () => {
        const dir = governedRepo();
        const tpath = path.join(dir, 's.jsonl');
        fs.writeFileSync(tpath, transcript(dispatch('t1', 'security-review'), syncResult('t1', JSON_REPORT)));
        return { dir, tpath };
      };
      const run = (dir, tpath, env = {}) =>
        cp.spawnSync(process.execPath, [HOOK], { input: JSON.stringify({ transcript_path: tpath, cwd: dir }), encoding: 'utf8', env: { ...process.env, ...env } });
      const ledgerOf = dir => path.join(dir, '.verified', 'review-ledger.jsonl');

      const a = make();
      fs.writeFileSync(path.join(a.dir, '.verified', 'config.json'), JSON.stringify({ hooks: { review_ledger: false } }));
      run(a.dir, a.tpath);
      assert.equal(fs.existsSync(ledgerOf(a.dir)), false, 'config opt-out');

      const b = make();
      run(b.dir, b.tpath, { VERIFIED_REVIEW_LEDGER: '0' });
      assert.equal(fs.existsSync(ledgerOf(b.dir)), false, 'env opt-out');

      const c = fs.mkdtempSync(path.join(os.tmpdir(), 'rl-plain-'));
      const ct = path.join(c, 's.jsonl');
      fs.writeFileSync(ct, transcript(dispatch('t1', 'security-review'), syncResult('t1', JSON_REPORT)));
      assert.equal(run(c, ct).status, 0);
      assert.equal(fs.existsSync(path.join(c, '.verified')), false, 'not governed → nothing created');
    },
  },
  {
    name: 'hook seam: malformed stdin or a missing transcript → exit 0, no output (fail open)',
    fn: () => {
      for (const input of ['not json', JSON.stringify({ transcript_path: '/nope/x.jsonl', cwd: '/nope' }), '']) {
        const r = cp.spawnSync(process.execPath, [HOOK], { input, encoding: 'utf8' });
        assert.equal(r.status, 0);
        assert.equal(r.stdout, '');
      }
    },
  },
];
