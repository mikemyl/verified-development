# Code Review Report

**Feature:** test-weakening-detection
**Date:** 2026-07-17

## Stage 1: Spec Compliance
**Status:** PASS — 7/7 scenarios, 9/9 requirements, 5/5 edge cases, 6/6 success criteria; SC-005
(lock extended, not duplicated) and SC-006 (no hook, no sub-phase machine) grep-verified; no scope creep.

## Stage 2: Quality Review

Agents: spec-compliance, correctness (manual — session registry note below), complexity, security,
test-review, dead-code. Self-excluded by declared `scope`: error-handling/concurrency/interface (no `.go`), a11y (no UI).

### Errors: 0

### Warnings: 6 — ALL FIXED
| Agent | Issue | Resolution |
|-------|-------|------------|
| dead-code | `LANG_DIR` exported from `lang-loader.js`, no consumer | Removed from exports (pre-emptive). |
| security | `baseRef` git option-injection (a `-`-prefixed ref → `--output=` arbitrary write) | `scan` rejects a `-`-prefixed/empty ref → note, before git. Test added. |
| security | git `spawnSync` had no `timeout`/`maxBuffer` — a large diff silently drops a file to `not_analyzed` | Added `{timeout: 15000, maxBuffer: 64MB}`. |
| test-review | `scan`'s `status==='D'` delete branch untested through the wiring (only `analyze`) | Real-git test: `git rm` a test → `scan` flags `removed`. |
| test-review | `testMatchers`' repo-taxonomy (`source==='repo'`) branch untested (only the adapter fallback) | Direct test: a repo `TESTING.md` `match-paths` classifies its own test. |
| test-review | `scan`'s git-failure / invalid-ref → `note` path untested | Test: `-oops` and an unresolvable ref both degrade to a `note`. |

### Suggestions: 3 (2 fixed, 1 recorded)
- test-review + design (implicit): `globToRe` duplicated `test-corpus.js`'s `globToRegExp`. **Fixed:**
  extracted the canonical one to `lang-loader.js`, shared it, dropped the duplicate — and doing so
  **surfaced a real bug**: the compiler mapped `**/` to `.*/` (directory *required*), so a top-level
  `foo_test.go` didn't match `**/*_test.go`. Corrected to `(?:.*/)?` + a direct `globToRegExp` test.
  This latent bug also affected `test-corpus.js` classification; now fixed for both.
- test-review: `lang-loader.js` had no direct test → **added** `tests/lang-loader.test.cjs`
  (adapter set, cfamily-skip, memoization, glob semantics).
- security: ReDoS on `globToRegExp` — recorded; input is a bounded git path, glob source is same-trust
  repo content. Compiling once (caching) was adopted as part of the perf fix.

## Summary
- Errors: 0 · Warnings: 6 (all fixed) · Suggestions: 3 (2 fixed, 1 recorded)
- **Farley Score: 8.2/10 — Excellent** (non-blocking). Post-fix the `scan` seam + `globToRegExp` +
  `lang-loader` all have direct coverage; the real-git branches (delete, invalid-ref) are exercised.
- Tests: 358 → **366** passing, 0 failed. 0 lint. Farley/test-craft non-blocking locks unregressed.

## The pattern this feature confirms (third time)
An extracted/shared seam with only trivial or transitive coverage hides a real bug. Sharing
`globToRegExp` and testing it directly caught a `**/` semantics bug present in the "canonical" copy.
Same lesson as finding-injection's fingerprint and golangci fixture: **give every external-tool /
shared seam a direct, non-trivial test.**

## In-vivo note
`correctness-review` could not spawn (session agent registry frozen at session start, ~v1.11.0,
independent of the installed v1.20.1); applied manually (no defects). `security-review` applied the
review-integrity falsifiability rule (kept the injection finding at `warning` with a stated falsifier).
