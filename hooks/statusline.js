#!/usr/bin/env node
// Verified Development Statusline
// Shows: model | feature/phase | directory | context usage

const fs = require('fs');
const path = require('path');

let input = '';
const stdinTimeout = setTimeout(() => process.exit(0), 3000);
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  clearTimeout(stdinTimeout);
  try {
    const data = JSON.parse(input);
    const model = data.model?.display_name || 'Claude';
    const dir = data.workspace?.current_dir || process.cwd();
    const remaining = data.context_window?.remaining_percentage;

    // Context window display (shows USED percentage scaled to usable context)
    // Claude Code reserves ~16.5% for autocompact buffer, so usable context
    // is 83.5% of the total window. Normalize to show 100% at that point.
    const AUTO_COMPACT_BUFFER_PCT = 16.5;
    let ctx = '';
    if (remaining != null) {
      const usableRemaining = Math.max(0, ((remaining - AUTO_COMPACT_BUFFER_PCT) / (100 - AUTO_COMPACT_BUFFER_PCT)) * 100);
      const used = Math.max(0, Math.min(100, Math.round(100 - usableRemaining)));

      const filled = Math.floor(used / 10);
      const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);

      if (used < 50) {
        ctx = ` \x1b[32m${bar} ${used}%\x1b[0m`;
      } else if (used < 65) {
        ctx = ` \x1b[33m${bar} ${used}%\x1b[0m`;
      } else if (used < 80) {
        ctx = ` \x1b[38;5;208m${bar} ${used}%\x1b[0m`;
      } else {
        ctx = ` \x1b[5;31m${bar} ${used}%\x1b[0m`;
      }
    }

    // Verified development state (feature + phase + active/next signals)
    //
    // Three "scenes" in priority order:
    //   1. active_phase set    → render phase in highlight colour ("in flight")
    //   2. next_action set     → render phase dim + show ↪<next_action>
    //   3. plain feature:phase → legacy idle state
    //
    // active_phase is populated only while a phase skill is mid-execution.
    // next_action is populated at phase boundaries.
    const unquote = s => (s ?? '').replace(/^["']|["']$/g, '').trim();
    let vd = '';
    const statePath = path.join(dir, '.verified', 'state.md');
    if (fs.existsSync(statePath)) {
      try {
        const content = fs.readFileSync(statePath, 'utf-8');
        const feature = unquote(content.match(/^feature:\s*(.+)$/m)?.[1]);
        const phase = unquote(content.match(/^phase:\s*(.+)$/m)?.[1]);
        const activePhase = unquote(content.match(/^active_phase:\s*(.+)$/m)?.[1]);
        const nextAction = unquote(content.match(/^next_action:\s*(.+)$/m)?.[1]);

        if (feature && feature !== 'none') {
          const phaseShort = {
            'specify': 'spec',
            'ui-spec': 'ui',
            'plan': 'plan',
            'implement': 'impl',
            'verify': 'vfy',
            'review': 'rev',
            'quick': 'quick',
          };
          const renderPhase = phaseShort[activePhase] || phaseShort[phase] || phase || '';
          // Bright magenta when in flight, dim grey otherwise.
          const phaseColor = activePhase ? '\x1b[35m' : '\x1b[2m';
          vd = ` │ \x1b[36m${feature}\x1b[0m${phaseColor}:${renderPhase}\x1b[0m`;
          if (nextAction && !activePhase) {
            // Idle with a next action — show the suggestion.
            vd += `\x1b[2m ↪${nextAction}\x1b[0m`;
          }
        }
      } catch (e) {}
    }

    const dirname = path.basename(dir);
    process.stdout.write(`\x1b[2m${model}\x1b[0m │ \x1b[2m${dirname}\x1b[0m${vd}${ctx}`);
  } catch (e) {
    // Silent fail
  }
});
