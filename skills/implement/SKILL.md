---
name: implement
description: >-
  You MUST use this for ALL implementation work in verified-development projects.
  Executes plans using strict TDD with the thin orchestrator pattern — spawns
  executor agents, never writes code directly. Triggers on: /implement,
  "start coding", "execute the plan", "implement", "build this", or any request
  to write code in a project with .verified/ and an approved plan.
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

### 3. Resume or Start

If state.md shows implementation already in progress:
- Find the last completed task in plan.md (marked with [x])
- Resume from the next uncompleted task
- Show: "Resuming from task T{NNN}: {description}"

If starting fresh:
- Show: "Starting implementation: {N} tasks across {M} phases"

### 4. Execute Tasks — Thin Orchestrator Pattern

**You (the main agent) are the orchestrator. You do NOT write code yourself.** You:
- Detect the project language and load the appropriate TDD skill:
  - Go projects (go.mod): load `tdd-go` skill
  - TypeScript projects (tsconfig.json): load `tdd` skill (citypaul's)
- Analyze task dependencies
- Group tasks into waves (independent tasks run in parallel)
- Spawn `executor` agents to do the actual implementation — tell each executor which TDD skill to follow
- Collect results and handle failures
- Update state

This keeps your context clean for orchestration decisions while executors get fresh context for each wave of work.

#### Wave Analysis

Read plan.md and group tasks into waves based on dependencies:

```
Wave 1: T001, T002, T005 [P] — no dependencies, run in parallel
Wave 2: T003 (depends on T001), T004 (depends on T001-T003) — sequential
Wave 3: T006-T009 [P] — independent, run in parallel
...
```

Tasks marked `[P]` or in the same plan phase with no `(depends on)` can be parallelized.

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
- If an executor reported BLOCKED tasks, decide: fix the blocker and re-dispatch, or flag for user
- Show progress: "Wave {N} complete. {completed}/{total} tasks done. {remaining} remaining."
- Update state.md with current position

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

2. Update state:
   ```yaml
   ---
   feature: {feature-name}
   phase: implement
   status: complete
   last_activity: {YYYY-MM-DD} - Implementation complete ({N} tasks)
   ---
   ```

3. Write summary to `.verified/features/{feature-name}/summary.md`:
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

4. Suggest next steps:
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
