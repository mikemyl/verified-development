---
name: implement
description: >-
  Execute an implementation plan using strict TDD — RED-GREEN-REFACTOR per task,
  atomic commits, verification evidence. Use when the user invokes /implement
  or asks to start coding, execute the plan, or implement a feature.
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

### 4. Execute Tasks

For each task in plan.md, follow the TDD cycle. Load the `tdd` skill for guidance.

**For test tasks (odd-numbered typically):**

1. **RED** — Write the failing test
   - Follow the project's test conventions (read `.verified/codebase/TESTING.md`)
   - Boundary values that kill mutants
   - Property-based tests for invariants where applicable
2. Run the test using the project's test command — show it fails
3. Show the failing output as evidence

**For implementation tasks (even-numbered typically):**

1. **GREEN** — Write minimum code to pass the test
   - Only what's needed to satisfy the failing test
   - No anticipatory code
2. Run the test — show it passes
3. Show passing output as evidence
4. **REFACTOR** — Improve structure if needed
   - Run tests again after refactoring
5. Ask user before committing

### 5. Task Completion

After each task:
- Mark task as complete in plan.md: `- [x] T{NNN} ...`
- Update state.md with current position and task count
- Continue to next task — do NOT suggest committing yet
- Commits happen after ALL tasks complete, /verify passes, and /review passes

### 6. Phase Transitions

When all tasks in a plan phase complete:
- Run the full test suite to verify nothing broke
- Show progress: "Phase {N} complete. {M} tasks remaining."
- Continue to next phase

### 7. Implementation Complete

When all tasks done:

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

- Never write production code without a failing test first
- Never claim tests pass without showing actual output
- Never suggest committing during implementation — commits happen AFTER /verify and /review pass
- If a task is too large during implementation, split it on the fly (update plan.md)
- If you discover a missing scenario, note it but don't add scope — flag for the user
- Update state.md after each task completion to track progress
- When all tasks are done, the workflow is: /verify → /review → human review → commit
- Do NOT prompt the user to commit after completing tasks — prompt them to run /verify instead
