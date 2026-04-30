#!/usr/bin/env node
// Verified Development Context Monitor
// PostToolUse hook that warns when context window is running low.
// Reads bridge file written by the statusline hook.

const fs = require('fs');
const path = require('path');
const os = require('os');

let input = '';
const stdinTimeout = setTimeout(() => process.exit(0), 3000);
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  clearTimeout(stdinTimeout);
  try {
    const data = JSON.parse(input);
    const session = data.session_id || '';
    if (!session) { process.exit(0); }

    // session_id is used to construct a /tmp path. Reject path-traversal
    // sequences to prevent escaping the temp directory.
    if (/[/\\]|\.\./.test(session)) { process.exit(0); }

    const remaining = data.context_window?.remaining_percentage;
    if (remaining == null) { process.exit(0); }

    // Normalize to usable context (83.5% is max usable)
    const AUTO_COMPACT_BUFFER_PCT = 16.5;
    const usableRemaining = Math.max(0, ((remaining - AUTO_COMPACT_BUFFER_PCT) / (100 - AUTO_COMPACT_BUFFER_PCT)) * 100);
    const used = Math.max(0, Math.min(100, Math.round(100 - usableRemaining)));

    // Debounce: only warn every 5 tool uses
    const stateFile = path.join(os.tmpdir(), `vd-ctx-${session}.json`);
    let state = { lastWarnAt: 0, severity: 'none' };
    try { state = JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch (e) {}

    const toolUseCount = (state.toolUseCount || 0) + 1;
    const lastSeverity = state.severity || 'none';

    let severity = 'none';
    let message = '';

    // If a verified-development feature is mid-flight, prefer /pause —
    // it captures plan-task progress to handoff.json so the next session
    // can /continue in the right place. /session-report is for session-wide
    // narrative, /pause is for in-flight work.
    const cwd = data.cwd || process.cwd();
    let inFlight = false;
    try {
      const stateMd = fs.readFileSync(path.join(cwd, '.verified', 'state.md'), 'utf8');
      const featureMatch = stateMd.match(/^feature:\s*(.+)$/m);
      const feature = featureMatch ? featureMatch[1].replace(/^["']|["']$/g, '').trim() : '';
      inFlight = feature && feature !== 'none';
    } catch (e) { /* no state.md, no in-flight feature */ }

    const pauseHint = inFlight
      ? ' Run /pause to capture plan-task progress before context exhausts; /continue picks up from there.'
      : ' Consider /session-report to capture progress before starting a fresh session.';

    if (used >= 80) {
      severity = 'critical';
      message = 'Context nearly exhausted (' + used + '% used).' + pauseHint;
    } else if (used >= 65) {
      severity = 'warning';
      message = 'Context window filling up (' + used + '% used). Avoid starting new complex work.' + (inFlight ? ' /pause is available if you need to stop here.' : '');
    }

    // Write state
    fs.writeFileSync(stateFile, JSON.stringify({
      toolUseCount,
      severity,
      lastWarnAt: severity !== 'none' ? toolUseCount : state.lastWarnAt
    }));

    // Debounce: warn every 5 tool uses, or immediately on severity escalation
    const shouldWarn = severity !== 'none' && (
      (toolUseCount - (state.lastWarnAt || 0)) >= 5 ||
      (severity === 'critical' && lastSeverity !== 'critical')
    );

    if (shouldWarn) {
      // Claude Code requires the hookSpecificOutput envelope; bare
      // {additionalContext} is silently dropped.
      // https://code.claude.com/docs/en/hooks.md
      const output = JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PostToolUse',
          additionalContext: message,
        },
      });
      process.stdout.write(output);
    }
  } catch (e) {
    // Silent fail
  }
});
