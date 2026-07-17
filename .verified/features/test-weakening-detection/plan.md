# Implementation Plan: test-weakening-detection

## Context

Option C from `discussion.md`: a post-hoc detector, no hook, no sub-phase state machine. The pure
core `analyze(entries)` computes assertion-count deltas over pre-resolved before/after contents
(each `entry = {file, before, after}`, contents or `null`) using the `hooks/lib/lang/*` adapters'
`countAssertions` — so the core needs NO git seam and is trivially unit-testable. The CLI
`scan(baseRef)` owns all IO: git-discover changed files, filter to test files (adapter
`testFileGlobs`), classify A/M/D, resolve `before` (`git show <base>:<path>`) + `after` (fs), and
call `analyze`. The real-git integration test targets the CLI (the finding-injection lesson: a
fake-seam-only suite hides real bugs). `test-review` gains a non-blocking criterion.

## Tasks

### Phase 1: analyze core (pure)

- [x] T001 Write tests for `analyze(entries)` on modified files: a test file with 5 assertions in `before` and 3 in `after` → `flagged` with `before:5, after:3, delta:-2` (AS-1); equal or higher count → not flagged (AS-2); a net-zero change (some assertions lost, others gained) → not flagged (EC-004); an identical-count edit → not flagged (EC-002). Assertion counts come from the ext's `hooks/lib/lang/*` adapter `countAssertions`. (files: `tests/test-weakening.test.cjs`) (test: lib-unit) (scenario: AS-1, AS-2)
- [x] T002 Extract the adapter loader that `test-corpus.js` already has (`loadAdapters` / `adapterByExtension`) into a shared `hooks/lib/lang-loader.js`, re-point `test-corpus.js` to it (no behavior change — its existing tests must still pass), then implement `hooks/lib/test-weakening.js` `analyze(entries)` using it: per entry, `beforeN = countAssertions(before)`, `afterN = after==null ? 0 : countAssertions(after)`, flag when `afterN < beforeN` (files: `hooks/lib/test-weakening.js`, `hooks/lib/lang-loader.js`, `hooks/lib/test-corpus.js`) (depends on T001) (test: lib-unit) (scenario: AS-1, AS-2)
- [x] T003 Write tests for `analyze` deletion + un-analyzable entries: a deleted test (`after: null`) with assertions in `before` → flagged `removed: true, after: 0` (AS-4); a file whose extension has no adapter → `not_analyzed` with reason, never `flagged` (AS-6); a modified file with `before: null` (unreadable base) → `not_analyzed` (EC-001); a deleted file in an unsupported language → `not_analyzed`, not a `removed` flag (EC-005) (files: `tests/test-weakening.test.cjs`) (depends on T002) (test: lib-unit) (scenario: AS-4, AS-6)
- [x] T004 Implement the deletion / `not_analyzed` branches and the versioned contract `test-weakening/v1` = `{schema, flagged: [{file, lang, before, after, delta, removed}], not_analyzed: [{file, reason}], note?}` per T003 (files: `hooks/lib/test-weakening.js`) (depends on T003) (test: lib-unit) (scenario: AS-4, AS-6)

### Phase 2: scan() CLI (real git)

- [x] T005 Write a REAL-git integration test for `scan(baseRef, cwd)` in a throwaway repo: commit a test file with N assertions, then (a) remove one assertion → `scan` flags it; (b) ADD a brand-new test file → not flagged (AS-3, added ≠ weakened); (c) also modify a NON-test production file → it never appears in `flagged` (AS-5); (d) a commit touching no test files → empty `flagged`/`not_analyzed` (EC-003) (files: `tests/test-weakening.test.cjs`) (depends on T004) (test: lib-unit) (scenario: AS-3, AS-5)
- [x] T006 Implement `scan(baseRef, cwd)` + the `scan <base-ref>` CLI: `git diff --name-status <base>` → keep only test files, classifying via the repo's taxonomy `match-paths` (`hooks/lib/taxonomy.js`) when present, else the adapter `testFileGlobs` — matching how `/test-audit` classifies. EXCLUDE added (`A`) files, resolve `before` via `git show <base>:<path>` and `after` via fs (deleted → `after: null`), call `analyze`, print the contract JSON. Exit 0 always (a signal, never a gate) (files: `hooks/lib/test-weakening.js`) (depends on T005) (test: lib-unit) (scenario: AS-3, AS-5)

### Phase 3: test-review criterion + /review wiring (prompt-anchor)

- [x] T007 EXTEND the existing non-blocking lock `tests/test-quality-signals.test.cjs` (the single-source guard that currently covers three signals as non-blocking) to also assert test-weakening is non-blocking — so a future edit to `test-review`'s severity table can't regress THIS signal past the established guard. In the same file, anchor that `agents/test-review.md` carries the test-weakening criterion and `skills/review/SKILL.md` runs `test-weakening.js scan <base>` with the feature's git range (AS-7, SC-005) (files: `tests/test-quality-signals.test.cjs`) (depends on T006) (test: prompt-anchor) (scenario: AS-7)
- [x] T008 Wire the `test-review` non-blocking criterion + the `/review` step that runs `test-weakening.js scan` over the review range, framed strictly non-gating (same lock as Farley/oracle). The criterion text MUST name the known-legitimate causes of a flagged assertion decrease so reviewers don't re-derive them: **assertion consolidation** (table-driven asserts, a single struct/diff comparison) and — for this repo's actor-BDD style — **fixture-chaining that replaces raw asserts with `Sends`/`Receives`**. A decrease is a prompt to look, not a verdict (files: `agents/test-review.md`, `skills/review/SKILL.md`) (depends on T007) (test: prompt-anchor) (scenario: AS-7)

## Task Legend
- `(files: a, b)` = file surface (wave-collision input). `(depends on TXXX)` = ordering.
- `(test: <type>)` = sanctioned type; `(scenario: <id>)` = spec scenario(s) served.

## Waves

`hooks/lib/waves.js` (exit 0, no collisions, `parallel: false`) — sequential test→impl chain,
`Wave N → T0N` for N = 1..8. No parallel waves → parallelization critic not spawned.

## Test Boundaries

`hooks/lib/test-gate.js` (exit 0, not blocked):

| Task | Test type | Scenarios |
|------|-----------|-----------|
| T001 | lib-unit | AS-1, AS-2 |
| T002 | lib-unit | AS-1, AS-2 |
| T003 | lib-unit | AS-4, AS-6 |
| T004 | lib-unit | AS-4, AS-6 |
| T005 | lib-unit | AS-3, AS-5 |
| T006 | lib-unit | AS-3, AS-5 |
| T007 | prompt-anchor | AS-7 |
| T008 | prompt-anchor | AS-7 |

## Verification
- Run `node tests/run.cjs` after all tasks complete.
- Run `/review` for two-stage code review.

## Decisions
- **`analyze` is pure over pre-resolved contents; the CLI owns git+fs IO.** Keeps the delta logic
  unit-testable with zero seam, and confines the real-git interaction to `scan` (covered by one
  real-git integration test — the finding-injection lesson). Not ADR-worthy (a shaping choice).
- **Assertion count is the deterministic proxy for "weakening"** (reuses `hooks/lib/lang/*`); the
  legitimate-update-vs-weakening verdict is a judgment → non-blocking `test-review` `warning`,
  consistent with the locked non-blocking framing (Farley/oracle/unarmored/reflection).
- **Added files are excluded by the CLI** (an added test cannot be a weakening); deletions are
  flagged `removed: true` (a wholesale test removal during a change is the same regression-hiding
  pattern).
- **Shared adapter loader** — `test-corpus.js`'s loader is extracted to `hooks/lib/lang-loader.js`
  and shared (per plan-critic-design), not reimplemented in test-weakening.
- **The non-blocking invariant is single-sourced** — test-weakening's non-blocking framing is locked
  in `tests/test-quality-signals.test.cjs` (extended from three signals to four), not a parallel
  anchor, so the established drift guard stays authoritative.
- **SC-006 (no hook, no sub-phase state machine) is satisfied by omission** — no task creates a
  PreToolUse hook or a sub-phase state file; the Option-A/B machinery is simply not built.
- **Known false positive, named for the reviewer** — legit assertion consolidation (table-driven /
  actor-BDD fixture-chaining) reduces the count while improving the test. The signal is a prompt to
  look, non-blocking; T008's criterion text names this so reviewers don't rediscover it.
