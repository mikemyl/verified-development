---
name: plan
description: >-
  Create an implementation plan from a feature specification — ordered tasks,
  file paths, test-first sequencing. Use when the user invokes /plan or asks
  to plan implementation, break down a feature, or create a task list.
version: 0.1.0
---

Create an implementation plan for a feature. This is Phase 2 of the verified development workflow.

## Process

### 1. Load Context

- Read `.verified/features/{feature-name}/spec.md` — MUST exist
- Read `.verified/features/{feature-name}/ui-spec.md` — if it exists (UI features)
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

### 2. Analyze Specification

Break down the spec into implementation units:
- Each acceptance scenario -> one or more tasks
- Each requirement -> implementation work
- Each edge case -> boundary test cases
- UI screens -> component tasks (if ui-spec exists)

### 3. Research (if needed)

If the implementation requires unfamiliar libraries, patterns, or APIs:
- Research the specific question (don't do broad exploration)
- Document findings briefly in the plan
- Note any decisions made — prompt for ADR capture if significant

Ask the user: "I need to research {topic} before planning. Should I proceed, or do you already know the approach?"

### 4. Create Task List

Write `.verified/features/{feature-name}/plan.md`:

```markdown
# Implementation Plan: {Feature Name}

## Context
{Brief summary of what we're building, referencing spec.md}

## Tasks

### Phase 1: Setup
- [ ] T001 [P] Create package structure at {path}
- [ ] T002 [P] Define domain types in {path}

### Phase 2: Core Logic ({Scenario Name})
- [ ] T003 Write test: {scenario description} in {test-file-path}
- [ ] T004 Implement: {what} in {file-path} (depends on T003)
- [ ] T005 Write test: {edge case} in {test-file-path}
- [ ] T006 Handle edge case in {file-path} (depends on T005)

### Phase 3: {Next Scenario}
- [ ] T007 Write test: {scenario} in {test-file-path}
- [ ] T008 Implement: {what} in {file-path} (depends on T007)

### Phase 4: Integration
- [ ] T009 Write integration test: {what} in {test-file-path}
- [ ] T010 Wire up {component} in {file-path}

### Phase 5: UI Components (if applicable)
- [ ] T011 [P] Create {Component} at {path}
- [ ] T012 [P] Create {Component} at {path}
- [ ] T013 Wire up routing/pages in {path}

## Task Legend
- [P] = Parallelizable (no dependencies on other tasks in same phase)
- (depends on TXXX) = Must complete after specified task

## Verification
- Run the project's verify command after all tasks complete
- Run `/review` for two-stage code review

## Decisions
{Any architectural decisions made during planning — capture as ADR if significant}
```

### 5. Task Rules

Every task must:
- **Be specific** — exact file paths, not "create the handler"
- **Be small** — one commit, describable in one sentence
- **Have clear done criteria** — you know when it's complete
- **Follow test-first order** — test task always before implementation task
- **Reference a scenario** — traces back to spec.md

Task phases should be ordered so:
1. Setup and types first
2. Core logic per scenario (test -> implement pairs)
3. Edge cases and error handling
4. Integration and wiring
5. UI components (if applicable)

### 6. Ask About Decisions

After drafting the plan, ask:
- "Any architectural decisions worth recording? (I can create ADRs)"
- If yes, trigger the ADR agent for each significant decision

### 7. Quality Check

Verify the plan:
- Every acceptance scenario has at least one task
- Every task has a specific file path
- Test tasks precede implementation tasks
- Dependencies are explicit and acyclic
- No task is too large (if it needs multiple commits, split it)

### 8. Present and Confirm

Show the plan to the user. Ask:
- "Does this plan look right?"
- "Any tasks missing or in wrong order?"
- "Anything too large that should be split?"

Iterate until approved.

### 9. Update State

```yaml
---
feature: {feature-name}
phase: plan
status: complete
last_activity: {YYYY-MM-DD} - Plan complete ({N} tasks)
---
```

### 10. Suggest Next Step

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
