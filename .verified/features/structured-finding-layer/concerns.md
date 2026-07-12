# Plan-time concerns — structured-finding-layer

Plan-critic gate output. Critics run: acceptance, design, strategic.
Skipped: ux (no ui-spec.md), parallelization (no parallel waves — plan is fully sequential).

## Findings summary
- **Errors:** 0
- **Warnings:** 7 (all addressed by re-drafting the plan/spec)
- **Suggestions:** 5 (3 folded in, 2 recorded-only)

## Auto-resolved / addressed (warnings)

| # | Critic | Finding | Disposition |
|---|--------|---------|-------------|
| 1 | design | EC-006 self-contradiction: tool-prefixed rule ids make "cross-adapter dedup on identical file:line:rule_id" unreachable. | **Spec fixed.** FR-004 + EC-006 reframed as within-adapter dedup; cross-tool suppression explicitly deferred (needs precedence policy + 2nd adapter). ADR 0003 records it. |
| 2 | design | `findings/v1` is a cross-feature durable contract (2 follow-ups depend on it) but had no ADR, unlike `plan-waves/v1`/`test-gate/v1`. | **ADR 0003 written** (`.verified/decisions/0003-findings-envelope-contract.md`). Referenced from plan Decisions. |
| 3 | design | T008 didn't specify golangci-lint file-vs-package invocation; fixture drift risk. | **T008 clarified**: `run(scope)` invokes golangci-lint at module scope (`run ./...`), not per-file (it's package-aware). T007 fixture records the captured golangci-lint version. |
| 4 | strategic | T009 bundled 6 independent scan() behaviors into one test task (oversized). | **Split** into T009 (discovery: auto-load + language-conditional + mixed-scope) and T011 (degradation matrix). |
| 5 | strategic | T010 mirrored T009's breadth in impl (highest-risk logic in one task). | **Split** into T010 (loader+probing) and T012 (degradation + status + CLI). |
| 6 | acceptance | FR-009 CLI usage-error (exit 1) path untested. | **Added** to T011's test list (missing/invalid scope arg → exit 1). |
| 7 | acceptance | SC-005 "a test proves non-gating" — T013 is a prompt-anchor (asserts SKILL text), weaker than "proves behavior". | **Noted in T013**: non-gating is enforced by FR-009's CLI contract (unit-tested T011/T012); the anchor covers the skill wiring. A skill step can't run a live `/verify` in a unit test — accepted limitation, stated explicitly. |

## Folded-in suggestions

| Critic | Suggestion | Disposition |
|--------|-----------|-------------|
| design | `skipped` entry shape unpinned (part of a versioned contract). | Pinned to `{lang, tool, reason, hint}` in T005 + ADR 0003. |
| design | No mixed supported/unsupported scope test. | Added to T009. |

## Recorded-only (no action)

| Critic | Suggestion | Rationale |
|--------|-----------|-----------|
| acceptance | FR-011/SC-004 (no-deps) has no verification task. | Covered by the repo's existing no-deps convention + code review; a require-scanner test is marginal. |
| strategic | T007 depends on T006 but code-only needs T002 (normalize) — over-strict, forecloses parallelism. | Kept sequential deliberately; a 12→14-task feature doesn't need the wall-clock, and a stricter dep is safe. |
| strategic | `findings.js` will carry two responsibilities (pure envelope + scan orchestration). | Acceptable now; extract `scan()` if the self-heal/second-adapter feature lands on this file later. |

## Critic errors
None — all three critics returned well-formed findings.
