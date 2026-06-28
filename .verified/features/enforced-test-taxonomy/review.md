# Code Review Report

**Feature:** enforced-test-taxonomy
**Date:** 2026-06-28

## Stage 1: Spec Compliance
**Status:** PASS — all 14 scenarios, 16 requirements, 8 edge cases covered; no scope creep; FR-015 prose-enforcement is the one documented, intentional deviation.

## Stage 2: Quality Review

Agents: complexity-review, test-review, dead-code-review, doc-review, domain-review. (Go-specific agents skipped — code is Node/markdown. a11y/security/concurrency N/A.)

### Errors (must fix)
| Agent | Location | Issue | Fix |
|-------|----------|-------|-----|
| domain | test-gate.js DEFAULT_SCENARIO_PATTERN + UNSERVED_SCENARIO | Default pattern matches AS\|S\|SC\|EC\|FR → every FR/EC/SC id treated as a "scenario"; UNSERVED_SCENARIO demands each be served → 46 ids vs 14 real → false blocks on real plans | Narrow default to acceptance-scenario forms (`AS-`/`S`); keep override (D-f). Add regression test. |
| complexity | test-gate.js check() L90-210 | God function: cyclomatic 16 (>10), 121 lines (>80), cognitive ~18 (>15). Six responsibilities in one fn | Extract validateTaxonomy / validateTasks / validateScenarioCoverage; check() orchestrates. Behavior-preserving; 16 gate tests cover it. |
| domain | test-gate.js L171 ('none' literal) | Traceability exemption hardcodes type name `none`; under D-c a repo may rename its non-behavioral type and silently lose the exemption | Exempt by a taxonomy property (boundary empty/`—`) in addition to `none`. Add test for a renamed exempt type. |
| doc | waves.js header L14-17, L29 | Module header grammar examples + task-contract line omit the new `(test:)`/`(scenario:)` trailers and `test_type`/`scenarios` fields (the @typedef is correct; the header is stale) | Add the trailers to the grammar examples and the two fields to the contract line. |

### Warnings (should fix)
| Agent | Location | Issue | Fix |
|-------|----------|-------|-----|
| doc | CLAUDE.md | Every prior major feature has a CLAUDE.md section; this one has none | Add `### Enforced test taxonomy (v1.7.0+)` covering grammar, gate CLI/exit codes, test-signoffs.json, taxonomy resolution. |
| test | test-gate.test.cjs | 3 untested branches: string-form scenarioPattern, non-global RegExp normalization, mixed-annotation plan (some tasks typed, some not) | Add the three cases. |
| test | test-taxonomy-docs.test.cjs L81,L86 | Weak anchors: bare `WARN`/`sanctioned` (appear many times for unrelated reasons) — near-zero regression protection | Anchor on specific phrases tied to the invariant. |
| doc | skills/plan SKILL.md exit-0 | Exit 0 can still carry DIAGRAM_MISSING warnings; skill silently discards them | Note: surface warning-severity findings alongside the Test Boundaries table. |

### Suggestions (recorded, mostly deferred)
| Agent | Issue | Disposition |
|-------|-------|-------------|
| domain | Finding-code naming inconsistent (state-first vs subject-first) | DEFER — cosmetic; renaming ripples into skill prose that references codes. Note only. |
| domain | "boundary" (marquee concept) vs "test type" (what tasks declare); `## Test Boundaries` table has no boundary column | DEFER — "test boundary" is the user's chosen framing; table columns are correct. Note only. |
| test | CLI exit-1 and taxonomy.js CLI shim untested | FIX if cheap (fold into test executor). |
| test | AS-006 / CLI tests bundle multiple assertions | DEFER — acceptable granularity. |

## Summary
- Errors: 4 (block merge) — 1 correctness (scenario pattern), 1 complexity threshold, 1 design-robustness, 1 doc-staleness
- Warnings: 4
- Suggestions: 5 (2 folded into fixes, 3 deferred/noted)
- Agents run: complexity, test, dead-code, doc, domain
- Dead-code: PASS (all exports consumed)
- **Farley Score: 8.3/10 (Excellent)** — non-blocking. Weakest: Maintainable (7, prompt-anchor brittleness), Granular (7).

## Correction Loop (iteration 1 — all resolved)
- **Scenario pattern (error):** narrowed `DEFAULT_SCENARIO_PATTERN` to `/\b(?:AS|S)-?\d+\b/g`; FR/EC/SC no longer treated as scenarios. Smoke on our own spec: false `UNSERVED` 44 → 12 (only real `AS-` scenarios). Regression test added.
- **Complexity (error):** `check()` split into `validateTaxonomy` / `validateTasks` / `validateScenarioCoverage`; body 121 → 41 lines. 16 gate tests pass unchanged.
- **none-exemption (error):** traceability exemption now also keys off boundary `—`/`-`/`n/a`/empty, not just the literal `none` (honors D-c repo-rename). Test added.
- **waves.js header (error):** grammar examples + contract line now include `(test:)`/`(scenario:)` and `test_type`/`scenarios`.
- **CLAUDE.md (warning):** added `### Enforced test taxonomy (v1.7.0+)` section.
- **Missing branches (warning):** tests added for string-form pattern, non-global RegExp, mixed-annotation plan, CLI exit-1; + taxonomy.js CLI smoke.
- **Weak anchors (warning):** strengthened to specific phrases (`sanctioned test type` + non-blocking semantics) in both reviewer files.
- **plan exit-0 (warning):** /plan now surfaces warning-severity (e.g. DIAGRAM_MISSING) findings alongside the table.

**Deferred (recorded, not fixed):** finding-code naming consistency; "boundary" vs "test type" marquee naming. Both cosmetic; tracked here for a future pass.

**Post-fix gate:** 133 tests passing, 0 failing; 0 lint violations.
**Verdict:** PASS — clear to merge after human review.
