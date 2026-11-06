#!/usr/bin/env node
'use strict';

/**
 * hooks/ledger-writer.js — Stop hook. Appends one review-ledger/v2 line per
 * finished review-agent dispatch in this session that the repo's ledger does
 * not hold yet. Prints nothing, never blocks, fails open.
 *
 * Scope: only under a `.verified/` directory (same rule as the git guard). Off
 * with `hooks.review_ledger: false` in config.json or VERIFIED_REVIEW_LEDGER=0.
 */

const fs = require('fs');
const path = require('path');
const { findGovernedRoot } = require('./lib/git-guard.js');
const ledger = require('./lib/review-ledger.js');

function optedOut(root) {
  const flag = String(process.env.VERIFIED_REVIEW_LEDGER || '').trim().toLowerCase();
  if (flag === '0' || flag === 'off' || flag === 'false') return true;
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(root, '.verified', 'config.json'), 'utf8'));
    return Boolean(cfg && cfg.hooks && cfg.hooks.review_ledger === false);
  } catch {
    return false;
  }
}

function main() {
  let input;
  try {
    input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
  } catch {
    return;
  }
  const root = findGovernedRoot(input.cwd || process.cwd());
  if (!root || optedOut(root) || !input.transcript_path) return;
  let transcript;
  try {
    transcript = fs.readFileSync(input.transcript_path, 'utf8');
  } catch {
    return;
  }
  if (!transcript.includes('-review')) return;
  const file = path.join(root, ledger.DEFAULT_FILE);
  let current = '';
  try { current = fs.readFileSync(file, 'utf8'); } catch { /* first line */ }
  ledger.append(file, ledger.pending(transcript, current, { readSubagent: ledger.subagentReader(input.transcript_path) }));
}

try {
  main();
} catch {
  /* fail open: a ledger is never worth a broken stop */
}
process.exitCode = 0;
