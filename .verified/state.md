---
feature: none
phase: idle
status: complete
last_activity: 2026-07-17 - test-weakening-detection shipped (v1.22.0): 0 errors, 6 warnings fixed (incl. a real globToRegExp bug), Farley 8.2, 366 tests. ROADMAP COMPLETE.
active_phase: ""
next_action: ""
next_phases: []
schema_version: 2

# NOTE: roadmap #6 (tdd-subphase-freeze) was reshaped to test-weakening-detection — the challenge
# rejected the global PreToolUse refactor-freeze hook (blast radius + self-reported state) in favor
# of a post-hoc detector: flag a test that lost assertions in a change, non-blocking test-review
# signal. No hook, no sub-phase state machine (SC-006). See features/test-weakening-detection/discussion.md.
---

# Verified Development State

## Current feature: finding-injection

Consumer half of `structured-finding-layer` (v1.17.0). `/review` Stage 2 injects the persisted
`findings/v1` envelope as a keys-only suppression list (`file:line:rule_id`) so quality agents stop
re-reporting lint noise a linter already caught. `/verify` persists
`.verified/features/<f>/findings.json` + `git_head`; `/review` reads behind a staleness guard
(stale/absent/malformed/skip → inject nothing, degrade to today). Keys-only dissolves the v1.17.0
security constraint (no untrusted linter prose enters the prompt). Per-identity suppression, not
per-line; non-gating. New `findings.js` `suppressionKeys()`.
- spec.md — approved (7 scenarios, 9 reqs, 5 edge cases, 7 SC)
- discussion.md — Q1b (persist+staleness), Q2a (keys-only)
- Next: /plan

## Roadmap remaining (post-v1.20.1)
- finding-injection (current) — consumer of the SARIF envelope.
- tdd-subphase-freeze (#6) — RED/GREEN/REFACTOR sub-phase state emitter + refactor-freeze hook.
- static self-heal loop — autofix→verify→agent (cap 2), also consumes the envelope.
- effort-band migration — model: pins → effort: bands (gated on native CC support check).

## Prior feature: structured-finding-layer (roadmap #4, full workflow)

SARIF unified-finding envelope from agentic-dev-team (#808/#811). Producer-only scope (Q2=4a):
`hooks/lib/findings.js` (`findings/v1`, pure SARIF→envelope parser) + Go/golangci-lint SARIF
adapter (auto-loaded by extension) + `/verify` surfaces the envelope as a NON-BLOCKING section
(existing `just verify` stays the sole gate). Graceful degradation first-class (no/broken tool →
skip, never fail). Self-heal loop and `/review` finding-injection are SPLIT to follow-ups.
- spec.md — approved (10 scenarios, 11 reqs, 6 edge cases, 7 SC)
- discussion.md — scope trail (envelope-only; producer-only, no review-behavior change)
- Next: /plan

## Earlier shipped: deterministic-repair-loop (v1.12.0, via /quick)

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
2. **review-roster-dispatch** — `correctness-review` agent [DONE v1.13.0] +
   `scope:` self-declared dispatch + agent-frontmatter contract test + `Context needs:` [in progress] +
   prompt-injection/falsifiability [todo].
   React reactivity/component-architecture agents DROPPED from core (2026-07-12): stack-specific,
   contradicts the language-agnostic direction (v1.9.0). Belongs to the "teach your stack per-repo"
   path (repo-local skill/agent), same argument that keeps tdd-go the lone bundled example.
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
