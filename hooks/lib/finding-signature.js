'use strict';

/**
 * hooks/lib/finding-signature.js
 *
 * Finding identity across review rounds, and the termination decision for
 * /review's correction loop. Contract: finding-signature/v1.
 *
 * The loop used to be "re-run the agents that found issues, max 2 iterations".
 * That has no notion of finding IDENTITY, so nothing could tell "this round
 * found the same problem again" from "the fix introduced a new one" — the
 * loop could churn without anything noticing. This module decides new-vs-carried
 * and when to stop; a script makes the decision, not the model — same doctrine
 * as waves.js / test-gate.js / repair-routing.js. It is the review-side sibling
 * of repair-routing.js's dead-end detection and shares its volatile-token
 * stripping (one implementation, not two).
 *
 * Public API (library):
 *   normalizeMessage(text)              -> string     (volatile stripped, lowercased)
 *   signature(finding)                  -> string     (sha1 of the stable identity)
 *   findingKey(finding)                 -> FindingKey
 *   sameFinding(a, b)                   -> boolean    (signature + line within ±3)
 *   matchCarried(previous, current)     -> { new: [], carried: [] }
 *   clearsFloor(finding)                -> boolean
 *   diffIntervals(diffText)             -> { file: [[start,end], …] }
 *   fixProvenance(newFindings, diff)    -> { inside, total, files }
 *   classifyRound({round, previous, current, fixDiff, maxRounds}) -> contract
 *
 * A finding is { agent, file, line?, category?, message, severity?, confidence? }.
 * Nothing here throws on malformed input: a review loop must never be blocked by
 * its own bookkeeping.
 *
 * CLI:
 *   finding-signature.js round --round N --current cur.json
 *                              [--previous prev.json] [--fix-diff d.diff] [--max-rounds N]
 * Exit codes: 0 ok · 1 usage error.
 */

const fs = require('fs');
const crypto = require('crypto');
const { stripVolatile } = require('./repair-routing.js');

const SCHEMA = 'finding-signature/v1';

/** Two reports of one finding may drift by this many lines and stay the same finding. */
const LINE_TOLERANCE = 3;

/** Hard cap: the initial panel plus three correction rounds. */
const MAX_ROUNDS = 4;

/** Severities that can keep the loop running. */
const ACTIONABLE_SEVERITIES = new Set(['error', 'warning']);

/** Confidences that do NOT clear the floor. Anything else — including a missing
 *  or unrecognised value — does, so the loop never converges on a guess. */
const BELOW_FLOOR_CONFIDENCE = new Set(['low', 'none']);

// --- message normalization ---------------------------------------------------

// Volatile within a finding message, on top of what repair-routing.stripVolatile
// already removes (timestamps, durations, addresses, temp paths).
const MESSAGE_VOLATILE = [
  /:\d+:\d+/g, // file:line:col references
  /\b(?:line|l)\s*#?\d+\b/gi, // "line 120", "L120"
  /\b[0-9a-f]{7,}\b/gi, // commit shas / content digests
  /(["'`])(?:\\.|(?!\1)[\s\S])*\1/g, // quoted spans — a fix that RENAMES an
  //                                    identifier must not read as a new finding
  /\b\d+\b/g, // bare numbers (an index, a count, a threshold)
];

/**
 * Strip everything that varies between two reports of the SAME problem, so a
 * finding keeps its identity across a fix attempt.
 *
 * The deliberate cost: two findings that differ ONLY inside a quoted span or a
 * number — "missing nil guard on `user`" and "missing nil guard on `account`",
 * same file, within ±3 lines — read as one finding, so the loop treats the
 * second as carried. Both still reach the report; only the decision to spend
 * another round is affected. The reverse error is worse: without this, every
 * fix that renames an identifier manufactures a new finding and the loop never
 * converges.
 * @param {string} text
 * @returns {string}
 */
function normalizeMessage(text) {
  let t = stripVolatile(String(text == null ? '' : text));
  for (const re of MESSAGE_VOLATILE) t = t.replace(re, ' ');
  return t.replace(/\s+/g, ' ').trim().toLowerCase();
}

// --- identity ----------------------------------------------------------------

/**
 * The stable identity of a finding: who reported it, where, about what kind of
 * problem, and the normalized message.
 *
 * The LINE IS DELIBERATELY OUTSIDE THE HASH. A hashed line bucket (`line // 7`)
 * is not the ±3 proximity relation it approximates: two reports at lines 6 and 7
 * land in different buckets and read as two distinct findings — exactly the
 * false-new result the severity floor and loop-until-dry rules must not get.
 * Proximity is not an equivalence relation, so it cannot be folded into a hash.
 * The line rides alongside in findingKey() and sameFinding() applies the real test.
 *
 * `category` is optional (our review agents report severity, not category) — when
 * absent the normalized message alone distinguishes two findings in one file.
 */
function signature(finding) {
  const f = finding || {};
  const basis = [
    String(f.agent || ''),
    String(f.file || ''),
    String(f.category || ''),
    normalizeMessage(f.message),
  ].join('::');
  return crypto.createHash('sha1').update(basis).digest('hex');
}

function toLine(value) {
  // `Number(null)` is 0 — an absent line must stay absent, not become line zero.
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** @returns {{signature,agent,file,line,category,severity,confidence,message}} */
function findingKey(finding) {
  const f = finding || {};
  return {
    signature: signature(f),
    agent: f.agent || null,
    file: f.file || null,
    line: toLine(f.line),
    category: f.category || null,
    severity: f.severity || null,
    confidence: f.confidence || null,
    message: f.message || '',
  };
}

/**
 * Same finding = same signature AND within LINE_TOLERANCE lines. A missing line
 * on either side falls back to signature equality (include-biased toward
 * "carried": re-reporting a known finding must not restart the loop).
 */
function sameFinding(a, b) {
  const ka = a && a.signature ? a : findingKey(a);
  const kb = b && b.signature ? b : findingKey(b);
  if (ka.signature !== kb.signature) return false;
  if (ka.line == null || kb.line == null) return true;
  return Math.abs(ka.line - kb.line) <= LINE_TOLERANCE;
}

/**
 * Split this round's findings into genuinely NEW and CARRIED from the previous
 * round.
 * @returns {{new: Array, carried: Array}}
 */
function matchCarried(previous, current) {
  const prev = (Array.isArray(previous) ? previous : []).map(findingKey);
  const cur = (Array.isArray(current) ? current : []).map(findingKey);
  const fresh = [];
  const carried = [];
  for (const key of cur) {
    if (prev.some(p => sameFinding(p, key))) carried.push(key);
    else fresh.push(key);
  }
  return { new: fresh, carried };
}

// --- severity floor ----------------------------------------------------------

/**
 * Does this finding justify another round? Error/warning at high or medium
 * confidence does. Suggestion-tier and explicitly low-confidence findings do
 * not — they are logged to the report, never chased.
 */
function clearsFloor(finding) {
  const f = finding || {};
  if (!ACTIONABLE_SEVERITIES.has(String(f.severity || 'error').toLowerCase())) return false;
  const confidence = f.confidence == null ? '' : String(f.confidence).toLowerCase();
  return !BELOW_FLOOR_CONFIDENCE.has(confidence);
}

// --- fix provenance ----------------------------------------------------------

const HUNK_RE = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;
const FILE_RE = /^\+\+\+ (?:b\/)?(.+)$/;
const GIT_RE = /^diff --git a\/(?:.+) b\/(.+)$/;

/**
 * Post-image line intervals touched by a unified diff, per file. Unparseable
 * input yields {} — this feeds a churn SIGNAL, never a gate, so it fails toward
 * "attribute nothing" rather than inventing provenance.
 */
function diffIntervals(diffText) {
  const out = {};
  let file = null;
  for (const line of String(diffText || '').split('\n')) {
    const git = line.match(GIT_RE);
    if (git) {
      file = git[1];
      continue;
    }
    const plus = line.match(FILE_RE);
    if (plus) {
      file = plus[1] === '/dev/null' ? null : plus[1];
      continue;
    }
    const hunk = line.match(HUNK_RE);
    if (hunk && file) {
      const start = parseInt(hunk[1], 10);
      const count = hunk[2] === undefined ? 1 : parseInt(hunk[2], 10);
      (out[file] = out[file] || []).push([start, start + Math.max(count, 1) - 1]);
    }
  }
  return out;
}

/**
 * How many of this round's new findings land inside the PREVIOUS round's fix
 * delta — the judgment-free "the fix introduced it" signal. No LLM involved.
 */
function fixProvenance(newFindings, diffText) {
  const intervals = diffIntervals(diffText);
  const keys = (Array.isArray(newFindings) ? newFindings : []).map(findingKey);
  const files = {};
  let inside = 0;
  for (const k of keys) {
    if (k.line == null || !k.file) continue;
    const spans = intervals[k.file] || [];
    if (spans.some(([lo, hi]) => k.line >= lo && k.line <= hi)) {
      inside += 1;
      files[k.file] = (files[k.file] || 0) + 1;
    }
  }
  return { inside, total: keys.length, files };
}

// --- termination -------------------------------------------------------------

/**
 * The round ledger. Three termination rules, evaluated at each round boundary,
 * FIRST MATCH WINS:
 *
 *   1. round-cap      round >= maxRounds → escalate to a human, ledger attached.
 *                     `blocking_new_errors` says what the cap would ship: a
 *                     new error at high/medium confidence. Non-zero → the
 *                     report is FAIL; only the user raises --max-rounds.
 *   2. loop-until-dry round >= 2 and zero new-signature findings → converged.
 *   3. severity-floor round >= 2 and no NEW finding is error/warning at
 *                     high/medium confidence → converged. Suggestion-tier and
 *                     low-confidence findings still reach the report: logged,
 *                     never chased.
 *
 * Round 1 never terminates here — its actionability is the report's own severity
 * table, not this floor.
 *
 * (Rules 2 and 3 are ordered dry-before-floor, which is the reverse of the
 * upstream statement of the same three rules. The behaviour is identical — zero
 * new findings trivially clears no floor — but the reported `reason` then says
 * which of the two actually happened, which is the diagnosis a churn escalation
 * needs.)
 */
function classifyRound(input) {
  const { round, previous, current, fixDiff, maxRounds } = input || {};
  const n = Number.isFinite(Number(round)) ? Number(round) : 1;
  const cap = Number.isFinite(Number(maxRounds)) ? Number(maxRounds) : MAX_ROUNDS;
  const { new: fresh, carried } = matchCarried(previous, current);
  const actionable = fresh.filter(clearsFloor);
  const blockingNewErrors = actionable.filter(f => String(f.severity || 'error').toLowerCase() === 'error').length;
  const provenance = fixProvenance(fresh, fixDiff);

  let decision = 'continue';
  let reason = 'new-actionable-findings';
  if (n >= cap) {
    decision = 'escalate';
    reason = 'round-cap';
  } else if (n >= 2 && fresh.length === 0) {
    decision = 'converged';
    reason = 'loop-until-dry';
  } else if (n >= 2 && actionable.length === 0) {
    decision = 'converged';
    reason = 'severity-floor';
  }

  return {
    schema: SCHEMA,
    round: n,
    max_rounds: cap,
    decision,
    reason,
    new: fresh.length,
    carried: carried.length,
    actionable_new: actionable.length,
    blocking_new_errors: blockingNewErrors,
    fix_provenance_new: provenance.inside,
    new_findings: fresh,
    carried_findings: carried,
  };
}

// --- CLI shim ----------------------------------------------------------------

function readJson(file) {
  if (!file) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(parsed) ? parsed : parsed.findings || [];
  } catch {
    return [];
  }
}

function readText(file) {
  if (!file) return '';
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) out[argv[i].replace(/^--/, '')] = argv[i + 1];
  return out;
}

function main() {
  const [, , cmd, ...rest] = process.argv;
  if (cmd !== 'round') {
    process.stderr.write(
      'usage: finding-signature.js round --round <n> --current <findings.json> ' +
        '[--previous <findings.json>] [--fix-diff <diff>] [--max-rounds <n>]\n',
    );
    return 1;
  }
  const args = parseArgs(rest);
  if (!args.current) {
    process.stderr.write('finding-signature.js: --current <findings.json> is required\n');
    return 1;
  }
  const out = classifyRound({
    round: args.round,
    previous: readJson(args.previous),
    current: readJson(args.current),
    fixDiff: readText(args['fix-diff']),
    maxRounds: args['max-rounds'],
  });
  process.stdout.write(JSON.stringify(out, null, 2) + '\n');
  return 0;
}

if (require.main === module) process.exit(main());

module.exports = {
  normalizeMessage,
  signature,
  findingKey,
  sameFinding,
  matchCarried,
  clearsFloor,
  diffIntervals,
  fixProvenance,
  classifyRound,
  SCHEMA,
  LINE_TOLERANCE,
  MAX_ROUNDS,
};
