# Implementation Summary: test-weakening-detection

**Completed:** 2026-07-17
**Tasks:** 8/8

## What Was Built
- `hooks/lib/test-weakening.js` — pure `analyze(entries)` (assertion-count delta base→change via the
  `hooks/lib/lang/*` adapters; flags a net decrease, deletion → `removed: true`, unsupported →
  `not_analyzed`; contract `test-weakening/v1`) + `scan(baseRef, cwd)` CLI that owns git+fs IO
  (diff, taxonomy/adapter test-file classification, exclude added, resolve before/after).
- `hooks/lib/lang-loader.js` (NEW) — the adapter loader extracted from `test-corpus.js` and shared
  by both (per plan-critic-design); `test-corpus.js` re-pointed, its tests unchanged.
- `agents/test-review.md` — new **criterion 12** (non-blocking): a test that lost assertions in a
  change is a `warning`, naming consolidation / actor-BDD fixture-chaining as legit causes.
- `skills/review/SKILL.md` — runs `test-weakening.js scan` over the review range, feeds flags to
  `test-review`, framed non-gating.

## Test Coverage
- `tests/test-weakening.test.cjs` — 7 cases: analyze (flag/not-flag/deletion/unsupported/unreadable)
  + one **real-git integration test** (weakened flagged, added excluded, non-test ignored).
- `tests/test-quality-signals.test.cjs` — extended (the single-source non-blocking lock, three
  signals → four) so criterion 12 can't drift into blocking.
- 358 passing, 0 lint. Farley + test-craft non-blocking locks unregressed.

## Decisions
- Roadmap #6 was reshaped from a PreToolUse refactor-freeze hook (self-referential, global blast
  radius) to this detector (see discussion.md). SC-006 held: no hook, no sub-phase state machine.
- `analyze` pure / `scan` owns-IO; one real-git test for the seam (the finding-injection lesson).
- Repo-declared taxonomy `match-paths` classify tests only when `source: 'repo'` (the seed's are
  plugin-specific and would misclassify other languages) — else per-language adapter `testFileGlobs`.

## Dogfood
Ran `scan` on this session's own changes vs the last commit → 0 flagged (correct: assertions were
only added). Exercised the repo-taxonomy classification branch the throwaway-repo test didn't.
