# Implementation Summary: Enforced Test Taxonomy

**Completed:** 2026-06-28
**Tasks:** 18/18
**Version:** 1.6.0 → 1.7.0

## What Was Built

Three new/extended deterministic libs (zero-dep Node, one-concern-per-lib):
- `hooks/lib/test-types-seed.md` — shipped seed taxonomy (4 types: acceptance/dao/unit/none) with per-type boundary, pattern, location, tier, when-to-use, named primitives, and a Mermaid harness diagram. Single source of truth: gate fallback + scaffold template.
- `hooks/lib/waves.js` (extended) — parses `(test: <type>)` and `(scenario: <id…>)` task trailers; publishes a JSDoc `@typedef Task` as the shared contract. Wave math untouched.
- `hooks/lib/taxonomy.js` (new) — `parseTaxonomy` / `loadSeed` / `resolve`; repo-taxonomy-else-seed, authoritative-not-merged; reports defects and `has_diagram`.
- `hooks/lib/test-gate.js` (new) — `check()` + CLI emitting `test-gate/v1`. Finding codes: MISSING_TEST_TYPE, UNKNOWN_TEST_TYPE, SIGNOFF_REQUIRED, UNTRACEABLE_TASK, DANGLING_SCENARIO, UNSERVED_SCENARIO, TAXONOMY_DEFECT, DIAGRAM_MISSING (warning), MIGRATION_NEEDED. Exit 0 ok · 1 usage · 2 blocked · 3 malformed taxonomy.

Skill/agent wiring:
- `/plan` — step 8a-bis runs the gate, refuses to present on block, renders a `## Test Boundaries` table, prompts + persists sign-offs to `test-signoffs.json`.
- `/implement` — re-runs the gate pre-dispatch; surfaces MIGRATION_NEEDED → /update-plan for legacy plans.
- `/map` + `/init-project` — emit/scaffold the `## Test Types` section (seed-sourced, Mermaid, parse-compatible).
- `tdd-go` + `testing` — coverage reframed as a consequence; per-error-path mandate removed → provoke errors through a sanctioned boundary.
- `test-review` + `test-design-reviewer` — taxonomy/quality mismatch is WARN-only, never gates.

ADR: `.verified/decisions/0001-test-taxonomy-design.md` (D-a..D-f + EC-007 residual risk + FR-015 prose-enforced).

## Test Coverage
- 124 tests passing, 0 failing; 0 description-lint violations.
- New suites: `tests/taxonomy.test.cjs` (7), `tests/test-gate.test.cjs` (16: blocking + passing/edge + CLI exit codes), `tests/test-taxonomy.test.cjs` + `tests/test-taxonomy-docs.test.cjs` (prompt anchors). Extended `tests/waves.test.cjs` (grammar).
- Strict TDD throughout: every lib RED before GREEN; every doc edit locked by a prompt-anchor test written first.

## Decisions Made
- ADR 0001 captures all six cross-cutting decisions. No new LLM critic — blocks are deterministic exit codes.

## Notes
- This feature's own `plan.md` predates the grammar it introduces, so it does not pass the new gate (expected bootstrapping; not a regression).
- Minor: `hooks/lib/handoff.js` blocks reading stdin for `clear`/`update` — invoke with `< /dev/null`. Pre-existing, unrelated to this feature.
