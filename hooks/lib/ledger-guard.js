#!/usr/bin/env node
'use strict';

/**
 * hooks/lib/ledger-guard.js — contract `ledger-guard/v1`. Model-free, no deps.
 *
 * The Stop-hook check that a finished review left its ledger lines. On
 * 2026-10-16 a keros-web `/review` dispatched four agents, triaged them, and
 * "recorded" the ledger with a shell loop whose body was `:` — nothing landed
 * and the report did not say so. Step 7 of `/review` is prose; this makes it
 * mechanical.
 *
 * The batch: the plugin's review agents (`verified-development:*-review`)
 * dispatched since the last typed user prompt that precedes the newest such
 * dispatch. Older batches are history, not this turn's debt.
 *
 * A dispatch is DONE when its result is in: a synchronous tool result, a
 * `peer` hand-back from its agent id, or a `<status>completed</status>`
 * task-notification naming its tool-use id. While any dispatch in the batch is
 * still running the review is not over, so the guard allows.
 *
 * Checked once: when a typed prompt arrived after the batch's last result, the
 * turn that owed the ledger is over and the guard allows (no nagging on every
 * later turn of a long session).
 *
 * A done dispatch is COVERED by a ledger line for the same agent written at or
 * after the dispatch: in the governed repo's `.verified/review-ledger.jsonl`,
 * or a successful `review-ledger.js record` Bash call naming the agent (the
 * review may have targeted a sibling repo with its own ledger).
 *
 *   decide({transcript, ledger, stopHookActive, cwd, env})
 *     -> {schema, decision: 'allow'|'block', reason, pending:[], uncovered:[]}
 *
 * Scope mirrors the git guard: only under a `.verified/` directory; off with
 * `hooks.ledger_guard: false` in config.json or VERIFIED_LEDGER_GUARD=0.
 * `stop_hook_active` → allow, so the hook can never loop.
 */

const fs = require('fs');
const path = require('path');
const { findGovernedRoot } = require('./git-guard.js');

const SCHEMA = 'ledger-guard/v1';
const REVIEW_AGENT = /^verified-development:([a-z0-9-]+-review)$/;
const ASYNC_LAUNCH = 'Async agent launched';

function textOf(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map(c => (c && typeof c.text === 'string' ? c.text : typeof c.content === 'string' ? c.content : textOf(c && c.content))).join('\n');
}

function isTypedPrompt(o) {
  if (o.type !== 'user') return false;
  if (o.origin && typeof o.origin === 'object') return o.origin.kind === 'human';
  if (o.promptSource) return o.promptSource === 'typed';
  const c = o.message && o.message.content;
  return typeof c === 'string' && !c.trimStart().startsWith('<');
}

/** Parse the transcript JSONL into dispatches, completions and ledger calls. */
function scan(transcript) {
  const dispatches = [];
  const byId = new Map();
  const recordCalls = new Map(); // tool_use_id -> {ts, command}
  const records = [];
  let lastPromptIdx = -1;
  let seq = 0;
  for (const raw of String(transcript || '').split('\n')) {
    if (!raw) continue;
    let o;
    try { o = JSON.parse(raw); } catch { continue; }
    seq += 1;
    const ts = o.timestamp || '';
    const content = o.message && o.message.content;
    if (isTypedPrompt(o)) { lastPromptIdx = seq; continue; }
    if (o.type === 'assistant' && Array.isArray(content)) {
      for (const c of content) {
        if (!c || c.type !== 'tool_use') continue;
        const input = c.input || {};
        const m = (c.name === 'Agent' || c.name === 'Task') && REVIEW_AGENT.exec(String(input.subagent_type || ''));
        if (m) {
          const d = { id: c.id, agent: m[1], ts, seq, afterPrompt: lastPromptIdx, agentId: null, done: 0 };
          dispatches.push(d);
          byId.set(c.id, d);
        } else if (c.name === 'Bash' && /review-ledger\.js\b[\s\S]*\brecord\b/.test(String(input.command || ''))) {
          recordCalls.set(c.id, { ts, command: String(input.command) });
        }
      }
      continue;
    }
    if (o.type === 'user' && Array.isArray(content)) {
      for (const c of content) {
        if (!c || c.type !== 'tool_result') continue;
        const d = byId.get(c.tool_use_id);
        if (d) {
          const t = textOf(c.content);
          if (t.includes(ASYNC_LAUNCH)) {
            const id = /agentId:\s*([A-Za-z0-9_-]+)/.exec(t);
            if (id) d.agentId = id[1];
          } else if (c.is_error !== true) {
            d.done = seq;
          }
        }
        const r = recordCalls.get(c.tool_use_id);
        if (r && c.is_error !== true && !/^Exit code [1-9]/m.test(textOf(c.content))) records.push(r);
      }
      continue;
    }
    // A finished background agent shows up as a peer hand-back, a queued
    // attachment or queue-operation carrying `<agent-message from="<id>">`, or
    // a task-notification naming the tool-use id. Match on the raw line so
    // every carrier counts.
    const peer = o.origin && typeof o.origin === 'object' && o.origin.kind === 'peer' ? o.origin.from : null;
    const handBack = raw.includes('agent-message from=');
    const notified = raw.includes('<task-notification>') && raw.includes('<status>completed</status>');
    if (!peer && !handBack && !notified) continue;
    for (const d of dispatches) {
      if (d.done) continue;
      if (d.agentId && (peer === d.agentId || (handBack && raw.includes(d.agentId)))) d.done = seq;
      else if (notified && raw.includes(`<tool-use-id>${d.id}</tool-use-id>`)) d.done = seq;
    }
  }
  return { dispatches, records, lastPrompt: lastPromptIdx };
}

function currentBatch(dispatches) {
  if (dispatches.length === 0) return [];
  const anchor = dispatches[dispatches.length - 1].afterPrompt;
  return dispatches.filter(d => d.seq > anchor);
}

function ledgerEntries(text) {
  const out = [];
  for (const raw of String(text || '').split('\n')) {
    try {
      const o = JSON.parse(raw);
      if (o && typeof o.agent === 'string' && typeof o.ts === 'string') out.push(o);
    } catch { /* skip */ }
  }
  return out;
}

function covered(d, entries, records) {
  if (entries.some(e => e.agent === d.agent && e.ts >= d.ts)) return true;
  return records.some(r => r.ts >= d.ts && r.command.includes(d.agent));
}

function optedOut(root, env) {
  const flag = String((env || {}).VERIFIED_LEDGER_GUARD == null ? '' : env.VERIFIED_LEDGER_GUARD).trim().toLowerCase();
  if (flag === '0' || flag === 'off' || flag === 'false') return 'env-opt-out';
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(root, '.verified', 'config.json'), 'utf8'));
    if (cfg && cfg.hooks && cfg.hooks.ledger_guard === false) return 'config-opt-out';
  } catch { /* absent or malformed config is not an opt-out */ }
  return null;
}

function decide(input) {
  const { transcript, ledger, stopHookActive, cwd, env } = input || {};
  const allow = (reason, extra = {}) => ({ schema: SCHEMA, decision: 'allow', reason, pending: [], uncovered: [], ...extra });
  if (stopHookActive) return allow('stop-hook-active');
  const root = findGovernedRoot(cwd);
  if (!root) return allow('not-governed');
  const out = optedOut(root, env || process.env);
  if (out) return allow(out);
  const { dispatches, records, lastPrompt } = scan(transcript);
  const batch = currentBatch(dispatches);
  if (batch.length === 0) return allow('no-review');
  const pending = batch.filter(d => !d.done).map(d => d.agent);
  if (pending.length) return allow('review-running', { pending });
  // The user has spoken since the last result came in: that review's turn is
  // over and was already checked once. Nag once per review, not every turn.
  if (lastPrompt > Math.max(...batch.map(d => d.done))) return allow('stale-batch');
  const entries = ledgerEntries(ledger);
  const uncovered = [...new Set(batch.filter(d => !covered(d, entries, records)).map(d => d.agent))];
  if (uncovered.length === 0) return allow('recorded');
  const reason =
    `verified-development ledger guard: ${uncovered.length} review agent(s) reported but have no ledger line: ` +
    `${uncovered.join(', ')}. Record one line each before ending the turn (/review step 7): ` +
    `node ${path.join(__dirname, 'review-ledger.js')} record --agent <name> --outcome <no-op|fixed|dismissed|escalated> ` +
    "--errors N --warnings N --suggestions N --round N. `fixed` needs --since <the checkpoint taken before that agent's fixes>; " +
    'with no such checkpoint the outcome is escalated or dismissed. Then say in the report how many lines you recorded.';
  return { schema: SCHEMA, decision: 'block', reason, pending: [], uncovered };
}

module.exports = { SCHEMA, scan, decide, currentBatch };
