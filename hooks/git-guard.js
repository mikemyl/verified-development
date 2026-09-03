#!/usr/bin/env node
// Verified Development git guard — PreToolUse hook on Bash.
// Denies git commands that can discard uncommitted work while a .verified/ repo
// is being worked on. All logic lives in hooks/lib/git-guard.js; this file is
// the stdin/stdout seam. Any failure here → exit 0 with no output (allow).

const { decide } = require('./lib/git-guard.js');

let input = '';
const stdinTimeout = setTimeout(() => process.exit(0), 3000);
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  clearTimeout(stdinTimeout);
  try {
    const data = JSON.parse(input);
    const r = decide({
      toolName: data.tool_name,
      command: data.tool_input && data.tool_input.command,
      cwd: data.cwd || process.cwd(),
      env: process.env,
    });
    if (r.decision !== 'deny') process.exit(0);
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: r.reason,
      },
    }) + '\n');
    process.exit(0);
  } catch {
    process.exit(0);
  }
});
