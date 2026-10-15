# Verified Development Plugin

This is a Claude Code plugin. Changes here affect all projects that install it.

## What v2 is

Three commands and the libs that feed them. `/review` (independent review before commit), `/plan`
(a chat plan stress-tested by three critics), `/map` (the repo's test taxonomy). The design record
for the cut from v1 is the README's "Why v2 is smaller" section and `tests/review-v2.test.cjs`'s
header; the v1 feature history is in git (`git log v1.24.0`).

Doctrine that survived, in one line each:

- **Independent review is the value.** The agents found the would-ship defects; the gates did not.
  Keep them, measure them (`hooks/lib/review-ledger.js`), size-gate the ones that return nothing.
- **A script makes the mechanical decision, the model makes the judgment.** Panel resolution
  (`review-scope.js`), round termination (`finding-signature.js`), assertion deltas
  (`test-weakening.js`), the taxonomy (`taxonomy.js`) are model-free and unit-tested.
- **Language-agnostic core.** No bundled toolchain beyond the `tdd-go` example; the repo's
  `TESTING.md` and verify command teach the plugin its stack.
- **Blocking is narrow.** Only mechanical, no-judgment findings are `error`: the three must-not-ship
  test anti-patterns (`skills/testing/SKILL.md`), falsifiable correctness/security errors. Farley,
  taxonomy fit, oracle provenance, weakening, contract doubles stay non-blocking (locked by
  `tests/farley-score.test.cjs`, `tests/test-quality-signals.test.cjs`).
- **No artifact the model writes and only the model reads.** The ledger is the one file `/review`
  writes; `/plan` writes none; `/map` writes the rubric.
- **Never a git command that can discard uncommitted work.** `hooks/git-guard.js` denies the class;
  `checkpoint.js` is the restore path.

## Surface

`tests/v2-surface.test.cjs` pins the shipped skills, agents, libs and hook files and fails on any
reference to a cut piece. Add to its lists when you add a file; do not weaken the dangling-reference
guard.

## Hook output envelopes

Claude Code requires the `hookSpecificOutput` envelope for `additionalContext`. Bare
`{"additionalContext": "..."}` is silently dropped. `context-monitor.js` emits:

```json
{"hookSpecificOutput": {"hookEventName": "PostToolUse", "additionalContext": "..."}}
```

## Development

### Testing changes

After modifying skills, agents, or hooks:
1. Bump version in `.claude-plugin/plugin.json` AND `.claude-plugin/marketplace.json`
2. Run `claude plugin update verified-development@verified-development` in a target project
3. Start a new Claude Code session to pick up changes

### Reading conversations from other projects

Claude Code stores conversation history as JSONL under `~/.claude/projects/<dashed-path>/`
(`/Users/mike/go/src/keros-platform` → `-Users-mike-go-src-keros-platform`). Subagent transcripts
sit next to each session under `<session-id>/subagents/agent-*.jsonl`. Two scripts from the v2
assessment compute per-session tokens, skills, agents and per-agent sub-agent cost; recreate them
from `tests/review-v2.test.cjs`'s numbers if needed. The `usage` block on each assistant line has
`input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`.

### Skill trigger behavior

The `description` field in SKILL.md frontmatter controls auto-loading. Aggressive language triggers
more broadly; `/review`'s says "Required for non-trivial changes" and the project-rules template
says it again in `CLAUDE.md` — on measured sessions the `CLAUDE.md` rule was what made the agents
run (168 dispatches with no skill loaded at all).

### Version bumping

Always bump BOTH files in sync: `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`.
The plugin cache is version-keyed — same version = no re-install.

### Tests

Plain Node test runner at `tests/run.cjs`. Each `*.test.cjs` exports `[{name, fn}]`. No npm
dependencies. Run with `node tests/run.cjs`. CI runs `node scripts/lint-descriptions.cjs` and the
runner via `.github/workflows/lint.yml`. Libs with an external seam (git, a CLI) get a direct
subprocess test, not only a unit test.

### Skill description budget

Hard cap of 100 chars per `description:` field, enforced by `scripts/lint-descriptions.cjs`.
