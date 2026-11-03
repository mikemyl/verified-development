'use strict';

/**
 * Tests for hooks/lib/ledger-guard.js (contract ledger-guard/v1) and the Stop
 * hook seam hooks/ledger-guard.js.
 *
 * Measured reason: on 2026-10-16 a keros-web /review dispatched four agents,
 * triaged, and "recorded" the ledger with `for a in …; do :; done` — no line
 * landed. A second keros-web session skipped step 7 outright. The guard reads
 * the transcript the harness hands every Stop hook and blocks once when a
 * finished review left no ledger line.
 *
 * Transcripts here are built in the shape Claude Code writes: assistant
 * tool_use lines, user tool_result lines, `origin.kind` human/peer/
 * task-notification, and queued hand-backs as attachments.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO = path.resolve(__dirname, '..');
const guard = require(path.join(REPO, 'hooks', 'lib', 'ledger-guard.js'));
const HOOK = path.join(REPO, 'hooks', 'ledger-guard.js');

// --- transcript builders -------------------------------------------------------

let clock = Date.parse('2026-10-16T13:00:00Z');
const at = () => new Date((clock += 1000)).toISOString();

const prompt = text => ({ type: 'user', timestamp: at(), origin: { kind: 'human' }, promptSource: 'typed', message: { role: 'user', content: text } });
const dispatch = (id, agent) => ({
  type: 'assistant', timestamp: at(),
  message: { role: 'assistant', content: [{ type: 'tool_use', id, name: 'Agent', input: { subagent_type: `verified-development:${agent}`, prompt: 'review' } }] },
});
const launched = (id, agentId) => ({
  type: 'user', timestamp: at(),
  message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: [{ type: 'text', text: `Async agent launched successfully.\nagentId: ${agentId} (internal ID)` }] }] },
});
const syncResult = id => ({
  type: 'user', timestamp: at(),
  message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: [{ type: 'text', text: '**Status: PASS**' }] }] },
});
const peer = agentId => ({
  type: 'user', timestamp: at(), origin: { kind: 'peer', from: agentId },
  message: { role: 'user', content: `Another Claude session sent a message:\n<agent-message from="${agentId}">\n[Subagent hand-back] PASS` },
});
const queued = agentId => ({
  type: 'attachment', timestamp: at(),
  attachment: { type: 'queued_command', prompt: `<agent-message from="${agentId}">\n[Subagent hand-back] WARN` },
});
const notification = (id, status = 'completed') => ({
  type: 'user', timestamp: at(), origin: { kind: 'task-notification' },
  message: { role: 'user', content: `<task-notification>\n<task-id>x</task-id>\n<tool-use-id>${id}</tool-use-id>\n<status>${status}</status>\n</task-notification>` },
});
const bash = (id, command) => ({
  type: 'assistant', timestamp: at(),
  message: { role: 'assistant', content: [{ type: 'tool_use', id, name: 'Bash', input: { command } }] },
});
const bashResult = (id, text, isError = false) => ({
  type: 'user', timestamp: at(),
  message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: text, is_error: isError }] },
});
const say = text => ({ type: 'assistant', timestamp: at(), message: { role: 'assistant', content: [{ type: 'text', text }] } });

const jsonl = lines => lines.map(l => JSON.stringify(l)).join('\n') + '\n';
const ledgerLine = (agent, ts) => JSON.stringify({ schema: 'review-ledger/v1', ts, agent, outcome: 'no-op' });

function governed() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-guard-'));
  fs.mkdirSync(path.join(d, '.verified'));
  fs.writeFileSync(path.join(d, '.verified', 'config.json'), '{}');
  return d;
}

// A finished two-agent background review that recorded nothing.
function finishedReview() {
  return [
    prompt('add the property-reviews write'),
    dispatch('t1', 'correctness-review'), launched('t1', 'aaa111'),
    dispatch('t2', 'security-review'), launched('t2', 'bbb222'),
    say('Two review agents are running.'),
    peer('aaa111'), notification('t1'),
    queued('bbb222'),
    say('**Review: WARN.**'),
  ];
}

const decide = (lines, extra = {}) => guard.decide({ transcript: jsonl(lines), ledger: '', cwd: governed(), env: {}, ...extra });

module.exports = [
  {
    name: 'block: every agent reported, no ledger line — names each agent and the record command',
    fn: () => {
      const r = decide(finishedReview());
      assert.equal(r.decision, 'block');
      assert.deepEqual(r.uncovered, ['correctness-review', 'security-review']);
      assert.match(r.reason, /review-ledger\.js record --agent/);
      assert.match(r.reason, /--since/);
    },
  },
  {
    name: 'block: a shell loop that never calls the script is not a ledger line (the 2026-10-16 keros-web case)',
    fn: () => {
      const lines = [...finishedReview(),
        bash('b1', 'just verify; for a in correctness-review:no-op security-review:escalated; do :; done'),
        bashResult('b1', 'verify=0')];
      assert.equal(decide(lines).decision, 'block');
    },
  },
  {
    name: 'allow: the repo ledger has a line per agent written after its dispatch',
    fn: () => {
      const lines = finishedReview();
      const later = '2026-12-31T00:00:00.000Z';
      const r = decide(lines, { ledger: [ledgerLine('correctness-review', later), ledgerLine('security-review', later)].join('\n') });
      assert.equal(r.decision, 'allow');
      assert.equal(r.reason, 'recorded');
    },
  },
  {
    name: 'block: a ledger line older than the dispatch belongs to an earlier review',
    fn: () => {
      const old = '2020-01-01T00:00:00.000Z';
      const r = decide(finishedReview(), { ledger: [ledgerLine('correctness-review', old), ledgerLine('security-review', old)].join('\n') });
      assert.equal(r.decision, 'block');
    },
  },
  {
    name: 'allow: successful record calls in the transcript cover a review of a sibling repo',
    fn: () => {
      const lines = [...finishedReview(),
        bash('r1', 'cd ../kernel && node /x/hooks/lib/review-ledger.js record --agent correctness-review --outcome no-op'),
        bashResult('r1', '{"schema":"review-ledger/v1"}'),
        bash('r2', 'cd ../kernel && node /x/hooks/lib/review-ledger.js record --agent security-review --outcome escalated'),
        bashResult('r2', '{"schema":"review-ledger/v1"}')];
      assert.equal(decide(lines).decision, 'allow');
    },
  },
  {
    name: 'block: a record call that failed (rejected fixed line) does not count',
    fn: () => {
      const lines = [...finishedReview(),
        bash('r1', 'node /x/hooks/lib/review-ledger.js record --agent correctness-review --outcome fixed'),
        bashResult('r1', "Exit code 1\nreview-ledger: outcome 'fixed' requires --since", true),
        bash('r2', 'node /x/hooks/lib/review-ledger.js record --agent security-review --outcome no-op'),
        bashResult('r2', '{}')];
      const r = decide(lines);
      assert.equal(r.decision, 'block');
      assert.deepEqual(r.uncovered, ['correctness-review']);
    },
  },
  {
    name: 'allow: a review agent still running — the review is not over (no premature ledger)',
    fn: () => {
      const lines = [prompt('go'),
        dispatch('t1', 'correctness-review'), launched('t1', 'aaa111'),
        dispatch('t2', 'test-review'), launched('t2', 'bbb222'),
        peer('aaa111'),
        say('Waiting on test review.')];
      const r = decide(lines);
      assert.equal(r.decision, 'allow');
      assert.equal(r.reason, 'review-running');
      assert.deepEqual(r.pending, ['test-review']);
    },
  },
  {
    name: 'block: a synchronous agent result counts as done',
    fn: () => {
      const lines = [prompt('go'), dispatch('s1', 'test-review'), syncResult('s1'), say('PASS')];
      assert.equal(decide(lines).decision, 'block');
    },
  },
  {
    name: 'allow: a failed task-notification is not a completed review',
    fn: () => {
      const lines = [prompt('go'), dispatch('t1', 'test-review'), launched('t1', 'ccc333'), notification('t1', 'failed'), say('it failed')];
      assert.equal(decide(lines).reason, 'review-running');
    },
  },
  {
    name: 'allow: the user typed since the last result — one nudge per review, not one per turn',
    fn: () => {
      const lines = [...finishedReview(), prompt('thanks, now something else'), say('ok')];
      assert.equal(decide(lines).reason, 'stale-batch');
    },
  },
  {
    name: 'allow: only the newest batch counts — an older unrecorded review is history',
    fn: () => {
      const lines = [...finishedReview(), prompt('next change'),
        dispatch('n1', 'test-review'), syncResult('n1'),
        bash('n2', 'node /x/review-ledger.js record --agent test-review --outcome no-op'), bashResult('n2', '{}')];
      assert.equal(decide(lines).reason, 'recorded');
    },
  },
  {
    name: 'allow: plan critics and other agents are not review dispatches',
    fn: () => {
      const lines = [prompt('plan it'), {
        type: 'assistant', timestamp: at(),
        message: { role: 'assistant', content: [{ type: 'tool_use', id: 'p1', name: 'Agent', input: { subagent_type: 'verified-development:plan-critic-design' } }] },
      }, syncResult('p1'), dispatch('e1', 'Explore'), syncResult('e1')];
      assert.equal(decide(lines).reason, 'no-review');
    },
  },
  {
    name: 'allow: stop_hook_active (second stop in a row) never blocks — the hook cannot loop',
    fn: () => {
      assert.equal(decide(finishedReview(), { stopHookActive: true }).reason, 'stop-hook-active');
    },
  },
  {
    name: 'allow: outside a .verified/ repo, with hooks.ledger_guard false, or VERIFIED_LEDGER_GUARD=0',
    fn: () => {
      const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-guard-bare-'));
      assert.equal(decide(finishedReview(), { cwd: bare }).reason, 'not-governed');
      const off = governed();
      fs.writeFileSync(path.join(off, '.verified', 'config.json'), JSON.stringify({ hooks: { ledger_guard: false } }));
      assert.equal(decide(finishedReview(), { cwd: off }).reason, 'config-opt-out');
      assert.equal(decide(finishedReview(), { env: { VERIFIED_LEDGER_GUARD: 'off' } }).reason, 'env-opt-out');
    },
  },

  // --- the Stop hook seam (real subprocess) ---------------------------------
  {
    name: 'hook seam: reads transcript_path and the repo ledger, prints {decision:block} on stdout, exit 0',
    fn: () => {
      const cwd = governed();
      const transcript = path.join(cwd, 'session.jsonl');
      fs.writeFileSync(transcript, jsonl(finishedReview()));
      const run = () => spawnSync('node', [HOOK], {
        input: JSON.stringify({ hook_event_name: 'Stop', transcript_path: transcript, cwd, stop_hook_active: false }),
        encoding: 'utf8', env: { ...process.env, VERIFIED_LEDGER_GUARD: '' },
      });
      const blocked = run();
      assert.equal(blocked.status, 0);
      const out = JSON.parse(blocked.stdout);
      assert.equal(out.decision, 'block');
      assert.match(out.reason, /correctness-review, security-review/);

      const later = '2099-01-01T00:00:00.000Z';
      fs.writeFileSync(path.join(cwd, '.verified', 'review-ledger.jsonl'),
        [ledgerLine('correctness-review', later), ledgerLine('security-review', later)].join('\n') + '\n');
      const allowed = run();
      assert.equal(allowed.status, 0);
      assert.equal(allowed.stdout, '', 'allow is silence');
    },
  },
  {
    name: 'hook seam: malformed stdin or a missing transcript → exit 0, no output (fail open)',
    fn: () => {
      for (const input of ['not json', JSON.stringify({ transcript_path: '/nope/x.jsonl', cwd: governed() })]) {
        const r = spawnSync('node', [HOOK], { input, encoding: 'utf8' });
        assert.equal(r.status, 0);
        assert.equal(r.stdout, '');
      }
    },
  },
];
