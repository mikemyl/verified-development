# Plan-time concerns — finding-injection

Plan-critic gate. Critics run: acceptance, design, strategic.
Skipped: ux (no ui-spec.md), parallelization (fully sequential plan).

## Findings summary
- **Errors:** 0
- **Warnings:** 5 (all addressed by re-drafting spec/plan)
- **Suggestions:** 5 (2 folded in, 3 recorded-only)

## Addressed (warnings)

| # | Critic | Finding | Disposition |
|---|--------|---------|-------------|
| 1 | design | **Staleness key can't detect the staleness it exists for.** `/verify`+`/review` run against the same HEAD pre-commit (the repo forbids committing before review), so a `git rev-parse HEAD` key reports "fresh" after a post-verify working-tree edit — the realistic case. | **Spec + plan fixed.** Freshness key is now a working-tree-inclusive `source_hash` (HEAD + `git diff HEAD` + untracked). AS-1/AS-3/FR-001/FR-004/EC-002 updated; ADR 0004 records it. |
| 2 | design | persist/read add FS I/O + git shell-out to `findings.js`, which ADR 0003 scoped as the pure producer; `handoff.js` is the precedent for git-stamped feature-dir JSON. | **Split.** persist/read/fingerprint now live in a new `hooks/lib/findings-store.js` (T003/T004/T006); `findings.js` keeps only the pure `suppressionKeys`. |
| 3 | design | Persisted `findings.json` is a durable cross-feature artifact (self-heal will read it) but had no schema tag / frozen field list. | **ADR 0004** + schema tag `findings-persisted/v1` (`{schema, source_hash, envelope}`); FR-001 states the frozen shape. |
| 4 | strategic | T010 asserted 3 independent wiring properties in one anchor task (per-identity, keys-only, non-gating + degradation) — ambiguous failure signal. | **Split** into T010 (injection semantics: per-identity + keys-only) and T011 (non-gating + degradation), with T012 as the single wiring task. |
| 5 | acceptance | EC-003 (`file:"unknown"`/`line:0` → well-formed `unknown:0:<rule>` key) had no test. | **Added** to T001's assertions. |

## Folded-in suggestions
- design: persistEnvelope should state atomicity → **atomic temp-file + rename** (matching `handoff.js`) stated in T004 + FR-001.
- design: persisted `message` is disk-only, not prompt-safe → FR-008 + a `review-integrity.md` note (T012); future consumers route through `suppressionKeys`.

## Recorded-only (no action)
- acceptance: T010 scenario tags — mooted by the T010/T011 split.
- strategic: T003/T004 bundle persist + happy-path read — acceptable incremental TDD.
- strategic: file concentration / forfeited parallelism — correct shape for a single-lib feature; the wave engine's collision check is a correct proxy for the sequencing.

## Critic errors
None — all three returned well-formed findings.
