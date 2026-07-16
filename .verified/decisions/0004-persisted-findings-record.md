# ADR 0004 — The `findings-persisted/v1` record (verify→review handoff)

**Status:** Accepted
**Date:** 2026-07-16
**Feature:** finding-injection
**Context:** `/verify` scans the repo and produces a `findings/v1` envelope (ADR 0003); `/review`
wants to consume it as a suppression list. They run in separate processes, so the envelope must be
persisted between them. A second future feature (the static self-heal loop) will read the same
persisted record. Per the ADR-0003 rationale ("shape must be stable before dependents are built"),
this ADR freezes the persisted shape and — critically — the freshness key. Audit trail:
`.verified/features/finding-injection/{discussion,concerns}.md`.

## Decision
`/verify` writes `.verified/features/<feature>/findings.json`:

```
{
  schema: "findings-persisted/v1",
  source_hash: "<working-tree-inclusive fingerprint>",
  envelope: { …findings/v1… }
}
```

- **`source_hash` is working-tree-inclusive, not the commit SHA.** It is a hash over HEAD **plus**
  `git diff HEAD` plus the untracked-file list. `/review` recomputes it and injects only when it
  matches.
- **Persistence lives in `hooks/lib/findings-store.js`**, a sibling of the pure producer
  `findings.js` (which stays scan/normalize/`suppressionKeys` only, per ADR 0003). The store does
  the filesystem I/O + git shell-out, mirroring how `handoff.js` owns git-stamped feature-dir JSON.
- **The write is atomic** (temp file + rename), matching `handoff.js`.
- **`message` is disk-only.** The persisted record retains full linter `message` text, but that text
  is never prompt-safe: consumers inject via `suppressionKeys` (keys only), never raw envelope
  fields. Recorded in `review-integrity.md`.

## Rationale
The freshness key is the load-bearing decision. This plugin's convention is *don't commit until
review is complete* (`skills/verify/SKILL.md`), so `/verify` and `/review` normally run against the
**same HEAD** with a dirty working tree in between. A commit-SHA key would report "fresh" after a
post-verify edit — exactly the staleness the guard exists to catch — so it must include the working
tree. Separating the store from `findings.js` keeps the producer pure and its ADR-0003 contract
intact; an injectable git seam keeps the guard unit-testable without a real repo.

## Rejected alternatives
- **(i) Key on `git rev-parse HEAD` only.** Misses uncommitted post-verify edits — the realistic
  staleness case in the plugin's pre-commit review flow. Rejected (this was the original design; the
  plan-critic caught it).
- **(ii) Put persist/read on `findings.js`.** Bolts filesystem I/O + git onto the module ADR 0003
  scoped as the pure SARIF producer. Rejected in favor of `findings-store.js`.
- **(iii) Re-run `findings.js scan` in `/review` instead of persisting.** Re-runs the linters
  minutes after `/verify` already did. Rejected in `discussion.md` (Q1a).

## Consequences
- `findings-persisted/v1` is frozen; the self-heal loop reads it without touching this feature.
- The guard catches both commit and working-tree drift; only a change that leaves an identical tree
  fingerprint (practically none) would slip through.
- One new module (`findings-store.js`); `findings.js` gains only the pure `suppressionKeys`.
