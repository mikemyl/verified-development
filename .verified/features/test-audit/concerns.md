# Plan-Time Critic Concerns: test-audit

Evidence the plan-time critic gate ran. Severity policy: `error` → auto-resolved; `warning` → surfaced; `suggestion` → recorded.

## Critics that ran
- `plan-critic-acceptance` — ok (5 findings)
- `plan-critic-design` — ok (10 findings)
- `plan-critic-strategic` — ok (4 findings)
- `plan-critic-parallelization` — ok (2 findings) — spawned because `parallel: true`
- `plan-critic-ux` — skipped (no ui-spec.md)

## Findings summary
- error: 3 · warning: ~9 · suggestion: ~6

## Applied during re-draft
- **[error, design] Plan carried no `(test:)`/`(scenario:)` annotations** → forward gate would MIGRATION_NEEDED-block /implement. This plan postdates v1.7.0, so no exemption. Resolved by: (a) authoring the plugin's own taxonomy at `.verified/codebase/TESTING.md` (`lib-unit` default, `prompt-anchor` exception, `none` sign-off) — the generic seed's `acceptance/dao/unit/none` don't fit a tooling/lib repo; (b) annotating every task with `(test:)`+`(scenario:)`; (c) dogfood-verifying: `test-gate.js` now exits 0 / blocked:false on this plan with T013/T014 signed off (`test-signoffs.json`). **Surfaced** below — it sets repo-wide gate behavior.
- **[error, acceptance] AS-007 (read-only) and AS-011 (gate unaffected) had no test/coverage** → added AS-007 read-only assertion to T009 anchors; added AS-011 identical-output assertion to T002.
- **[warning, design] test-review + test-design-reviewer both compute Farley (double score); "sweep mode" undefined** → deep-dive now uses `test-design-reviewer` ALONE (single Farley + craft verdict); `test-review` (diff-scoped) dropped from the sweep. Recorded as D-e. T011/T009 updated.
- **[warning, design] Go text-parser fragility (braces in string literals/comments/closures) unrecorded** → added D-f ADR candidate + HARD brace-balance fixtures to T004 (string-literal braces, `t.Run` nested func, block-comment braces).
- **[warning, strategic] T006 = 7 mechanisms; brace-balance risk buried** → split into T007 (discovery + brace-balance, the risky piece, validated by T004) and T008 (classify/rank/summary/CLI). Tests split T004 (discovery) / T005 (classification) / T006 (rank+summary+schema).
- **[warning, design] array-vs-scalar field typing in parser undocumented** → T003 uses a declared `ARRAY_FIELDS` constant.
- **[warning, design] test-corpus/v1 schema only in prose** → T008 adds a `SCHEMA` constant + JSDoc typedef; T006 asserts the schema string + top-level keys.
- **[warning, parallelization] T011/T012 consume tdd-go content (T010) but didn't depend on it** → added `depends on T010` to both.
- **[suggestion, design] new `.verified/audits/` dir undocumented** → folded into T013 (CLAUDE.md).
- **[suggestion, design] D-b/D-c not real ADRs** → demoted to inline rationale; D-e/D-f added as ADR candidates.

## Surfaced to user (decisions)
1. **Plugin taxonomy authored** — `.verified/codebase/TESTING.md` now defines this repo's test types/tiers (`lib-unit` default, `prompt-anchor` exception, `none` sign-off). Necessary to make the gate meaningful here, but it sets gate behavior for ALL future plans in this repo. Confirm the types/tiers. — awaiting user
2. **Single Farley source** — deep-dive uses `test-design-reviewer` only (not also `test-review`), to avoid double-scoring. — awaiting user
3. **Scope** — 14 tasks, 3 sub-systems, one feature (strategic critic deemed the coupling defensible: AS-001 needs all three). Flagged, not split. — awaiting user

## Recorded only
- [pushback, design] Critic suggested `path.matchesGlob()` over a custom matcher. Kept custom (D-c): the stdlib API is recent/experimental and the plugin runs under an unknown Node version in users' Claude Code — portability wins.
- [suggestion, strategic] T011 skill orchestration is complex prose locked only by anchors — accepted; anchors assert the contract, not runtime behavior (inherent to skill-as-prompt).
