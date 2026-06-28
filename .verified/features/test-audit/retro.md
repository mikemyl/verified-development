# Process Retro: test-audit

## What worked
- The v1.7.0 gate dogfooded cleanly on this feature's OWN plan (`test-gate.js` exit 0) against a newly-authored plugin taxonomy — the forward gate governing its successor validated the whole taxonomy approach in practice.
- The drop-in adapter design (auto-load `lang/*.js` by extension, no central registry) let three language adapters be built by parallel executors with zero collisions — adding a language is a new file, exactly as intended.
- The spec-compliance gate caught a real SC-001 hole (AS-005/006/012/015 implemented but not anchored) before quality review ran — the gate did its job.

## What didn't
- The Stage-2 quality agents reviewed the Go-only code; the user then expanded scope to 4 languages mid-review. The new adapters initially escaped review and needed a second focused complexity pass (which found nothing major — but the sequencing was luck, not process).
- Parallel executors raced on a shared assertion (the hardcoded `(go)` note regex): two independently relaxed it. Harmless here, but a coordination smell when fanning out edits that can touch a common file.
- I repointed test fixtures to `.rb`/`.kt` without first reading the unsupported-file heuristic; `.kt` wasn't recognized → a failed test → rework. Reading the heuristic first would have avoided the round-trip.

## Workflow tuning signals
- **Re-review expanded scope.** When a review correction loop adds modules (here: 3 new adapters), re-run the relevant quality agents on the NEW code — agent findings are only as current as the diff they saw. Consider making this an explicit step in `/review`'s correction loop.
- **Major in-loop scope expansion bypassed `/update-plan`.** Go-first → 4 languages roughly doubled the work; plan.md no longer reflects the adapters. Either route major expansions through `/update-plan` or accept documented plan/reality drift (captured in review.md).
- **ADR debt persists.** Significant decisions (deterministic-lib split, single-Farley-source, Go-as-text parsing, and now the cross-language adapter seam) still have no ADR file. The workflow records ADR *candidates* in plan Decisions but nothing forces the artifact. Consider a `/review` nudge when Decisions contain unwritten ADR candidates.

## Top process learning
A review correction loop that expands scope must re-review the new code — quality findings are only as current as the diff the agents saw.
