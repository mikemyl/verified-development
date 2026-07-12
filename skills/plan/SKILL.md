---
name: plan
description: "Create an implementation plan from a feature spec — ordered, test-first, file-pathed tasks."
version: 0.1.0
---

Create an implementation plan for a feature. This is Phase 2 of the verified development workflow.

## Process

### 1. Determine Feature

- If feature name provided as argument → use it
- If no argument → read `.verified/state.md` for the current feature
- If no argument and no state → ask the user which feature to plan
- `--no-critics` flag: skip the plan-time critic gate (default is on)

### 2. Load Context

- Read `.verified/features/{feature-name}/spec.md` — MUST exist
- Read `.verified/features/{feature-name}/ui-spec.md` — if it exists, this is CRITICAL:
  - The UI spec defines exact components, data attributes, test IDs, CSS classes, ARIA attributes
  - Plan tasks MUST reference specific elements from the UI spec (e.g., `data-testid="terms-modal"`)
  - Tests MUST assert UI spec details (layout, responsive behavior, accessibility)
  - Do NOT design UI from scratch if a ui-spec exists — follow it precisely
- Read `.verified/project.md` — project principles and tech stack
- Read `.verified/config.json` — thresholds and settings
- Read `.verified/codebase/` docs if they exist — these inform planning:
  - `ARCHITECTURE.md` — understand package structure and where new code fits
  - `CONVENTIONS.md` — follow established patterns, naming, error handling
  - `STACK.md` — know available dependencies before adding new ones
  - `STRUCTURE.md` — place files in the right directories
  - `TESTING.md` — follow existing test patterns and infrastructure
  - `INTEGRATIONS.md` — understand external service boundaries

If spec.md doesn't exist, tell the user to run `/specify` first.
If codebase docs don't exist, suggest running `/map` but don't block planning.

### 2a. Open Handoff

This phase is interruptible. Write an initial handoff (see `skills/pause/SKILL.md` for the wire format):

```bash
node ${CLAUDE_PLUGIN_ROOT}/hooks/lib/handoff.js write .verified/features/{feature-name}
```

With `phase: "plan"` and `remaining_tasks` listing: `analyze-spec`, `research`, `draft-tasks`, `task-rules-check`, `decisions-prompt`, `quality-check`, `present-and-confirm`. After each step completes, `update` to move it to `completed_tasks`. If `/pause` is invoked, defer to that skill.

### 3. Analyze Specification

Break down the spec into implementation units:
- Each acceptance scenario -> one or more tasks
- Each requirement -> implementation work
- Each edge case -> boundary test cases
- UI screens -> component tasks (if ui-spec exists)

### 4. Research (if needed)

If the implementation requires unfamiliar libraries, patterns, or APIs:
- Research the specific question (don't do broad exploration)
- Document findings briefly in the plan
- Note any decisions made — prompt for ADR capture if significant

Ask the user: "I need to research {topic} before planning. Should I proceed, or do you already know the approach?"

### 5. Create Task List

Write `.verified/features/{feature-name}/plan.md`:

```markdown
# Implementation Plan: {Feature Name}

## Context
{Brief summary of what we're building, referencing spec.md}

## Tasks

### Phase 1: Setup
- [ ] T001 [P] Create package structure (files: `{path}`)
- [ ] T002 [P] Define domain types (files: `{path}`)

### Phase 2: Core Logic ({Scenario Name})
- [ ] T003 Write test: {scenario description} (files: `{test-file-path}`)
- [ ] T004 Implement: {what} (files: `{file-path}`) (depends on T003)
- [ ] T005 Write test: {edge case} (files: `{test-file-path}`)
- [ ] T006 Handle edge case (files: `{file-path}`) (depends on T005)

### Phase 3: {Next Scenario}
- [ ] T007 Write test: {scenario} (files: `{test-file-path}`)
- [ ] T008 Implement: {what} (files: `{file-path}`) (depends on T007)

### Phase 4: Integration
- [ ] T009 Write integration test: {what} (files: `{test-file-path}`)
- [ ] T010 Wire up {component} (files: `{file-path}`) (depends on T008)

### Phase 5: UI Components (if applicable)
- [ ] T011 [P] Create {Component} (files: `{path}`)
- [ ] T012 [P] Create {Component} (files: `{path}`)
- [ ] T013 Wire up routing/pages (files: `{path}`) (depends on T011, T012)

## Task Legend
- `(files: a, b)` = the file surface this task creates/modifies. REQUIRED — the
  wave engine uses it to detect collisions between same-wave tasks. Declare every
  file the task touches; omitting a shared file hides a real collision.
- `(depends on TXXX)` or `(depends on T001-T003)` = must complete after those tasks.
- `[P]` = human hint that a task is parallelizable. The deterministic wave engine
  (`hooks/lib/waves.js`, step 8a) is authoritative — it derives the real waves from
  `depends on` + `files`, not from `[P]`.

## Verification
- Run the project's verify command after all tasks complete
- Run `/review` for two-stage code review

## Decisions
{Any architectural decisions made during planning — capture as ADR if significant}
```

### 6. Task Rules

Every task must:
- **Be specific** — exact file paths, not "create the handler"
- **Be small** — one commit, describable in one sentence
- **Have clear done criteria** — you know when it's complete
- **Follow test-first order** — test task always before implementation task
- **Reference a scenario** — traces back to spec.md
- **Declare its file surface** — end the task with `(files: path1, path2)` listing
  every file it creates or modifies, plus `(depends on T0XX)` for ordering. Both
  trailers are machine-readable: the wave engine (step 8a) parses them to compute the
  parallel schedule and detect file collisions between same-wave tasks. A task with no
  `(files: …)` cannot be proven independent and will not be safely parallelized.
- **Declare its test boundary** — end every task with a `(test: <type>)` trailer (a
  sanctioned type from the repo's `## Test Types` / the seed taxonomy) and, unless the
  type is `none`, a `(scenario: <id>)` trailer naming a scenario that exists in spec.md.
  Both are machine-checked by the test-gate (step 8a-bis); a task that omits them, or
  uses a sign-off-tier type without approval, will not present.

Task phases should be ordered so:
1. Setup and types first
2. Core logic per scenario (test -> implement pairs)
3. Edge cases and error handling
4. Integration and wiring
5. UI components (if applicable)

### 7. Ask About Decisions

After drafting the plan, ask:
- "Any architectural decisions worth recording? (I can create ADRs)"
- If yes, trigger the ADR agent for each significant decision

### 8. Quality Check

Verify the plan:
- Every acceptance scenario has at least one task
- Every task has a specific file path
- Test tasks precede implementation tasks
- Dependencies are explicit and acyclic
- No task is too large (if it needs multiple commits, split it)

### 8a. Compute Execution Waves (deterministic)

Before critics or approval, compute the parallel execution schedule from the plan's
machine-readable metadata. This is deterministic — a script does the graph math, you
do not eyeball it:

```bash
node ${CLAUDE_PLUGIN_ROOT}/hooks/lib/waves.js compute .verified/features/{feature-name}/plan.md
```

This emits a `plan-waves/v1` JSON contract: `waves` (each inner array runs
concurrently), per-task `depends_on`/`files`/`wave`, `collisions` (same-wave tasks
that touch the same file), `undeclared` (parallel-wave tasks with no declared file
surface), and `parallel`.

Handle the result:
- **Exit code 2 (malformed plan)** — a dependency cycle, unknown task reference, or
  duplicate id. The message names the offender. FIX plan.md and recompute before
  proceeding. Do not present a plan that doesn't compute.
- **`collisions` non-empty** — two same-wave tasks declare the same file. Re-draft so
  they're ordered (`depends on`) or split the file surface, then recompute. Treat like
  a critic `error` (auto-resolve, record in concerns.md).
- **Otherwise** — render the schedule into plan.md under a `## Waves` section: a short
  table of `Wave N → T…, T…` and (optionally) a Mermaid DAG. Render from the JSON;
  never hand-author the waves. `/implement` re-runs this same script to dispatch.

### 8a-bis. Test-Boundary Gate (deterministic)

After waves compute and before critics/approval, run the deterministic test-taxonomy
gate. Like the wave engine, a script does the checking — you do not eyeball whether
tasks declare a sanctioned test type and trace to real scenarios.

First read persisted approvals from
`.verified/features/{feature-name}/test-signoffs.json` (a JSON array of approved task
ids; if the file is absent, treat it as empty). Then run:

```bash
node ${CLAUDE_PLUGIN_ROOT}/hooks/lib/test-gate.js check \
  .verified/features/{feature-name}/plan.md \
  --spec .verified/features/{feature-name}/spec.md \
  --testing .verified/codebase/TESTING.md \
  --approved <comma-separated ids from test-signoffs.json>
```

Omit `--testing` if the repo has no `.verified/codebase/TESTING.md` — the gate falls
back to the seed taxonomy. This emits a `test-gate/v1` JSON contract: `findings`
(severity-coded), a per-task `summary`, and `blocked`.

Handle the result (mirrors the step-8a collision/exit-2 language):
- **Exit code 3 (TAXONOMY_DEFECT)** — the repo's `## Test Types` is malformed (a
  required field is missing). STOP, report the defect to the user, and do NOT present
  the plan. The taxonomy must be fixed before planning can continue.
- **Exit code 2 (blocked)** — there are error findings (`MISSING_TEST_TYPE`,
  `UNKNOWN_TEST_TYPE`, `UNTRACEABLE_TASK`, `DANGLING_SCENARIO`, `UNSERVED_SCENARIO`,
  `MIGRATION_NEEDED`, `SIGNOFF_REQUIRED`). Do NOT present the plan. For each finding,
  make the task declare a sanctioned `(test: <type>)` and — for any type other than
  `none` — a `(scenario: <id>)` that exists in spec.md; ensure every spec scenario is
  served by some task. Fix plan.md and re-run the gate.
  - **`SIGNOFF_REQUIRED` findings** (sign-off-tier types such as `unit` and `none`):
    these are not auto-fixable — they need human judgment. Ask the user to approve each
    such task explicitly (AskUserQuestion or conversational). On approval, append the
    task id to `.verified/features/{feature-name}/test-signoffs.json` and RE-RUN the
    gate with the updated `--approved` list. Record the approval rationale in
    concerns.md. Without approval the task stays blocked and the plan is not presented.
- **Exit code 0 (clean)** — render the gate's `summary` array into plan.md under a
  `## Test Boundaries` table (columns: Task, Test type, Scenarios). Render from the
  JSON; never hand-author this table. If the gate's `findings` still contains any
  `severity: "warning"` entries (e.g. `DIAGRAM_MISSING`), surface them to the user
  alongside the table as non-blocking notes — do not discard them.

`/implement` re-runs this same gate before fanning out each wave, so the plan MUST be
gate-clean (exit 0) before you present it.

### 8a-ter. Scenario Persistence Decision (deterministic)

Record — don't guess — whether this repo's acceptance scenarios should be materialized as
runnable Gherkin `.feature` files, or stay as spec prose traced to tasks. A script detects the
repo's convention; it never forces a Gherkin export on a testdsl/page-object repo.

```bash
node /Users/mike/.claude/plugins/cache/verified-development/verified-development/1.11.0/hooks/lib/bdd-convention.js detect .
```

This emits a `bdd-convention/v1` decision: `convention` (`gherkin` | `none`), `export` (bool), and
the `signals` that fired (`.feature` files present, or a cucumber-family runner — godog / cucumber /
reqnroll / behave / pytest-bdd — in a manifest). Record the decision in plan.md under a
`## Scenario Persistence` note:

- **`export: false`** (no Gherkin convention) — scenarios stay as spec prose; their executable form
  is the tests the executor writes, kept honest by the test-gate's scenario traceability
  (`UNSERVED_SCENARIO`). No `.feature` scaffolding is added. This is the default for testdsl /
  page-object repos.
- **`export: true`** (a Gherkin convention exists) — note that the approved plan's Given/When/Then
  scenarios should be exported to `.feature` files so they run under the repo's cucumber-family
  runner. (The mechanical exporter is a follow-up increment; this step records the decision and the
  signals that warranted it.)

This is a decision record, not a gate — it never blocks the plan.

### 8b. Plan Critics — Plan-Time Stress Test (default on)

Before presenting the plan to the user, dispatch the critic agents in parallel to stress-test it. Skip if `--no-critics` was passed or `.verified/config.json` has `"workflows": { "plan_critics": false }`.

#### Which critics to spawn

Always spawn:
- `verified-development:plan-critic-acceptance` — does every spec scenario / requirement / edge case have a task?
- `verified-development:plan-critic-design` — architecture smells, hidden decisions, missing ADRs, abstraction drift
- `verified-development:plan-critic-strategic` — scope, priorities, dependency cycles, sizing, sequencing

Conditionally spawn:
- `verified-development:plan-critic-ux` — UI/UX coverage. ONLY if `.verified/features/{feature-name}/ui-spec.md` exists. If it does not exist, do NOT spawn it — record `ux: skipped (no ui-spec.md)` in concerns.md.
- `verified-development:plan-critic-parallelization` — are same-wave tasks truly independent? ONLY if step 8a reported `parallel: true` (at least one wave has ≥2 tasks). Pass it the wave engine JSON from step 8a. If the plan is fully sequential, do NOT spawn it — record `parallelization: skipped (no parallel waves)` in concerns.md.

A fully sequential plan with no ui-spec runs three critics; a parallel UI plan runs all five.

#### How to spawn

In a SINGLE message, emit multiple `Task` tool uses (one per applicable critic). They run in parallel. Each receives:
- The feature name
- Paths: `.verified/features/{feature-name}/spec.md`, `plan.md`, optionally `ui-spec.md`
- Pointers to `.verified/codebase/` docs if they exist

Each critic returns a JSON-shaped findings list (≤ 10 findings) with `{critic, severity, description, tied_to, recommendation?}`.

#### Aggregate findings → severity policy

```
severity:
  error       → AUTO-RESOLVE: re-draft plan.md to address. Record in concerns.md as auto-resolved.
                 Examples: missing task for spec scenario, undeclared dependency, type mismatch.
  warning     → SURFACE TO USER: include in the Present-and-Confirm step. Max 10 visible total
                 across all critics, ranked severity-then-critic-order. Record in concerns.md as surfaced.
  suggestion  → RECORD ONLY: write to concerns.md, do NOT show user.
```

Errors are auto-fixed by re-drafting plan.md before showing it to the user. Each auto-fix is logged to concerns.md with a description of what changed (e.g. "added task TXX for scenario S3 per acceptance critic"). Warnings carry forward to step 9. Suggestions are recorded but never shown.

#### concerns.md

Write `.verified/features/{feature-name}/concerns.md` per the template at `plans/adversarial-critique/templates/concerns.template.md`. Sections: critics-that-ran (with status), findings summary by severity, auto-resolved list, surfaced list (with disposition placeholder), recorded-only list, critic errors. This file is preserved after `/plan` completes — it's evidence the gate ran.

#### Critic failure handling

If a critic agent returns an error, times out, or returns malformed output: log it in concerns.md with `status: error` and the message. Surface to the user as part of step 9. A single critic failure does NOT halt the flow — proceed with the remaining critics' results.

### 9. Present and Confirm

Show the plan to the user. Ask:
- "Does this plan look right?"
- "Any tasks missing or in wrong order?"
- "Anything too large that should be split?"

If step 8a ran and produced surfaced warnings, ALSO show them as a numbered list below the plan, severity-ordered, max 10 visible. For each: the critic, the description, and the recommendation. Ask the user to address each by editing the plan, dismissing (with one-line rationale, recorded back into concerns.md), or asking for clarification.

Iterate until approved.

### 10. Update State

Set status to `in-progress` while the user is still reviewing — leave the handoff in place:

```yaml
---
feature: {feature-name}
phase: plan
status: in-progress
last_activity: {YYYY-MM-DD} - Plan draft ({N} tasks), awaiting approval
schema_version: 2
---
```

Only set status to `complete` AFTER the user explicitly approves the plan. On completion, clear the handoff and set `next_action`:

```bash
node ${CLAUDE_PLUGIN_ROOT}/hooks/lib/handoff.js clear .verified/features/{feature-name}
```

```yaml
active_phase: ""
next_action: "/implement"
next_phases: ["implement"]
```

### 11. Suggest Next Step

```
Plan complete: .verified/features/{feature-name}/plan.md
{N} tasks across {M} phases

Next: Run /implement {feature-name} to start TDD execution.
```

## Important

- The plan IS the executable prompt — be concrete, not vague
- "Create the authentication handler" is bad. "Create AuthHandler in src/auth/handler with LoginEndpoint accepting POST /auth/login" is good.
- Don't plan more than ~20 tasks per feature. If it's bigger, the feature should be split.
- Test tasks and implementation tasks are separate — this enforces TDD discipline
- Don't over-read the codebase — gather enough context to plan, then STOP reading and START writing. If you've read more than 15 files without writing, you have enough context.
- Never make up commands — verify build/run/generate commands by reading package.json, Justfile, or Makefile before referencing them in the plan
- Understand existing patterns before adding new ones — read how similar things are done in the project, don't invent new conventions
- Status stays `in-progress` until user explicitly approves

### No Placeholders Rule

These are **plan failures** — never write them:
- "TBD", "TODO", "implement later", "fill in details"
- "Add appropriate error handling" / "add validation" / "handle edge cases"
- "Write tests for the above" (without specifying WHAT to test)
- "Similar to Task N" (repeat the specifics — executors may read tasks independently)
- Steps that describe what to do without showing how
- References to types, functions, or methods not defined in any task

Every task must contain the actual detail an executor needs to implement it. If you can't be specific, you don't understand the problem well enough — go back and research.

### Plan Self-Review

After writing the plan, review it:
1. **Spec coverage** — skim each requirement in spec.md. Can you point to a task that implements it? List gaps.
2. **Placeholder scan** — search for any "No Placeholders" violations above. Fix them.
3. **Type consistency** — do names used in later tasks match what you defined in earlier tasks?
4. **Command verification** — are all commands (test, build, generate) verified from actual project files?

Fix issues inline. If you find a spec requirement with no task, add the task.
