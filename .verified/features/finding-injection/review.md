# Code Review Report

**Feature:** finding-injection
**Date:** 2026-07-16

## Stage 1: Spec Compliance
**Status:** PASS — 7/7 scenarios, 9/9 requirements, 5/5 edge cases, 7/7 success criteria. No scope
creep (grep confirms no self-heal loop built). The security property (adversarial `message` excluded
from `suppressionKeys`) is directly tested, not just inspected.

## Stage 2: Quality Review

Agents: spec-compliance, correctness (manual — registry note below), complexity, security, test-review.
Self-excluded by declared `scope` (diff is `.js`/`.md`, no `.go`): error-handling, concurrency,
interface-design; a11y (no UI).

### Errors: 0

### Warnings: 5 — ALL FIXED
| Agent | Issue | Resolution |
|-------|-------|------------|
| security | `rule_id`/`file` are ALSO tool-derived (SARIF `ruleId`/`uri`) — an attacker-controlled linter could smuggle prose into the key itself; the fencing stopped at `message`. | `suppressionKeys` now charset-sanitizes each component (`[\w./-]`, len-capped). Test: adversarial `rule_id`/`file` → no whitespace/`;` survives. |
| security | `readFreshEnvelope` returns the full envelope (with `message`); disk-only enforced only by caller discipline. | Added `readFreshSuppressionKeys()` — the raw-message envelope never crosses the boundary for injection. `/review` wired to it. Test added. |
| test-review | The `git diff -- :(exclude).verified` exclusion was validated only against the fake git table (same class as the dogfood bug, on the sibling command). | Real-git test: a tracked edit outside `.verified` drifts the fingerprint; one under `.verified` does not. |
| test-review | `defaultGit`'s failure path (non-repo / no commits → `''`) was never exercised end-to-end. | Real-git test: `sourceFingerprint` on a non-git dir → stable hex, no throw. |
| security (suggestion→fixed) | Predictable tmp name / symlink-race on `persistEnvelope`. | Randomized tmp suffix (`crypto.randomBytes`) + `wx` flag. |

### Suggestions: 2 (recorded, no action)
- test-review: `dedup` idempotence property test — small fully-enumerated state space, optional.
- test-review: round-trip test does raw-read + seam read — acceptable (the on-disk shape IS the contract).

## Summary
- Errors: 0 (nothing blocks)
- Warnings: 5 (all fixed) · Suggestions: 2 (recorded)
- **Farley Score: 8.7/10 — Excellent** (non-blocking). Weakest: Repeatable/Fast (the real-git tests
  shell out — deterministic + self-cleaning, but slower and skip if `git` is absent).
- Tests: 344 → **348** passing, 0 failed. 0 lint violations.

## Two adversarial gates each caught a real defect
- **plan-critic-design:** the freshness key was the commit SHA — wrong for this pre-commit review
  flow; fixed to a working-tree-inclusive `source_hash` (ADR 0004).
- **in-vivo dogfooding:** persisting the envelope changed the very fingerprint used to validate its
  freshness → `/review` would have *always* seen it stale. All unit tests were green. Fixed +
  real-git regression test.
- **security review:** the "no untrusted prose in prompt" property was incomplete — the keys
  themselves carried tool-derived strings. Now sanitized.

## In-vivo validation note
The session's agent registry is frozen at session start (~v1.11.0), so `correctness-review`
(added v1.13.0 this session) could not be spawned and was applied manually (no defects). This is a
session-lifetime limitation, not a plugin-install one — a fresh session on v1.20.1+ would spawn it.
`security-review` applied the review-integrity falsifiability rule explicitly (kept both findings at
`warning` with stated falsifiers), confirming that protocol works via file reference.
