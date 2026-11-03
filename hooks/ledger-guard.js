#!/usr/bin/env node
// Verified Development ledger guard — Stop hook.
// Blocks the end of a turn once every review agent of the current /review batch
// has reported but some have no line in the review ledger. Logic lives in
// hooks/lib/ledger-guard.js; this file is the stdin/stdout seam. Any failure
// here → exit 0 with no output (allow).

const fs = require('fs');
const path = require('path');
const { decide } = require('./lib/ledger-guard.js');
const { findGovernedRoot } = require('./lib/git-guard.js');

function read(file) {
  try { return fs.readFileSync(file, 'utf8'); } catch { return ''; }
}

let input = '';
const stdinTimeout = setTimeout(() => process.exit(0), 3000);
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  clearTimeout(stdinTimeout);
  try {
    const data = JSON.parse(input);
    const cwd = data.cwd || process.cwd();
    const root = findGovernedRoot(cwd);
    const r = decide({
      transcript: data.transcript_path ? read(data.transcript_path) : '',
      ledger: root ? read(path.join(root, '.verified', 'review-ledger.jsonl')) : '',
      stopHookActive: data.stop_hook_active === true,
      cwd,
      env: process.env,
    });
    if (r.decision === 'block') process.stdout.write(JSON.stringify({ decision: 'block', reason: r.reason }) + '\n');
    process.exit(0);
  } catch {
    process.exit(0);
  }
});
