#!/usr/bin/env node
'use strict';

/**
 * hooks/lib/review-ledger.js — per-dispatch find/fix/no-op ledger.
 * Contract: review-ledger/v1.
 *
 * One JSON line per review-agent dispatch: which agent ran, what it found
 * (error/warning/suggestion counts) and what happened next (`no-op` found
 * nothing actionable, `fixed` a finding was acted on, `dismissed` the findings
 * were judged noise or pre-existing, `escalated` the user had to decide). The
 * report groups by agent and computes yield = fixed / dispatches, so "is this
 * lens paying for itself" is a file read, not a transcript dig.
 *
 * Outcomes are SELF-REPORTED by the model that triaged and fixed the findings,
 * and self-reports drift optimistic. The one mechanical witness is the working
 * tree: a `fixed` line must carry `files` >= 1, the number of files changed
 * since the pre-fix checkpoint (`checkpoint.js diff <ref>` → files.length).
 * A fix that changed no file is rejected here, not argued about in prose.
 * `dismissed` under-counting has no mechanical witness; spot-check yields
 * against the transcript before acting on them.
 *
 * Library:
 *   record(entry, {file})         -> entry as written (throws on a bad entry)
 *   parseLines(text)              -> { entries, malformed }
 *   report(entries, {last})       -> { schema, agents, total, window }
 *
 * CLI:
 *   review-ledger.js record --agent <name> --outcome <no-op|fixed|dismissed|escalated>
 *                           [--errors N] [--warnings N] [--suggestions N] [--files N]
 *                           [--round N] [--file <path>]
 *   review-ledger.js report [--file <path>] [--last N]
 *
 * Default file: .verified/review-ledger.jsonl under cwd. Exit: 0 ok · 1 usage.
 */

const fs = require('fs');
const path = require('path');

const SCHEMA = 'review-ledger/v1';
const OUTCOMES = ['no-op', 'fixed', 'dismissed', 'escalated'];
const COUNTS = ['errors', 'warnings', 'suggestions', 'files', 'round'];
const DEFAULT_FILE = path.join('.verified', 'review-ledger.jsonl');

function count(entry, key) {
  const raw = entry[key];
  if (raw == null || raw === '') return 0;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) throw new Error(`${key} must be a non-negative integer, got ${JSON.stringify(raw)}`);
  return n;
}

function validate(entry) {
  const e = entry || {};
  if (!e.agent || typeof e.agent !== 'string') throw new Error('agent is required');
  if (!OUTCOMES.includes(e.outcome)) throw new Error(`outcome must be one of ${OUTCOMES.join('|')}, got ${JSON.stringify(e.outcome)}`);
  const out = { schema: SCHEMA, ts: new Date().toISOString(), agent: e.agent, outcome: e.outcome };
  for (const k of COUNTS) out[k] = count(e, k);
  if (out.outcome === 'fixed' && out.files < 1) {
    throw new Error(
      "outcome 'fixed' requires files >= 1: the number of files changed since the pre-fix checkpoint " +
      '(node checkpoint.js diff <ref> → .files.length). A fix that changed no file is dismissed or escalated, not fixed',
    );
  }
  return out;
}

function record(entry, opts = {}) {
  const line = validate(entry);
  const file = opts.file || DEFAULT_FILE;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, JSON.stringify(line) + '\n');
  return line;
}

function parseLines(text) {
  const entries = [];
  let malformed = 0;
  for (const raw of String(text || '').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    try {
      const obj = JSON.parse(line);
      if (obj && obj.schema === SCHEMA && typeof obj.agent === 'string' && OUTCOMES.includes(obj.outcome)) entries.push(obj);
      else malformed += 1;
    } catch {
      malformed += 1;
    }
  }
  return { entries, malformed };
}

function emptyAgent() {
  const outcomes = {};
  for (const o of OUTCOMES) outcomes[o] = 0;
  return { dispatches: 0, outcomes, errors: 0, warnings: 0, suggestions: 0, files: 0, yield: 0 };
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
      t.dispatches += 1;
      t.outcomes[e.outcome] += 1;
      t.errors += Number(e.errors) || 0;
      t.warnings += Number(e.warnings) || 0;
      t.suggestions += Number(e.suggestions) || 0;
      t.files += Number(e.files) || 0;
    }
  }
  for (const t of [...Object.values(agents), total]) {
    t.yield = t.dispatches ? Math.round((t.outcomes.fixed / t.dispatches) * 100) / 100 : 0;
  }
  return { schema: SCHEMA, window: window.length, agents, total };
}

// --- CLI ---------------------------------------------------------------------

const USAGE =
  'usage: review-ledger.js record --agent <name> --outcome <no-op|fixed|dismissed|escalated> ' +
  '[--errors N] [--warnings N] [--suggestions N] [--files N (required for fixed)] [--round N] [--file <path>]\n' +
  '       review-ledger.js report [--file <path>] [--last N]\n';

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

function main() {
  const [, , cmd, ...rest] = process.argv;
  const args = parseArgs(rest);
  if (cmd === 'record') {
    try {
      const line = record(args, { file: args.file });
      process.stdout.write(JSON.stringify(line) + '\n');
      return 0;
    } catch (err) {
      process.stderr.write(`review-ledger: ${err.message}\n${USAGE}`);
      return 1;
    }
  }
  if (cmd === 'report') {
    const file = args.file || DEFAULT_FILE;
    let text = '';
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch {
      text = ''; // nothing recorded yet is a zero report, not an error
    }
    const { entries, malformed } = parseLines(text);
    process.stdout.write(JSON.stringify({ ...report(entries, { last: args.last }), malformed, file }, null, 2) + '\n');
    return 0;
  }
  process.stderr.write(USAGE);
  return 1;
}

if (require.main === module) process.exitCode = main();

module.exports = { record, parseLines, report, validate, SCHEMA, OUTCOMES, DEFAULT_FILE };
