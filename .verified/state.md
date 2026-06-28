---
feature: test-audit
phase: review
status: complete
last_activity: 2026-06-28 - Review complete; cross-language adapters (go,ts,python,java); 206 tests green
active_phase: ""
next_action: ""
next_phases: []
schema_version: 2
---

# Verified Development State

## Current feature: test-audit

Spec approved. Retroactive, advisory command to triage an existing test corpus against the
repo taxonomy: deterministic classify+rank (via new optional match-signals), LLM deep-dive on
the worst top-N against a per-type actor-BDD craft rubric (generic rules single-sourced in
tdd-go), durable ranked report at .verified/audits/<scope>-tests.md. Report-only, never blocks.
Touches v1.7.0 taxonomy (optional match-signals + craft fields), taxonomy.js, seed, /map, tdd-go.

- spec.md — approved (18 scenarios, 19 reqs, 10 edge cases)
- discussion.md — stress-test audit trail (D1–D4)
- Next: /plan

## Shipped
- enforced-test-taxonomy (v1.7.0) — forward test-boundary + scenario-traceability gate.
