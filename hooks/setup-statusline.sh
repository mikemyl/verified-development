#!/bin/bash
# Copies statusline.js to a stable path and registers it in settings.json.
# Runs via the plugin's Setup hook (fires when plugin is first enabled).

CLAUDE_DIR="${HOME}/.claude"
HOOKS_DIR="${CLAUDE_DIR}/hooks"
SETTINGS="${CLAUDE_DIR}/settings.json"
STATUSLINE_SRC="${CLAUDE_PLUGIN_ROOT}/hooks/statusline.js"
STATUSLINE_DEST="${HOOKS_DIR}/vd-statusline.js"

# Create hooks directory
mkdir -p "$HOOKS_DIR"

# Copy statusline to stable path
if [ -f "$STATUSLINE_SRC" ]; then
  cp "$STATUSLINE_SRC" "$STATUSLINE_DEST"
fi

# Register in settings.json if not already present
if [ -f "$SETTINGS" ] && command -v node >/dev/null 2>&1; then
  node -e "
    const fs = require('fs');
    const p = '$SETTINGS';
    const s = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (!s.statusLine || !s.statusLine.command || !s.statusLine.command.includes('vd-statusline')) {
      s.statusLine = { type: 'command', command: 'node ~/.claude/hooks/vd-statusline.js' };
      fs.writeFileSync(p, JSON.stringify(s, null, 2) + '\n');
    }
  " 2>/dev/null
fi
