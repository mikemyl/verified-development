# Plan-time concerns — test-weakening-detection

Plan-critic gate. Critics run: acceptance, design, strategic (all three first died on transient
API/SSL errors; re-dispatched successfully). Skipped: ux (no ui-spec), parallelization (sequential).

## Findings summary
- **Errors:** 0
- **Warnings:** 3 (all addressed)
- **Suggestions:** 6 (2 folded in, 4 recorded-only)

## Addressed (warnings)

| # | Critic | Finding | Disposition |
|---|--------|---------|-------------|
| 1 | acceptance | FR-001 described `analyze(changedTestFiles, gitShow)` but the plan builds `analyze(entries)` (pure, CLI owns IO) — spec never updated to match. | **Spec fixed** (FR-001 + FR-006 now describe the entries shape + CLI-owns-IO). |
| 2 | design | The adapter loader already exists in `test-corpus.js`; T002 as worded reimplements it. | **Extract** `hooks/lib/lang-loader.js`, re-point `test-corpus.js`, reuse it (T002). |
| 3 | design | test-weakening's non-blocking framing was anchored in a NEW file, not the single-source lock `tests/test-quality-signals.test.cjs` — a future severity-table edit could regress it past the guard. | **T007 extends** the existing lock (three signals → four). |

## Folded-in suggestions
- design: assertion-count is coarse; the dominant false positive is **legit consolidation**
  (table-driven / actor-BDD fixture-chaining). **T008 criterion text names it** so reviewers don't
  rediscover it. (High value for this repo's actor-BDD style.)
- acceptance: T006's scenario tag was missing AS-3 → **added**.

## Recorded-only (no action)
- design: full taxonomy `match-paths` classification parity with `/test-audit` — T006 now uses
  taxonomy match-paths when present (partially adopted); exhaustive parity assertion deferred.
- acceptance: SC-006 is a negative criterion with no explicit assertion → **noted in Decisions**
  (satisfied by omission; no task creates a hook/state-machine file).
- strategic: T005 bundles four real-git sub-cases — kept as one task with independent
  throwaway-repo sub-blocks (splitting doubles repo-setup cost for a suggestion).
- strategic: file concentration / no parallelism — correct shape for a single-lib feature.

## Critic errors
First dispatch: all three failed on transient connection/SSL errors (not plan issues). Re-dispatched;
all three returned well-formed findings on retry.
