# Implementation Summary: finding-injection

**Completed:** 2026-07-16
**Tasks:** 12/12

## What Was Built
- `hooks/lib/findings.js` — added the pure `suppressionKeys(envelope) → string[]` (keys-only
  `file:line:rule_id`, de-duped, never reads `message`).
- `hooks/lib/findings-store.js` (NEW) — the verify→review handoff store: `sourceFingerprint(cwd, git)`
  (working-tree-inclusive hash via an injectable git seam), `persistEnvelope` (atomic temp+rename,
  `findings-persisted/v1` record), `readFreshEnvelope` (staleness/malformed/absent guard → envelope
  or null).
- `skills/verify/SKILL.md` — step 3b now persists the envelope to `.verified/features/<f>/findings.json`
  stamped with the fingerprint (when a feature is active).
- `skills/review/SKILL.md` — Stage 2 reads the envelope behind the staleness guard and injects the
  keys-only suppression list into every agent (per-identity, non-gating, degrades on null/stale/skip).
- `skills/review/references/review-integrity.md` — disk-only-`message` corollary.
- `.verified/decisions/0004-persisted-findings-record.md` — ADR for the persisted record + freshness key.

## Test Coverage
- `tests/finding-injection.test.cjs` — **15 cases**: suppressionKeys (incl. adversarial-message
  exclusion, EC-003 unknown:0), fingerprint stability, persist/read round-trip, all four guard paths,
  skip degradation, and 3 skill-wiring anchors.
- Model-free: the git seam is injected (fake git runner); no real repo touched. Full suite: 343
  passed, 0 failed; 0 lint violations.

## Decisions Made
- ADR 0004 — `findings-persisted/v1`, working-tree-inclusive `source_hash` (the plan-critic caught
  that a commit-only key misses post-verify edits), store split from the producer, atomic write,
  disk-only `message`.

## Scope boundary
- Keys-only injection — no untrusted linter prose reaches a review prompt (dissolves the v1.17.0
  security constraint). Static self-heal loop remains a separate follow-up (also reads `findings.json`).
