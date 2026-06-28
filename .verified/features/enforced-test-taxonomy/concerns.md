# Plan-Time Critic Concerns: enforced-test-taxonomy

Evidence that the plan-time critic gate ran. Severity policy: `error` → auto-resolved by re-drafting; `warning` → surfaced to user; `suggestion` → recorded only.

## Critics that ran
- `plan-critic-acceptance` — ok (5 findings)
- `plan-critic-design` — ok (8 findings)
- `plan-critic-strategic` — ok (6 findings)
- `plan-critic-parallelization` — ok (3 findings) — spawned because `parallel: true`
- `plan-critic-ux` — skipped (no ui-spec.md)

## Findings summary
- error: 0
- warning: 10
- suggestion: 9

No `error`-severity findings: the plan was structurally sound (no missing spec coverage, no cycles). Several `warning`s were clearly correct and applied during re-draft rather than deferred.

## Applied during re-draft (clearly-correct warnings + cheap suggestions)
- **Missing deps T013/T014 → T003, T007** (strategic + parallelization, both): `/map` and `/init` wiring referenced a taxonomy format and CLI contract not yet defined. Added `depends on T003` (parser format) and constrained the wiring to structure-preserving content adaptation. Recomputed waves: T013/T014 now Wave 4 (after T003).
- **Sign-off persistence contract** (design + strategic): the gate is a stateless CLI; nothing said where approvals persist between runs/sessions. Introduced `test-signoffs.json` (machine-readable) as D-e; `/plan` reads it, passes `--approved`, writes new approvals; `concerns.md` stays critic-only. Wired into T011/T012 and recorded as ADR (T017).
- **Hardcoded `AS-\d+` scenario regex** (design): would break on repos using `S001`/`SC-01`. Made the scenario-id pattern configurable (`workflows.scenario_id_pattern`), default tolerant; documented as a contract (D-f). Added a non-`AS-` id test case to T007.
- **Shared task-object contract** (design): `test-gate.js` calling `waves.parsePlan` as a black box couples the libs silently. T005 now publishes a JSDoc `@typedef Task`; T008 consumes the documented shape.
- **Oversized tasks** (strategic): split the gate test into T006 (blocking) / T007 (passing+edge+propagation); split anchor tests into T009 (gate-wiring) / T010 (doc-framing, separate file to avoid collision).
- **EC-003/EC-004 propagation untested** (acceptance): added defect→finding (exit 3) and prose-without-diagram→warning cases to T007.
- **ADRs** (design): promoted D-b (seed dual-role) and D-c (repo-authoritative) plus D-e/D-f to a real ADR task (T017).
- **Trivia** (acceptance): added coverage tags to impl tasks; T018 marked infra; T002's first assertion validates the seed before parser logic.

## Surfaced to user (warnings carrying a real decision)
1. **(design, warning) Seed `.md` location** — RESOLVED. User expected a top-level inspectable taxonomy; clarified that the inspectable artifact is the per-repo `.verified/codebase/TESTING.md` `## Test Types` (written by `/map`), while `hooks/lib/test-types-seed.md` is plugin-internal plumbing the user never reads. Seed KEPT in `hooks/lib/` (co-located with `taxonomy.js`). No link from repo TESTING.md to the plugin cache (would break on plugin update and show the generic seed, not the repo's adapted types).
2. **(design, warning) FR-015 enforcement level** — RESOLVED. Accepted as prose-enforced (seed + `/map`), not gate-checked.
3. **(acceptance/design, warning) Scenario-id default pattern** — RESOLVED. Tolerant default confirmed, configurable via `workflows.scenario_id_pattern`.

## Recorded only (suggestions, not shown)
- T009/T010 (now T011/T012) prose-divergence risk for gate error wording — mitigated by the fixed CLI contract; executors should mirror phrasing.
- T015 (now T018) orphan-task flag — annotated as infra.
- Seed validated first in T002 — applied.
- T007 impl size contingent on T006 split — addressed via test split; impl kept single (T008) deliberately.
