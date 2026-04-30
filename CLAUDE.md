# Verified Development Plugin

This is a Claude Code plugin. Changes here affect all projects that install it.

## Workflow features

### Interruptible workflow (v1.2.0+)

Every phase skill is interruptible at any tool-use boundary.

- **`.verified/features/<feature>/handoff.json`** — schema-versioned (v1) machine-readable record of where the phase is. Required fields: `feature`, `phase`, `completed_tasks`, `remaining_tasks`, `git_head`, `timestamp`. Optional: `blockers` (with `severity: blocking|advisory`), `decisions_made`, `reason`. Schema at `hooks/schemas/handoff.schema.json`; helper at `hooks/lib/handoff.js` (atomic writes, validation).
- **`.verified/features/<feature>/continue-here.md`** — narrative companion. If JSON and MD disagree, trust the JSON.
- **`/pause`** captures handoff + continue-here, then ends the turn. Standalone skill — clear trigger.
- **`/resume`** reads handoff + state, briefs the user, recommends the next action. Refuses if any `blockers[].severity == "blocking"`.
- **`state.md` schema v2** — adds `active_phase` (set while a phase is mid-execution), `next_action` (slash command or recommendation), `next_phases` (branch options). Lazy upgrade: legacy v1 files are read without error and bumped on next write.
- **Statusline** distinguishes scenes: in-flight (magenta `:phase`), idle-with-next-action (`↪/cmd`), legacy idle.

### Adversarial critique (v1.3.0+)

Two stress-test gates inside the workflow.

- **Spec-time challenge (in `/specify`)** — Socratic Q&A interrogating the *problem* before `spec.md` is written. Six categories: ambiguity, surface area, alternatives, edge cases, dependencies, out-of-scope. Max 8 questions, one at a time. Audit trail at `.verified/features/<feature>/discussion.md` (preserves rejected options, not just chosen). Opt out with `--no-challenge` or `.verified/config.json` `workflows.challenge: false`.
- **Plan-time critics (in `/plan`)** — four agents (`plan-critic-acceptance`, `plan-critic-design`, `plan-critic-strategic`, plus `plan-critic-ux` only when `ui-spec.md` exists) dispatched in parallel before user approval. Severity policy: `error` auto-fixes the plan, `warning` surfaces to user (max 10 visible), `suggestion` is recorded only. Audit trail at `.verified/features/<feature>/concerns.md`. Opt out with `--no-critics` or `workflows.plan_critics: false`.

The four critics share a finding schema (`{critic, severity, description, tied_to, recommendation?}`) and the same severity rubric — defined once in `skills/specify/references/challenge.md` and re-used verbatim in each critic agent. If you change the rubric, update all five files (`tests/adversarial-critique.test.cjs` will catch drift).

### Hook output envelopes

Claude Code requires the `hookSpecificOutput` envelope for `additionalContext`. Bare `{"additionalContext": "..."}` is silently dropped. All our hooks (`session-start.sh`, `context-monitor.js`) emit:

```json
{"hookSpecificOutput": {"hookEventName": "PostToolUse|SessionStart", "additionalContext": "..."}}
```

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

### Tests

Plain Node test runner at `tests/run.cjs`. Each `*.test.cjs` exports `[{name, fn}]`. No npm dependencies. Run with `node tests/run.cjs`. CI runs both `node scripts/lint-descriptions.cjs` and the test runner via `.github/workflows/lint.yml`.

### Skill description budget

Hard cap of 100 chars per `description:` field, enforced by `scripts/lint-descriptions.cjs`. Anti-patterns to avoid: "Triggers:" keyword stuffing, flag enumerations (move to `argument-hint`), multi-sentence prose. Aggressive imperative language ("Required before…", "You MUST use this…") still fits within the budget.
