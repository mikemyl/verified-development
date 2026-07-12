# Feature: deterministic-repair-loop

## Context

When an `/implement` executor's repair loop hits a failing test, today it retries generically —
the same broad "try again" regardless of *why* it failed, with no detection of a loop that is
getting nowhere. And a plan task can only assert that its *own* tests pass; nothing guarantees a
pre-existing suite stays green across a wave, and there is no named revert boundary when a wave
goes bad.

This feature ports three deterministic hardening mechanisms from `agentic-dev-team` (bdfinster,
commits #861, #864, #865), keeping the plugin's doctrine intact: **a script makes the route /
gate decision, not the LLM** (as in `waves.js` and `test-gate.js`). Everything is additive and
opt-in — a plan or repair loop that uses none of it behaves exactly as today.

Out of scope (split to a later feature): the tests-frozen-during-refactor guard, which requires a
RED/GREEN/REFACTOR sub-phase state machine this plugin does not yet have. See `discussion.md`.

Beneficiary: anyone running `/implement` — repairs terminate faster and more precisely, and plans
gain cross-cutting invariants + revert boundaries.

## Acceptance Scenarios

### AS-1 — Known failure class routes precisely
Given a repair-loop failure whose output contains `undefined: fooBar` with exit code 2,
When the executor classifies it via `repair-routing`,
Then the result is class `compile` and route `fix-inline`.

### AS-2 — Unknown failure degrades to today's behavior
Given a failure whose output matches no rule in the routing table,
When it is classified,
Then the result is class `unclassified` and route `retry` (the current generic-retry path), so
nothing regresses.

### AS-3 — Security-flavored failure dispatches to the right agent
Given a failure whose output matches a security signal,
When it is classified,
Then the route is `dispatch:security-review`.

### AS-4 — Two identical failures are a dead-end
Given repair iteration N and N+1 produce the same normalized failure signature,
When the dead-end check runs,
Then it reports `deadend: true`, and the executor checkpoint-commits and escalates with a diff of
resolved-vs-remaining failures.

### AS-5 — Volatile noise does not hide a dead-end
Given two iterations whose outputs differ only in timestamps, durations, memory addresses, PIDs,
or absolute temp paths,
When their signatures are computed,
Then the two signatures are equal (volatile tokens stripped), so the dead-end is still detected.

### AS-6 — Progress resets the dead-end counter
Given iteration N fails tests `{A, B}` and iteration N+1 fails only `{A}`,
When the signatures are compared,
Then `deadend: false` (progress was made) and the repair loop continues.

### AS-7 — Invariants are parsed and gated after green
Given a plan task with trailer `(invariants: just lint; just build)`,
When `waves.js` parses the plan,
Then the task contract carries `invariants: ["just lint", "just build"]`; and after the task's own
tests pass, the executor runs each invariant and fails the task if any exits non-zero.

### AS-8 — Rollback point resolves to a concrete SHA
Given a task with trailer `(rollback: plan-start)`,
When the wave is dispatched,
Then the symbolic ref resolves to the concrete SHA recorded at plan start, exposed as the task's
revert boundary.

### AS-9 — Legacy plans are byte-identical
Given a plan with no invariants/rollback trailers,
When `waves.js` parses it,
Then the `plan-waves/v1` output is unchanged from the pre-feature engine and all existing
consumers (`/plan` step 8a, `/implement`) are unaffected.

### AS-10 — Writing outside declared scope is an advisory, not a block
Given a task declaring `(files: a.js)` whose executor also writes `b.js`,
When the declared-scope check runs,
Then an advisory warning naming `b.js` is surfaced — never a hard failure.

## Requirements

- **FR-001** `hooks/lib/repair-routing.js` exposes `classify(failureText, exitCode) → {class, route}`
  from a documented regex/exit-code table.
- **FR-002** `classify` is deterministic and model-free (no LLM call); identical input yields
  identical output.
- **FR-003** Unclassified failures return `{class: "unclassified", route: "retry"}`, preserving
  current generic-retry behavior.
- **FR-004** The table covers at least these classes: compile/syntax, behavioral-test,
  coverage-gap, lint/format, security-finding, reviewer-conflict, unclassified. Routes include
  `fix-inline`, `systematic-debug`, `generate-test`, `dispatch:<agent>`, `escalate:human`, `retry`.
- **FR-005** `repair-routing.js` exposes `signature(failureText) → hash` computed from failing-test
  identifiers + error class, with volatile tokens (timestamps, durations, memory addresses, PIDs,
  absolute temp paths) stripped before hashing.
- **FR-006** A dead-end is declared when two consecutive iterations yield identical signatures; the
  module exposes this decision (a tracker or `isDeadEnd(prev, cur)`).
- **FR-007** On a dead-end the executor checkpoint-commits current progress and escalates with a
  diff of resolved-vs-remaining failures.
- **FR-008** The module emits a versioned contract `repair-routing/v1` with documented return and
  exit semantics, mirroring the sibling libs.
- **FR-009** `waves.js` parses optional `(invariants: c1; c2)` and `(rollback: <symbol|ref>)` task
  trailers onto the task contract; symbolic rollback values are `slice-start | wave-start |
  plan-start | <git-ref>`.
- **FR-010** `waves.js` provides `resolveRollback(symbol) → concrete SHA` at dispatch time.
- **FR-011** Invariants run as a gate *after* the task's own suite passes; a non-zero invariant
  fails the task. Absent trailer = no gate (opt-in).
- **FR-012** The new grammar is additive: a plan without the new trailers produces unchanged
  `plan-waves/v1` output; no existing field or consumer is altered.
- **FR-013** Declared write-scope: when the files an executor touches exceed the task's declared
  `(files:)`, an advisory warning is surfaced — never a hard block.
- **FR-014** `agents/executor.md` is wired to call the classifier + dead-end tracker in its repair
  loop and to run invariants post-green.

## Edge Cases

- **EC-001** Empty failure text → `classify` returns `unclassified/retry`; no crash.
- **EC-002** Failure text containing only volatile tokens → `signature` is stable (deterministic),
  not random.
- **EC-003** `(invariants:)` with an empty/whitespace command list → treated as no invariants, not
  an error.
- **EC-004** `(rollback: <ref>)` where the ref does not resolve → `resolveRollback` surfaces a
  clear error naming the ref; it must not silently fall back to `HEAD`.
- **EC-005** A task's invariant *command* touches files the task does not declare in `(files:)` →
  exempt from the scope advisory (running a command is not a file write).
- **EC-006** Malformed trailer (unterminated `(invariants:`, unknown rollback keyword) → `waves.js`
  exits `2` (malformed plan) naming the offending task, consistent with today's cycle/unknown-dep
  handling.
- **EC-007** First repair iteration (no previous signature) → dead-end check returns `false`
  (needs two consecutive signatures).

## Success Criteria

- **SC-001** Every acceptance scenario has a corresponding test.
- **SC-002** All verification gates pass (the project's verify command).
- **SC-003** `repair-routing.js` and the `waves.js` extension are unit-tested model-free — no LLM in
  any test.
- **SC-004** The existing `tests/waves.test.cjs` corpus passes unchanged (no `plan-waves/v1`
  regression).
- **SC-005** A plan with zero new trailers yields `plan-waves/v1` JSON byte-identical to the
  pre-feature engine on a fixture.
- **SC-006** No new npm dependencies; modules follow the existing no-deps Node lib pattern.
- **SC-007** The tests-frozen-during-refactor guard is NOT introduced by this feature (scope
  boundary held; it is a separate later feature).
