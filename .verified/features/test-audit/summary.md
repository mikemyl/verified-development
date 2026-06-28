# Implementation Summary: Test Audit

**Completed:** 2026-06-28
**Tasks:** 14/14
**Version:** 1.7.0 → 1.8.0

## What Was Built

Three sub-systems for retroactively triaging an existing test corpus against the repo taxonomy:

1. **Taxonomy schema extension** (`hooks/lib/taxonomy.js`, `hooks/lib/test-types-seed.md`) — five OPTIONAL per-type fields: `match-paths`/`match-markers` (classification signals), `good-example`/`bad-example`/`anti-patterns` (craft rubric). An `ARRAY_FIELDS` constant drives comma-split; `—`/`n/a` sentinels coerce to empty. Excluded from `REQUIRED_FIELDS` → forward gate unaffected (AS-011 verified).
2. **Deterministic corpus lib** (`hooks/lib/test-corpus.js`, `test-corpus/v1`) — `discover` (Go `TestXxx` via a brace-balance scanner that ignores braces in string/rune literals + comments, no Go toolchain), `classify` (glob `match-paths` + `match-markers` in body, deterministic tie-break, ambiguity flag), `analyze` (smell ranking worst-first + summary + scope derivation), and a `scan <path> --testing <…>` CLI. Model-free.
3. **The `/test-audit` command** (`skills/test-audit/SKILL.md`) — requires a repo `## Test Types` (refuse → `/map`), runs the lib, deep-dives the worst top-N via `test-design-reviewer` against each test's type rubric, writes `.verified/audits/<scope>-tests.md` ranked worst-first with the count not deep-reviewed. Read-only, advisory.

Plus: the six actor-BDD craft rules single-sourced in `skills/tdd-go/SKILL.md` (drift-guarded); `/map` populates the new fields; docs in README/`docs/test-taxonomy.md`/CLAUDE.md.

## Test Coverage
- 162 tests passing, 0 failing; 0 lint violations; waves exit 0.
- New: `tests/test-corpus.test.cjs` (19: discovery incl. 3 brace-balance edge cases, classification, analyze), `tests/test-audit.test.cjs` (anchors + single-source drift guard). Extended `tests/taxonomy.test.cjs` (optional fields, sentinel coercion, AS-011).
- Strict TDD throughout; discovery (brace-parser) split from classify/rank to de-risk the hardest piece (per strategic critic).

## Decisions Made
- ADR candidates D-a (deterministic lib + LLM-in-skill split), D-e (single Farley source — `test-design-reviewer` only), D-f (Go-as-text parsing, fragility budget covered by fixtures). Inline: D-b/D-c/D-d. To be promoted to an ADR file (deferred — none created yet).

## Notes
- **Dogfood:** this plan carried `(test:)`/`(scenario:)` trailers and passed the v1.7.0 gate (`test-gate.js` exit 0) against the newly-authored plugin taxonomy `.verified/codebase/TESTING.md` (`lib-unit` default, `prompt-anchor` exception, `none` sign-off; T013/T014 signed off in `test-signoffs.json`).
- **Cross-language (added in review per user):** the analyzer is no longer Go-only. A drop-in language-adapter seam (`hooks/lib/lang/*.js`, auto-loaded by extension) ships adapters for **Go, TypeScript/JS, Python, Java**; the core is language-agnostic. Craft rules relocated to the neutral `skills/testing/SKILL.md`. See `review.md` Correction Loop. 206 tests; 4-language scan smoke-verified.
- ADR debt: significant decisions (deterministic-lib split, single-Farley-source, Go-as-text parsing, cross-language adapter seam) still have no ADR file — flagged in `retro.md`.
