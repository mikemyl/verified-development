# Process Retro — structured-finding-layer

## What worked
- The full workflow earned its cost on contract code. The plan-critic gate caught a real spec
  contradiction (EC-006 cross-adapter dedup unreachable with tool-prefixed ids) and a missing
  cross-feature ADR before implementation. Stage-2 test-review caught the highest-value gap (the
  `go.js run()` shell-out seam had zero real coverage).
- The pure-parser / injectable-seam split (normalize pure; `run(cwd, spawn)`) made every branch
  unit-testable model-free — the correction-loop fix was trivial because the seam was already there.
- Self-declared `scope:` dispatch worked: the Go-scoped review agents self-excluded on a no-`.go`
  diff, and `review-integrity`'s falsifiability rule took effect via file reference (security agent
  cited it) even though the agent's own prompt was cached.

## What didn't
- **The in-vivo plugin-cache lag bit exactly where predicted.** The running session had the plugin
  at v1.11.0, so the new `correctness-review` agent could not be spawned (had to apply its lens
  manually) and the criteria-9/10/11 additions to `test-review` weren't in its live prompt. Six
  features were built and reviewed against frozen agent definitions.
- Direct implementation (not the executor fan-out) means the plugin's flagship `/implement` executor
  pattern still hasn't been dogfooded this session.

## Workflow tuning signals
- Consider a workflow note: when a feature *adds or edits an agent/skill*, its own `/review` cannot
  fully exercise that change in the same session — flag this explicitly at review time and recommend
  a post-merge `claude plugin update` + fresh-session re-review for agent/prompt changes.
- The `/review` skill's Stage-2 table is now stale vs. the self-declared `scope:` dispatch (Feature
  2 replaced it). It still renders the old table as documentation — harmless, but a future reader
  might trust the table over the frontmatter. Minor.

## Top process learning
A feature that modifies the plugin's own agents/skills cannot be fully validated by the same
session's `/review` — the agent registry is frozen at the installed version; agent/prompt changes
need a plugin-update + fresh-session re-review to exercise live.
