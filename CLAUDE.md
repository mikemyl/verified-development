# Verified Development Plugin

This is a Claude Code plugin. Changes here affect all projects that install it.

## Development

### Testing Changes

After modifying skills, agents, or hooks:
1. Bump version in `.claude-plugin/plugin.json` AND `.claude-plugin/marketplace.json`
2. Run `claude plugin update verified-development@verified-development` in a target project
3. Start a new Claude Code session to pick up changes

### Reading Conversations from Other Projects

Claude Code stores conversation history as JSONL files. Use this to troubleshoot plugin behavior in other projects:

```bash
# Find recent conversations for a project
ls -lt ~/.claude/projects/-Users-mike-go-src-keros-platform/*.jsonl | head -5

# Parse conversation messages (user + assistant text + tool calls)
python3 -c "
import json
with open('PATH_TO_JSONL') as f:
    lines = f.readlines()
for i, line in enumerate(lines):
    obj = json.loads(line)
    t = obj.get('type', '')
    if t in ('user', 'assistant'):
        msg = obj.get('message', {})
        content = msg.get('content', [])
        if isinstance(content, list):
            for c in content:
                if isinstance(c, dict):
                    if c.get('type') == 'text' and len(c.get('text','')) > 20:
                        print(f'L{i} {t.upper()}: {c[\"text\"][:300]}')
                    elif c.get('type') == 'tool_use':
                        name = c.get('name','')
                        inp = c.get('input', {})
                        if name == 'Skill':
                            print(f'L{i} SKILL: {inp.get(\"skill\",\"?\")}')
                        elif name == 'Agent':
                            print(f'L{i} AGENT: type={inp.get(\"subagent_type\",\"?\")} desc={inp.get(\"description\",\"\")[:80]}')
"
```

**Project path mapping:** Claude Code converts paths to directory names with dashes. `/Users/mike/go/src/keros-platform` becomes `-Users-mike-go-src-keros-platform`.

**What to look for when troubleshooting:**
- Which skills triggered (search for `SKILL:` in output)
- Whether our skills or third-party skills loaded (check the `Base directory` path)
- Whether the workflow was followed (specify → plan → implement → verify → review)
- Whether the LLM prompted to commit before review
- Whether state.md was updated correctly

### Plugin Installation

Plugins from registered marketplaces can auto-load skills even when not in `enabledPlugins`. To fully prevent a plugin's skills from triggering, remove its marketplace:

```bash
# Remove a marketplace (e.g., superpowers)
rm -rf ~/.claude/plugins/marketplaces/superpowers-dev
rm -rf ~/.claude/plugins/cache/claude-plugins-official/superpowers

# Check what marketplaces exist
ls ~/.claude/plugins/marketplaces/
```

### Skill Trigger Behavior

The `description` field in SKILL.md frontmatter controls when Claude auto-loads a skill. Aggressive language ("You MUST use this") triggers more broadly than passive ("Use when the user invokes /command"). Our core skills use aggressive triggers to ensure the workflow is followed.

### Version Bumping

Always bump BOTH files in sync:
- `.claude-plugin/plugin.json`
- `.claude-plugin/marketplace.json`

The plugin cache is version-keyed — same version = no re-install.
