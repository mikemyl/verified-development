#!/usr/bin/env node
'use strict';

/**
 * hooks/lib/review-ledger.js — the per-dispatch review ledger. Contract:
 * review-ledger/v2. Model-free, no deps.
 *
 * One JSON line per finished review-agent dispatch, written by the Stop hook
 * (`hooks/ledger-writer.js`) from the session transcript — never by the model:
 * agent, severity counts parsed from the agent's own report, its status, the
 * tier and diff size from the `review-scope` output before it, and whether it
 * was a panel or a verification dispatch.
 *
 * Why not the v1 shape: v1 lines were written by the model that triaged the
 * findings, with an outcome it chose (`fixed`, `no-op`, …). Every lens scored a
 * 0.3–0.6 `fixed` share, complexity as high as correctness, because the model
 * applies suggestions readily. A number that cannot tell those apart drives no
 * decision, and recording it cost a turn per review. v2 counts what the agent
 * said, which is mechanical. Whether a finding was right is not in the ledger;
 * that needs the transcript and a human.
 *
 * hit rate = parsed panel dispatches with ≥1 error or warning / parsed panel
 * dispatches. A lens with a low hit rate over many dispatches is the one to
 * size-gate or drop. v1 lines are still read for their severity sums.
 *
 * Library:
 *   countFindings(text)                 -> { counts, status, parsed }
 *   entriesFrom(transcript, {readSubagent}) -> [entry]   (finished dispatches)
 *   pending(transcript, ledgerText, opts)   -> [entry]   (not yet in the ledger)
 *   parseLines(text)                    -> { entries, malformed }
 *   report(entries, {last})             -> { schema, window, agents, total }
 *
 * CLI:
 *   review-ledger.js report [--file <path>] [--last N]
 *   review-ledger.js backfill --transcript <session.jsonl> [--file <path>]
 *
 * Default file: .verified/review-ledger.jsonl under cwd. Exit: 0 ok · 1 usage.
 */

const fs = require('fs');
const path = require('path');

const SCHEMA = 'review-ledger/v2';
const LEGACY_SCHEMA = 'review-ledger/v1';
const DEFAULT_FILE = path.join('.verified', 'review-ledger.jsonl');
const REVIEW_AGENT = /^verified-development:([a-z0-9-]+-review)$/;
const ASYNC_LAUNCH = 'Async agent launched';

// --- reading an agent's report -----------------------------------------------

/**
 * Count findings by severity. A JSON findings array (`"severity": "error"`)
 * wins over a markdown table (`| error | …`) so a report that carries both is
 * not counted twice. `info` rows are not findings. A report with neither and
 * no `Status:` line is unparsed — recorded as such, never guessed.
 */
function countFindings(text) {
  const t = String(text || '');
  const tally = re => {
    const counts = { error: 0, warning: 0, suggestion: 0 };
    let hits = 0;
    for (const m of t.matchAll(re)) {
      const sev = m[1].toLowerCase();
      if (sev in counts) counts[sev] += 1;
      hits += 1;
    }
    return { counts, hits };
  };
  const json = tally(/"severity"\s*:\s*"(error|warning|suggestion|info)"/gi);
  const table = tally(/^\s*\|\s*\**\s*(error|warning|suggestion|info)\s*\**\s*\|/gim);
  const status = (/\bStatus:?\**:?\s*\**\s*(PASS|WARN|FAIL)\b/i.exec(t) || [])[1];
  const emptyJson = /```json\s*\[\s*\]\s*```/.test(t);
  const pick = json.hits > 0 ? json : table;
  return {
    counts: pick.counts,
    status: status ? status.toUpperCase() : null,
    parsed: json.hits > 0 || table.hits > 0 || Boolean(status) || emptyJson,
  };
}

// --- reading a session transcript --------------------------------------------

function textOf(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map(c => (c && typeof c.text === 'string' ? c.text : typeof (c && c.content) === 'string' ? c.content : textOf(c && c.content)))
    .join('\n');
}

/** Every string inside a parsed line, joined: a hand-back can sit in any field. */
function allStrings(v, out = []) {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) for (const x of v) allStrings(x, out);
  else if (v && typeof v === 'object') for (const x of Object.values(v)) allStrings(x, out);
  return out;
}

const scopeField = (t, key) => {
  const m = new RegExp(`"${key}"\\s*:\\s*("([^"]*)"|-?\\d+|null)`).exec(t);
  if (!m) return null;
  if (m[2] !== undefined) return m[2];
  return m[1] === 'null' ? null : Number(m[1]);
};

/**
 * Finished review dispatches, in dispatch order. A dispatch is finished when
 * its result is in: a synchronous tool result without is_error, a hand-back
 * (peer origin, queued attachment or queue-operation carrying
 * `<agent-message from="<agentId>">`), or a completed task-notification. The
 * report text is taken from the first carrier; when it does not parse,
 * `readSubagent(agentId)` (the subagent's own transcript) is tried.
 */
function entriesFrom(transcript, opts = {}) {
  const readSubagent = typeof opts.readSubagent === 'function' ? opts.readSubagent : () => null;
  const dispatches = [];
  const byId = new Map();
  let scope = null;
  for (const raw of String(transcript || '').split('\n')) {
    if (!raw) continue;
    let o;
    try { o = JSON.parse(raw); } catch { continue; }
    const content = o.message && o.message.content;
    if (o.type === 'assistant' && Array.isArray(content)) {
      for (const c of content) {
        if (!c || c.type !== 'tool_use' || !(c.name === 'Agent' || c.name === 'Task')) continue;
        const input = c.input || {};
        const m = REVIEW_AGENT.exec(String(input.subagent_type || ''));
        if (!m) continue;
        const d = {
          id: c.id, agent: m[1], ts: o.timestamp || '', session: o.sessionId || null,
          verification: /verification mode|not-fixed/i.test(String(input.prompt || '')),
          scope, agentId: null, done: false, text: '',
        };
        dispatches.push(d);
        byId.set(c.id, d);
      }
      continue;
    }
    if (o.type === 'user' && Array.isArray(content)) {
      for (const c of content) {
        if (!c || c.type !== 'tool_result') continue;
        const t = textOf(c.content);
        const d = byId.get(c.tool_use_id);
        if (d) {
          if (t.includes(ASYNC_LAUNCH)) {
            const id = /agentId:\s*([A-Za-z0-9_-]+)/.exec(t);
            if (id) d.agentId = id[1];
          } else if (c.is_error !== true && !d.done) {
            d.done = true;
            d.text = t;
          }
        } else if (t.includes('"review-scope/v1"') && t.includes('"selected"')) {
          scope = { tier: scopeField(t, 'tier'), changed_lines: scopeField(t, 'changed_lines'), changed_files: scopeField(t, 'changed_files') };
        }
      }
      if (!(o.origin && o.origin.kind === 'peer')) continue;
    }
    const peer = o.origin && typeof o.origin === 'object' && o.origin.kind === 'peer' ? o.origin.from : null;
    const handBack = raw.includes('agent-message from=');
    const notified = raw.includes('<task-notification>') && raw.includes('<status>completed</status>');
    if (!peer && !handBack && !notified) continue;
    for (const d of dispatches) {
      if (d.done) continue;
      const byAgent = d.agentId && (peer === d.agentId || (handBack && raw.includes(d.agentId)));
      const byNote = notified && raw.includes(`<tool-use-id>${d.id}</tool-use-id>`);
      if (byAgent || byNote) {
        d.done = true;
        d.text = allStrings(o).join('\n');
      }
    }
  }
  return dispatches.filter(d => d.done).map(d => {
    let found = countFindings(d.text);
    if (!found.parsed && d.agentId) {
      const sub = readSubagent(d.agentId);
      if (sub) {
        const alt = countFindings(sub);
        if (alt.parsed) found = alt;
      }
    }
    return {
      schema: SCHEMA,
      ts: d.ts,
      agent: d.agent,
      dispatch_id: d.id,
      session: d.session,
      mode: d.verification ? 'verification' : 'panel',
      counts: found.counts,
      status: found.status,
      parsed: found.parsed,
      tier: d.scope ? d.scope.tier : null,
      changed_lines: d.scope ? d.scope.changed_lines : null,
      changed_files: d.scope ? d.scope.changed_files : null,
    };
  });
}

/** Entries from the transcript whose dispatch is not yet in the ledger. */
function pending(transcript, ledgerText, opts = {}) {
  const seen = new Set();
  for (const raw of String(ledgerText || '').split('\n')) {
    try {
      const e = JSON.parse(raw);
      if (e && e.dispatch_id) seen.add(e.dispatch_id);
    } catch { /* skip */ }
  }
  return entriesFrom(transcript, opts).filter(e => !seen.has(e.dispatch_id));
}

// --- the report --------------------------------------------------------------

function parseLines(text) {
  const entries = [];
  let malformed = 0;
  for (const raw of String(text || '').split('\n')) {
    const l = raw.trim();
    if (!l) continue;
    try {
      const o = JSON.parse(l);
      if (o && (o.schema === SCHEMA || o.schema === LEGACY_SCHEMA) && typeof o.agent === 'string') entries.push(o);
      else malformed += 1;
    } catch {
      malformed += 1;
    }
  }
  return { entries, malformed };
}

/** v1 lines kept their sums as top-level `errors`/`warnings`/`suggestions`. */
function countsOf(e) {
  if (e.counts && typeof e.counts === 'object') return e.counts;
  return { error: Number(e.errors) || 0, warning: Number(e.warnings) || 0, suggestion: Number(e.suggestions) || 0 };
}

function emptyAgent() {
  return { dispatches: 0, verifications: 0, unparsed: 0, with_findings: 0, hit_rate: 0, errors: 0, warnings: 0, suggestions: 0 };
}

function report(entries, opts = {}) {
  const all = Array.isArray(entries) ? entries : [];
  const last = Number(opts.last);
  const window = Number.isInteger(last) && last > 0 ? all.slice(-last) : all;
  const agents = {};
  const total = emptyAgent();
  for (const e of window) {
    const a = agents[e.agent] || (agents[e.agent] = emptyAgent());
    for (const t of [a, total]) {
      if (e.mode === 'verification') { t.verifications += 1; continue; }
      t.dispatches += 1;
      if (e.parsed === false) { t.unparsed += 1; continue; }
      const c = countsOf(e);
      t.errors += Number(c.error) || 0;
      t.warnings += Number(c.warning) || 0;
      t.suggestions += Number(c.suggestion) || 0;
      if ((Number(c.error) || 0) + (Number(c.warning) || 0) > 0) t.with_findings += 1;
    }
  }
  for (const t of [...Object.values(agents), total]) {
    const parsed = t.dispatches - t.unparsed;
    t.hit_rate = parsed ? Math.round((t.with_findings / parsed) * 100) / 100 : 0;
  }
  return { schema: SCHEMA, window: window.length, agents, total };
}

// --- writing -----------------------------------------------------------------

function append(file, entries) {
  if (!entries.length) return 0;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, entries.map(e => JSON.stringify(e)).join('\n') + '\n');
  return entries.length;
}

/** The subagent transcript Claude Code keeps beside a session: <dir>/<session>/subagents/agent-<id>.jsonl. */
function subagentReader(transcriptPath) {
  const base = String(transcriptPath || '').replace(/\.jsonl$/, '');
  return agentId => {
    try {
      const lines = fs.readFileSync(path.join(base, 'subagents', `agent-${agentId}.jsonl`), 'utf8').split('\n');
      for (let i = lines.length - 1; i >= 0; i -= 1) {
        let o;
        try { o = JSON.parse(lines[i]); } catch { continue; }
        if (o.type === 'assistant') {
          const t = textOf(o.message && o.message.content);
          if (t.trim()) return t;
        }
      }
    } catch { /* absent */ }
    return null;
  };
}

// --- CLI ---------------------------------------------------------------------

const USAGE =
  'usage: review-ledger.js report [--file <path>] [--last N]\n' +
  '       review-ledger.js backfill --transcript <session.jsonl> [--file <path>]\n' +
  'The Stop hook writes the ledger; there is no record command.\n';

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith('--')) {
      out[argv[i].slice(2)] = argv[i + 1];
      i += 1;
    }
  }
  return out;
}

const readOr = (file, fallback) => {
  try { return fs.readFileSync(file, 'utf8'); } catch { return fallback; }
};

function main() {
  const [, , cmd, ...rest] = process.argv;
  const args = parseArgs(rest);
  const file = args.file || DEFAULT_FILE;
  if (cmd === 'report') {
    const { entries, malformed } = parseLines(readOr(file, ''));
    process.stdout.write(JSON.stringify({ ...report(entries, { last: args.last }), malformed, file }, null, 2) + '\n');
    return 0;
  }
  if (cmd === 'backfill' && args.transcript) {
    const t = readOr(args.transcript, null);
    if (t === null) {
      process.stderr.write(`review-ledger: cannot read ${args.transcript}\n`);
      return 1;
    }
    const n = append(file, pending(t, readOr(file, ''), { readSubagent: subagentReader(args.transcript) }));
    process.stdout.write(JSON.stringify({ written: n, file }) + '\n');
    return 0;
  }
  process.stderr.write(USAGE);
  return 1;
}

if (require.main === module) process.exitCode = main();

module.exports = { SCHEMA, DEFAULT_FILE, countFindings, entriesFrom, pending, parseLines, report, append, subagentReader };
