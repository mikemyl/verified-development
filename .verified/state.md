---
feature: none
phase: idle
status: complete
last_activity: 2026-07-12 - Shipped correctness-review agent (v1.13.0); roadmap #2 slice 1/3
active_phase: ""
next_action: ""
next_phases: []
schema_version: 2
---

# Verified Development State

## Last shipped: deterministic-repair-loop (v1.12.0, via /quick)

Ported three deterministic `/implement` hardening mechanisms from `agentic-dev-team` (bdfinster
#861/#864/#865): failure-class **routing** + **dead-end detection** (`hooks/lib/repair-routing.js`,
`repair-routing/v1`, wired into `agents/executor.md`); plan-task **invariants + rollback points**
+ declared-scope advisory (additive `waves.js` grammar, wired into `skills/implement`). Ran
`/quick` (not the full ceremony) after deciding the full workflow was disproportionate for a
2-module change; kept strict TDD + proportional review (test-review caught a real case bug + a
vaporware gap, both fixed). 261 tests, 0 lint. spec.md + discussion.md under the feature dir.

SPLIT OUT to feature #6: tests-frozen-during-refactor guard (needs a TDD sub-phase state machine).

## Roadmap — agentic-dev-team incorporation (reviewed 2026-07-12)

Five features grouped from a review of bdfinster's last month (853 commits). Order by conviction:

1. **deterministic-repair-loop** (current) — routing + dead-end + invariants/rollback.
2. **review-roster-dispatch** — `scope:` self-declared dispatch + `correctness-review` agent +
   React reactivity/component-architecture agents + prompt-injection/falsifiability +
   agent-frontmatter contract test + `Context needs:`.
3. **test-quality-signals** — oracle-provenance/circular-test taxonomy + unarmored-region +
   reflection-based private-access detection.
4. **structured-finding-layer** — SARIF unified-finding envelope + golangci-lint adapter +
   bounded static self-heal loop (the big one).
5. **atdd-loop-closure** — detect-BDD-convention + export specify scenarios to actor-BDD/testdsl
   format; fold in learnings.md `evidence` field + `.verified/` provenance footer.
6. **tdd-subphase-freeze** (split from #1) — TDD sub-phase state emitter + refactor-freeze hook.

Explicitly rejected from the review: code-first cadence flip, autoship, `/agent-eval` +
benchmark/eval harness, feedback-learning eval-gating (no eval substrate here).

## Shipped
- language-agnostic-core (v1.9.0) — de-privileged executor; infers runner/idioms per-repo.
- test-craft prevention + comment economy (v1.11.0) — two blocking craft anti-patterns.
- enforced-test-taxonomy (v1.7.0) — forward test-boundary + scenario-traceability gate.
- test-audit (v1.8.0) — retroactive corpus triage; cross-language adapters (go/ts/python/java).
