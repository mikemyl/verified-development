# Implementation Summary: Language-Agnostic Core

**Completed:** 2026-06-28
**Tasks:** 14/14
**Version:** 1.8.0 → 1.9.0

## What Was Built

A de-coupling, not an expansion. The plugin's residual language privilege was removed:

1. **Executor de-privileged** (`agents/executor.md`) — the hardcoded `go.mod`/`tsconfig` two-branch detection (which also pointed at a non-existent bare `tdd` skill) is replaced by: load the neutral `testing` skill, then resolve runner/idioms via a priority ladder — `.verified/codebase/TESTING.md` authoritative → infer from existing tests → neutral fallback (EC-002). `tdd-go` kept as the one bundled Go example. The same canonical block is mirrored in `skills/implement/SKILL.md` and `skills/quick/SKILL.md` so the three never drift.
2. **Dangling `tdd` reference eliminated** — all 7 backtick-exact `` `tdd` `` occurrences across 5 files (executor, react-testing ×2, front-end-testing ×2, implement, quick) repointed to the real `testing` skill. `quick/SKILL.md` was missed by the first plan draft and caught by T001's repo-wide scan (added as T014 mid-implement).
3. **`/verify` confirmed stack-neutral** (`skills/verify/SKILL.md`) — detection stated as language-agnostic with explicit priority (`config.json` first → build-file targets; EC-005 multi-manifest never silently defaults to Go); no-command branch routes to `/init` (EC-001) instead of implying failure.
4. **`/init` reframed** (`skills/init-project/SKILL.md`) — neutral `.verified/` + verify-command capture is the default; the Go toolchain scaffold is **kept** but changed from automatic-for-Go to an explicitly-offered example (capability retained, privilege removed).
5. **Docs reframed** — README line 3 (agnostic model), `docs/go-stack.md` (Go as "one example", not "the supported stack"), `docs/configuration.md` (new "Teaching the plugin your stack" section — the per-repo extension point).
6. **ADR 0002** (`.verified/decisions/0002-language-agnostic-executor.md`) — records the branch→inference pivot, rejected alternatives, consequences. Clears the standing ADR debt the critics flagged.
7. **CLAUDE.md** — new "Language-agnostic core (v1.9.0+)" section. Version bumped to 1.9.0.

## Test Coverage
- `tests/language-agnostic-core.test.cjs` — 12 named prompt-anchor/guard entries (one per assertion group): SC-003 dangling-ref scan, SC-004 no-new-per-language-files guard, AS-001 executor + implement neutral, AS-002 Go-kept guards (executor + init), AS-003 referenced-skills-exist, AS-004 verify, AS-005 init, AS-006 docs, AS-007 extension point + CLAUDE, ADR-0002-present.
- Full suite: **218 passed, 0 failed**. Lint: 0 violations. No backtick-`tdd` token remains in `agents/` or `skills/`.
- SC-004 verified from the diff: zero new `*-verified-development`, `tdd-<lang>`, or `docs/<lang>-stack.md` files.

## Decisions Made
- **ADR 0002** written (branch→inference). The `/init` Go-scaffold-opt-in change recorded honestly (earlier draft wrongly claimed "no Go capability removed").

## Notes
- **Plan deviation:** T014 added during implement — T001's repo-wide scan found a 7th bare `tdd` ref in `skills/quick/SKILL.md` that the plan's hand-enumeration missed. The deterministic test caught the gap the plan author didn't.
- **Critic value:** the plan-time acceptance/design critics caught that AS-004 and AS-005 had no real test (impl tasks had been mislabeled as test-bearing); fixed before implement. concerns.md has the full trail.
- **T012 sign-off** (version bump, `none` tier) persisted in `test-signoffs.json` per user approval at plan time.
