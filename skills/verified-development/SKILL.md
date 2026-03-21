---
name: verified-development
description: >-
  Specification-first verified development workflow. Use when starting development work,
  planning features, setting up projects, or working in any project with a .verified/ directory.
  Triggers on: "verified development", "specification-first", "verification pipeline",
  "acceptance scenarios", "layered verification", project setup, feature planning,
  or any discussion about development workflow and quality gates.
version: 0.1.0
---

# Verified Development

A specification-first development methodology with layered verification gates and review agents. Every feature starts as a specification, is implemented through TDD, verified mechanically, and reviewed by specialized agents before human review.

## Core Principles

1. **Acceptance scenarios before implementation** - Given/When/Then defined before any code is written
2. **Layered verification** - lint, test, coverage, mutation, security, dead code — all must pass
3. **Numeric thresholds** - coverage >=80%, mutation >=60%, complexity <=10 — no exceptions
4. **Single verify command** - the project's verify command runs everything; all must pass, no warnings tolerated
5. **No tautological tests** - tests encode expected outputs, never reimplement function logic
6. **No vaporware** - every package imported by non-test code, every table touched by DML
7. **Two-stage review** - spec-compliance first (right thing?), then quality (right way?)

## The 5-Phase Workflow

```
SPECIFY  ->  PLAN  ->  IMPLEMENT  ->  VERIFY  ->  REVIEW
```

### Phase 1: Specify

Define WHAT to build. No implementation details.

- Write acceptance scenarios in Given/When/Then format
- Define functional requirements (numbered, testable: FR-001, FR-002)
- Set measurable success criteria (SC-001, SC-002)
- Identify edge cases and boundary conditions
- Output: `.verified/features/{feature-name}/spec.md`

Rules:
- Focus on WHAT and WHY, never HOW
- Every requirement must be independently testable
- Mark ambiguities as `[NEEDS CLARIFICATION]` (max 3)
- Acceptance scenarios map directly to test cases

### Phase 2: Plan

Define HOW to build it. Break spec into ordered tasks.

- Create ordered task list with exact file paths
- Test-first ordering: test file created before implementation file
- Mark parallelizable tasks with `[P]`
- Each task fits in a single commit, describable in one sentence
- Output: `.verified/features/{feature-name}/plan.md`

Rules:
- Every task has clear done criteria
- Tasks reference specific acceptance scenarios they satisfy
- Dependencies between tasks are explicit
- Plan IS the executable prompt — concrete, not vague

### Phase 3: Implement

Execute the plan using strict TDD.

For each task:
1. **RED** - Write a failing test that describes desired behavior
2. **GREEN** - Write minimum code to make the test pass
3. **REFACTOR** - Improve structure, commit, then refactor separately

Rules:
- Never write production code without a failing test
- Table-driven tests with boundary values that kill mutants
- Property-based tests for invariants (e.g., "result is never negative")
- Atomic commits per task (independently revertable)
- Verification evidence required: paste actual test output before claiming done

### Phase 4: Verify

Run the mechanical verification pipeline.

- Execute the project's verify command — the single pass/fail gate
- All layers must pass: lint, test, coverage, mutation, security, dead code, build
- All thresholds must be met (no "close enough")
- Fix any failures before proceeding

This phase is language-specific. See the language skill (e.g., `go-verified-development`) for exact tools and thresholds.

### Phase 5: Review

Two-stage review by specialized agents.

**Stage 1: Spec Compliance** (always runs first)
- Does every acceptance scenario have a corresponding test?
- Does the implementation satisfy all functional requirements?
- Is there scope creep beyond the specification?
- MUST pass before Stage 2 runs

**Stage 2: Quality Review** (targeted agents based on what changed)
- Test quality, security, complexity, error handling, documentation, etc.
- Each agent returns: pass/warn/fail with specific findings
- Correction context: structured feedback, max 2 fix iterations
- Then: human review as final gate

## State Management

```
.verified/
  project.md              # Project principles and constraints
  state.md                # Current position, status, decisions
  config.json             # Thresholds, workflow toggles, language
  design-system.md        # UI tokens — colors, typography, spacing (from /ui-spec)
  assessment.md           # Gap analysis (from /assess)
  codebase/               # Living project context (from /map, updated after /review)
    ARCHITECTURE.md       # Package structure, patterns, data flow
    CONVENTIONS.md        # Coding style, naming, error handling patterns
    STACK.md              # Languages, frameworks, dependencies
    STRUCTURE.md          # Directory layout, entry points, module boundaries
    TESTING.md            # Test infrastructure, patterns, coverage
    INTEGRATIONS.md       # External services, APIs, auth
    CONCERNS.md           # Tech debt, risks, gotchas
  decisions/              # Architecture Decision Records (from ADR agent)
    DEC-001-*.md
  features/
    {feature-name}/
      spec.md             # Acceptance scenarios, requirements
      ui-spec.md          # Screen specs, components, interactions (optional)
      plan.md             # Ordered tasks with file paths
      summary.md          # Execution outcomes
      review.md           # Review findings
```

### state.md

Tracks current workflow position. Read this first in every session.

```yaml
---
feature: {current feature name}
phase: {specify|plan|implement|verify|review}
status: {in-progress|blocked|complete}
last_activity: {YYYY-MM-DD - what happened}
---
```

### config.json

```json
{
  "language": "go",
  "thresholds": {
    "coverage": 80,
    "mutation": 60,
    "cyclomatic_complexity": 10,
    "cognitive_complexity": 15
  },
  "workflows": {
    "require_spec": true,
    "require_review": true,
    "require_verify": true
  }
}
```

## Working Rules for AI Agents

1. **Read state.md first** in every session to know where you are
2. **Never skip phases** — specify before plan, plan before implement
3. **Fresh test output is evidence** — never claim tests pass without showing output
4. **Commits capture outcomes** — atomic, one per task, message describes the what
5. **Ask before committing** — verify with the user, never auto-commit
6. **Small increments** — each step leaves codebase working with all tests passing
7. **No speculative code** — every line must be driven by a failing test
8. **No hallucinated imports** — verify every dependency exists before using it
