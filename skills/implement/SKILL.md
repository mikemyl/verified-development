---
name: implement
description: "Required for code in .verified/ projects. Strict TDD via thin-orchestrator executor agents."
version: 0.1.0
---

Execute an implementation plan using strict TDD. This is Phase 3 of the verified development workflow.

## Process

### 1. Determine Feature

- If feature name provided as argument → use it
- If no argument → read `.verified/state.md` for the current feature
- If no argument and no state → ask the user which feature to implement

### 2. Load Context

- Read `.verified/features/{feature-name}/plan.md` — MUST exist
- Read `.verified/features/{feature-name}/spec.md` — for acceptance scenarios
- Read `.verified/features/{feature-name}/ui-spec.md` — if it exists
- Read `.verified/state.md` — check current position
- Read `.verified/config.json` — thresholds
- Read `.verified/codebase/` docs if they exist — these guide implementation:
  - `CONVENTIONS.md` — follow established patterns, naming, error handling
  - `TESTING.md` — use existing test patterns, fixtures, DSL
  - `ARCHITECTURE.md` — understand where code fits in the system
  - `CONCERNS.md` — avoid known pitfalls and tech debt patterns

If plan.md doesn't exist, tell the user to run `/plan` first.

### 2a. Open Handoff (or Resume Existing)

This phase is interruptible at every plan-task boundary. Wire format: see `skills/pause/SKILL.md`.

If `.verified/features/{feature-name}/handoff.json` already exists with `phase: "implement"`, read it (`hooks/lib/handoff.js read`) — its `completed_tasks` and `remaining_tasks` are the source of truth for "where am I." Use it to decide which task to start, NOT a fresh scan of plan.md (the plan.md `[x]` marks are also valid; use whichever is more recent — `git log -1 plan.md` vs handoff `timestamp`).

If no handoff exists, write the initial one. Parse plan.md's task list (each `- [ ] T###` line) into `remaining_tasks` with `id` = task number and `title` = task description. `completed_tasks` is empty. Set `phase: "implement"`, current `git_head`, ISO `timestamp`.

### 3. Verify Work Matches Plan

Before starting any implementation:
- If the user described specific work to do, check if it matches a task in plan.md
- If the work IS in the plan → proceed
- If the work is NOT in the plan → STOP. Tell the user:
  "This work isn't in the current plan. Options: (a) /update-plan to add it, (b) /specify as a new feature, (c) /quick for a small standalone fix."
- NEVER implement unplanned work inline, even if it seems small

### 4. Resume or Start

If state.md shows implementation already in progress:
- Find the last completed task in plan.md (marked with [x])
- Resume from the next uncompleted task
- Show: "Resuming from task T{NNN}: {description}"

If starting fresh:
- Show: "Starting implementation: {N} tasks across {M} phases"

### 4. Execute Tasks — Thin Orchestrator Pattern

**You (the main agent) are the orchestrator. You do NOT write code yourself.** You:
- Load the neutral `testing` skill, then resolve the repo's test runner and idioms via this priority ladder: (1) `.verified/codebase/TESTING.md` is authoritative when present; (2) else infer the dominant framework and assertion style from the repo's existing test files; (3) else fall back to the neutral `testing` skill with no idiom assumptions and proceed. For Go repos (`go.mod`), additionally apply `tdd-go` as the one bundled language example.
- Analyze task dependencies
- Group tasks into waves (independent tasks run in parallel)
- Spawn `executor` agents to do the actual implementation — tell each executor which TDD skill to follow
- Collect results and handle failures
- Update state

This keeps your context clean for orchestration decisions while executors get fresh context for each wave of work.

#### Wave Analysis (deterministic)

Do NOT eyeball the waves. Compute them with the same engine `/plan` used, so the
schedule is identical and auditable:

```bash
node ${CLAUDE_PLUGIN_ROOT}/hooks/lib/waves.js compute .verified/features/{feature-name}/plan.md
```

The `plan-waves/v1` JSON gives you `waves` (each inner array is one wave that runs
concurrently), per-task `files`/`depends_on`, `collisions`, and `undeclared`. Dispatch
wave by wave, in order.

**Collision gate — non-negotiable.** Before dispatching a wave concurrently:
- Engine exits 2 (cycle / unknown ref / duplicate id) → STOP. The plan is malformed;
  tell the user to `/update-plan`.
- `collisions` lists any pair in this wave → do NOT run those two tasks in parallel.
  Run the wave sequentially, or group the colliding tasks into a single executor.
- A wave member is in `undeclared` (no declared file surface) → you cannot prove it is
  independent. Group it conservatively or run it sequentially; never fan it out blind.

Only same-wave tasks with disjoint, declared file surfaces go to separate parallel
executors. Completed (`[x]`) tasks are skipped — use handoff.json `remaining_tasks`
to know what's left, but take the wave ORDER from the engine.

**Test-boundary gate — non-negotiable.** Before dispatching ANY wave, re-run the same
deterministic gate `/plan` ran. A plan can drift if edited between phases, so
`/implement` re-checks it rather than trusting the prior pass. Read prior approvals from
`.verified/features/{feature-name}/test-signoffs.json` (absent → empty), then:

```bash
node ${CLAUDE_PLUGIN_ROOT}/hooks/lib/test-gate.js check \
  .verified/features/{feature-name}/plan.md \
  --spec .verified/features/{feature-name}/spec.md \
  --testing .verified/codebase/TESTING.md \
  --approved <ids from test-signoffs.json>
```

Omit `--testing` if the repo has no `.verified/codebase/TESTING.md` (the gate falls back
to the shipped seed taxonomy). Handle the exit code:
- Exit 3 (malformed repo `## Test Types`) → STOP. The repo taxonomy is broken; tell the
  user to fix `TESTING.md` before implementing.
- Exit 2 (blocked) → do NOT dispatch any wave. If the findings are `MIGRATION_NEEDED`
  (a pre-grammar plan with no `(test: …)`/`(scenario: …)` trailers), say so explicitly
  and tell the user to `/update-plan` to add test-type + scenario trailers — never fail
  opaquely. For other error findings, name them and stop.
- Exit 0 → proceed to dispatch waves as normal.

This keeps `/implement` consistent with the gate `/plan` already passed.

#### Rollback anchors & declared-scope advisory

These are deterministic — never guess a revert SHA or eyeball scope. Both use `hooks/lib/waves.js`.

**Record rollback anchors.** Capture the current short SHA as `plan-start` before dispatching
wave 1, and as `wave-start` before each wave (and `slice-start` before a single executor when a
wave runs sequentially). A task carrying a `(rollback: …)` trailer resolves its revert boundary
from these — pass the recorded anchors to `resolveRollback(task.rollback, anchors)`; it throws
rather than fall back to `HEAD` if the anchor/ref can't resolve. If a wave's tests can't be made
green, revert to the failed task's resolved rollback point rather than unwinding by hand.

**Run the scope advisory after each wave.** Diff what executors actually wrote
(`git diff --name-only`) and, for each task, call
`declaredScopeAdvisory(task, touchedFiles)`. Surface any returned lines as an ADVISORY (never a
block) — they flag a task that reached beyond its declared `(files: …)` surface. Invariant
*commands* are not writes, so they never appear here.

#### Spawning Executors

For each wave, spawn `executor` agents (subagent_type: `verified-development:executor`):

- **Parallel wave**: Spawn one executor per task (or group related tasks into one executor if they share files)
- **Sequential wave**: Spawn one executor for the sequential chain
- Always use `verified-development:executor` — never use agents from other plugins

Each executor receives:
- Its assigned tasks (T-numbers, descriptions, file paths)
- The spec.md (for acceptance scenario context)
- Instruction to read `.verified/codebase/TESTING.md` and `CONVENTIONS.md` for project patterns
- Instruction to follow TDD: RED → GREEN → REFACTOR (except for config/schema/generated code)
- Instruction to mark tasks `[x]` in plan.md when complete

#### Collecting Results

After each wave completes:
- Read plan.md to verify tasks were marked `[x]`
- Run the full test suite to verify nothing broke
- If an executor reported BLOCKED tasks, decide: fix the blocker and re-dispatch, or flag for user. If you cannot resolve a blocker now, add it to handoff `blockers` with `severity: blocking` (so a `/continue` later cannot proceed past it without addressing) or `severity: advisory`.
- **Update handoff.json**: move just-completed tasks from `remaining_tasks` to `completed_tasks` via `hooks/lib/handoff.js update`. Refresh `git_head` to current short SHA. This is the per-wave checkpoint — if context dies between waves, `/continue` lands here.
- Show progress: "Wave {N} complete. {completed}/{total} tasks done. {remaining} remaining."
- Update state.md `last_activity`.

#### When NOT to Spawn Agents

For very small implementations (1-3 tasks, simple changes), you may implement directly instead of spawning. Use your judgment — the overhead of spawning isn't worth it for trivial tasks.

### 5. Phase Transitions

When all tasks in a plan phase complete:
- Run the full test suite to verify nothing broke
- Show progress: "Phase {N} complete. {M} tasks remaining."
- Continue to next phase

### 7. Verify All Tasks Complete

Before declaring implementation done, read plan.md and count:
- Total tasks (lines matching `- [ ]` or `- [x]`)
- Completed tasks (lines matching `- [x]`)
- Blocked tasks (lines matching `- [!]`)

If uncompleted tasks remain:
- List them: "Tasks still open: T010, T011, T013"
- Ask: "Continue implementing, or descope these with /update-plan?"
- Do NOT proceed to step 8 until all tasks are either `[x]` or `[!]`

### 8. Implementation Complete

When all tasks are done (checked off or explicitly blocked/descoped):

1. Run the full test suite (use the project's test command with all safety flags enabled):

2. Clear the handoff (the phase is done):

   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/hooks/lib/handoff.js clear .verified/features/{feature-name}
   ```

3. Update state:
   ```yaml
   ---
   feature: {feature-name}
   phase: implement
   status: complete
   last_activity: {YYYY-MM-DD} - Implementation complete ({N} tasks)
   active_phase: ""
   next_action: "/verify"
   next_phases: ["verify"]
   schema_version: 2
   ---
   ```

4. Write summary to `.verified/features/{feature-name}/summary.md`:
   ```markdown
   # Implementation Summary: {Feature Name}

   **Completed:** {YYYY-MM-DD}
   **Tasks:** {completed}/{total}

   ## What Was Built
   - {key files created/modified}

   ## Test Coverage
   - {N} test files created
   - {N} test cases
   - Property tests: {yes/no}

   ## Decisions Made
   - {any decisions captured as ADRs}
   ```

5. Suggest next steps:
   ```
   Implementation complete: {N} tasks done

   NEXT STEPS (in order — do NOT skip):
     1. /verify — Run full verification pipeline
     2. /review — Run two-stage code review
     3. Then: human review and commit

   Do NOT commit until /verify and /review have both passed.
   ```

## Deviation Handling

If during implementation you discover the plan is wrong:
- **Minor deviation** (different function name, slightly different API): Proceed, note in summary
- **Major deviation** (new dependency, different architecture, missing requirement): STOP
  - Explain the deviation to the user
  - Ask: "Should I update the plan, or proceed with this approach?"
  - If significant, capture as ADR
  - Update plan.md if the user approves the change

## Important

- Write a failing test before production code — EXCEPT for:
  - Config/schema changes (CMS collections, database schemas, codegen configs)
  - Generated code (running codegen tools, type generation)
  - Build/infra changes (Justfile recipes, CI config, Dockerfile)
  These don't need TDD — they're validated by the tools that consume them.
- Never claim tests pass without showing actual output
- Never suggest committing during implementation — commits happen AFTER /verify and /review pass
- If a task is too large during implementation, split it on the fly (update plan.md)
- If you discover a missing scenario, note it but don't add scope — flag for the user
- Update state.md after each task completion to track progress
- When all tasks are done, the workflow is: /verify → /review → human review → commit
- Do NOT prompt the user to commit after completing tasks — prompt them to run /verify instead
