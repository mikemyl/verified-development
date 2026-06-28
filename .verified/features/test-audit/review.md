# Code Review Report

**Feature:** test-audit
**Date:** 2026-06-28

## Stage 1: Spec Compliance
**Status:** PASS (after fix). Initial FAIL was a coverage gap — the `/test-audit` skill implemented AS-005/006/012/015 + EC-005/009/010 but T009's anchor test didn't lock them. Fixed: added 9 behavior anchors to `tests/test-audit.test.cjs`. 162 tests green.

## Stage 2: Quality Review
Agents: complexity, test, dead-code, doc, domain (+ language-coupling lens). **Farley: 8.4/10 (Excellent), non-blocking.**

### Errors (must fix)
| Agent | Location | Issue | Fix |
|-------|----------|-------|-----|
| complexity | test-corpus.js `scanBraces` | cyclomatic 16 (>10), 98 lines (>80) | Extract per-state handling |
| complexity | taxonomy.js `parseTaxonomy` | cyclomatic 19 (>10) — grew with optional-field parsing | Extract `fillOptionalDefaults` + `validateTypes` |
| doc | test-corpus.js header | Stale: says "T007 discovery only / T008 extends" but both are in-file → misleads readers | Rewrite header to describe the file as-is |

### Language coupling (the cross-language concern — all warnings, all to fix)
| Tied to | Issue | Fix |
|---------|-------|-----|
| test-corpus.js (discover/scanBraces/countAssertions) | Go hard-wired, selected by `.go`; no adapter seam. Pieces are already isolated → cheap to cut now, expensive later | Introduce `LANGUAGE_ADAPTERS` registry `{ext, testFileGlobs, discover, countAssertions}`; `goAdapter` first; core (classify/rank/summary/scope) stays adapter-free |
| test-corpus.js `scoreTest`→`countAssertions` | The "agnostic" smell scorer leaks Go testify regex → on TS, `assertion_dispersion` silently always 0 | Move `countAssertions` to the adapter |
| skills/tdd-go/SKILL.md | The 6 generic craft rules live in a Go-named skill, declared "single source"; TS arm would cite Go rules or none | Relocate rules to neutral `skills/testing/SKILL.md`; tdd-go/react-testing/test-audit/map reference it; re-point the drift guard |
| skills/test-audit/SKILL.md, docs | Command framed as language-neutral but analysis is Go-only → non-Go repo shows `total:0` indistinguishable from "tests fine" | Emit explicit "no analyzable tests for supported languages (Go)" when `tests:[]` but `unsupported_files` non-empty; state Go-first limitation in skill + docs |

### Other warnings (fix)
| Agent | Issue | Fix |
|-------|-------|-----|
| doc | `/map` writes `good-example` + `anti-patterns` but OMITS `bad-example` → never populated | Add `bad-example` to the /map TESTING.md format block |
| domain | `sanctioned` ⇔ `type!==null` always → `share_sanctioned` === `classification_coverage` on every input (redundant/conflated) | Make `sanctioned` tier-aware (classified into a non-`sign-off` type), so the two metrics differ and the term means what the vocabulary implies |
| dead-code | Internal helpers exported (`discoverInSource`, `scanBraces`, `walkFiles`, `globToRegExp`); `ARRAY_FIELDS` exported-but-unused, asymmetric with `EXAMPLE_FIELDS` | Trim `module.exports` to the real public API |
| test | Missing boundary tests: `weak_match===true` never asserted; `analyze` empty-corpus never called; rune-literal `'{'` + multi-line block-comment braces untested; `>=6` should be `===8`; unbalanced-braces + nonexistent-path error paths untested | Add the cases; tighten the assertion |

### Suggestions (deferred / noted)
- Seed taxonomy is Go-flavored — mark `match-*`/example fields as language-specific placeholders (or per-language seed). DEFER.
- `react-testing`/`front-end-testing` reference a non-existent `tdd` skill — re-point to `skills/testing` once craft rules move there. FIX (cheap, folds into relocation).
- Document `match_paths` glob grammar at taxonomy.js (the owning module). DEFER.
- Property tests for glob + more determinism cases. DEFER.

## Summary
- Errors: 3 · Language-coupling warnings: 5 · Other warnings: 4 · Suggestions: 4
- Dead-code: WARN (over-exports). Farley: 8.4/10.
- Verdict: substantively correct & tested, but Go-coupled against the cross-language goal. The coupling fix is the load-bearing change.

## Correction Loop (all findings resolved + scope expanded per user)

The user directed: full decouple **and** ship adapters for Go, TypeScript, Python, Java now.

**Cross-language architecture (was the 5 coupling warnings):**
- Introduced a drop-in language-adapter seam: `hooks/lib/lang/<id>.js`, each exporting `{id, extensions, testFileGlobs, discover, countAssertions}`, auto-loaded by extension (no central registry). `test-corpus.js` core (classify/rank/summary/scope) is now language-agnostic; per-test `assertions` attached via the adapter so the scorer has no language regex.
- Adapters: `go` (extracted), `typescript` (.ts/.tsx/.js/.jsx, `it()`/`test()`), `python` (indentation scanner, `def test_*`/`class Test*`), `java` (`@Test` methods). C-family langs share `lang/cfamily.js`; Python has its own indentation scanner.
- Craft rules relocated to the neutral `skills/testing/SKILL.md`; `tdd-go`/`react-testing`/`front-end-testing`/`test-audit`/`/map` reference it; drift guards updated (rules live only in `testing`).
- Unsupported-language `note` when a scope has only foreign test files (no misleading empty pass).

**Errors:** `scanBraces` complexity → extracted into `cfamily.js` helpers; `parseTaxonomy` split into `parseTypeSections`/`fillOptionalDefaults`/`validateTypes`; stale `test-corpus.js` header rewritten.

**Other warnings:** `/map` now writes `bad-example`; `sanctioned` made tier-aware (≠ classification_coverage now); `module.exports` trimmed to the public API; added the missing boundary tests (weak_match, empty-corpus note, rune-literal brace, assertion count `===8`, unbalanced skip); docs updated Go-only → 4-language.

**Adapter quality pass:** complexity-review of `lang/*` → PASS (all under threshold; 2 Python fns at CC 9).

**Deferred (non-blocking, recorded):** dedicated `lang-go.test.cjs` for parity (Go is covered via `test-corpus.test.cjs`); 3 DRY refactors (`computeLineOffsets`, `skipSingleLineString`, `isDiscoverableTest`); seed Go-flavored placeholders; glob-grammar doc at taxonomy.js; property tests.

**Post-fix gate:** 206 tests passing, 0 failing; 0 lint violations. 4-language scan smoke-verified end-to-end.
**Verdict:** PASS — cross-language, decoupled, clear to merge after human review.
