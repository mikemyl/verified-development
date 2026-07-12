# Discussion — deterministic-repair-loop

Spec-time stress test (audit trail). Origin: porting hardening mechanisms from
`agentic-dev-team` (bdfinster) commits #861, #864, #865, #813-hooks, reviewed 2026-07-12.

## Surface area — what's in scope

Bundle originally proposed **four** dev-team mechanisms. Challenge split them by subsystem
and determinism model:

| Mechanism | Subsystem | Verdict |
|---|---|---|
| Failure-class routing | executor repair loop | **IN** — deterministic script |
| Failure-signature dead-end detection | executor repair loop | **IN** — deterministic script |
| Plan-task invariants + rollback points | plan grammar + `waves.js` | **IN** — script-shaped, cohesive with engine |
| Tests-frozen-during-refactor guard | PreToolUse hook | **OUT — split to own feature** |

### Rejected framing: keep all four together

The freeze-guard needs a RED/GREEN/REFACTOR **sub-phase** signal at tool-use time.
`handoff.json.phase` only tracks the big-five workflow phase (…→implement→…); the TDD
sub-cycle runs *inside* `implement` and nothing records which sub-step is active. Dev-team
solves this with a second state file (`build-phase.json`) written at each sub-phase
transition. So the guard is really **two** things: a sub-phase state emitter (does not exist
here) + the hook. Bundling it would let the heaviest, dependency-carrying item gate the three
that need no new state. **Decision: split it into a later "tdd-subphase-freeze" feature.**

## Alternatives — where the routing/dead-end logic lives

- **Option A (chosen): deterministic `hooks/lib` module.** Executor captures failure output,
  pipes it to a Node classifier that returns `{class, route}` and a dead-end verdict from a
  normalized failure signature. The script decides; the model obeys. Matches the existing
  `waves.js` / `test-gate.js` doctrine ("a script makes the block/route decision, not the LLM").
  Model-free, unit-testable.
- **Option B (rejected): prompt guidance in `executor.md`.** A markdown routing table the LLM
  reads and applies itself. Cheaper to build but soft — the model can misread or ignore it,
  abandoning the deterministic-gate identity. Rejected.

## Dependencies

- Extends `hooks/lib/waves.js` task grammar (adds optional `(invariants: …)` /
  `(rollback: …)` trailers). Must not perturb existing `plan-waves/v1` contract consumers
  (`/plan` step 8a, `/implement`). Additive only.
- New module invoked by `agents/executor.md` repair loop — needs a captured-failure text seam.
- Rollback-point resolution needs a git seam (symbolic ref → concrete SHA at dispatch).

## Out of scope

- TDD sub-phase state machine + refactor-freeze hook (→ own feature).
- Any change to iteration caps / retry budgets (routing switches spend from the same budget).
- Cost tracking, telemetry, eval harness (explicitly rejected in the wider dev-team review).

## Posture

All additions are **opt-in / additive / non-blocking**, matching the Farley-score precedent:
a task with no `(invariants:)` behaves exactly as today; routing/dead-end degrade to
today's generic-retry behavior if the classifier returns `unclassified`.
