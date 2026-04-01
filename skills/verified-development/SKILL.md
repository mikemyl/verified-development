---
name: verified-development
description: >-
  You MUST follow this workflow for ALL development work in projects with a .verified/ directory.
  This is non-negotiable. At the START of every session, read .verified/state.md to know the
  current feature, phase, and status — then tell the user where things stand before doing
  anything else. Before writing ANY code, building ANY feature, or fixing ANY bug, check if
  .verified/ exists — if it does, this workflow governs all work.
  Also triggers on: "verified development", "specification-first", "verification pipeline",
  "acceptance scenarios", project setup, feature planning, "continue", "let's keep going".
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

### Workflow Order (NEVER skip or reorder)
1. **Specify** → 2. **Plan** → 3. **Implement** → 4. **Verify** → 5. **Review** → 6. **Commit**

NEVER commit code without completing /verify AND /review first. This is the most important rule.

### Evidence Before Assertions (Iron Law)

**NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE.**

Before claiming anything works, passes, or is done:
1. Identify what command proves the claim
2. Run it (fresh, complete — not a cached result)
3. Read the full output
4. Only then make the claim WITH the evidence

Using "should pass", "looks correct", "probably works" = lying, not verifying. Run the command.

| Claim | Requires | NOT Sufficient |
|-------|----------|----------------|
| Tests pass | Test output: 0 failures | Previous run, "should pass" |
| Lint clean | Linter output: 0 errors | Partial check |
| Build succeeds | Build output: exit 0 | "Linter passed" |
| Bug fixed | Regression test: red → green | "Code changed" |
| Task complete | All of the above | "Looks done" |

### During Implementation
1. **Read state.md first** in every session to know where you are
2. **Never skip phases** — specify before plan, plan before implement
3. **No speculative code** — every line must be driven by a failing test
4. **No hallucinated imports** — verify every dependency exists before using it
5. **Small increments** — each step leaves codebase working with all tests passing
6. **Use verified-development agents only** — never use agents from other plugins (gsd-executor, superpowers, etc.)
7. **Update plan.md** — mark tasks `[x]` as completed, keep state.md current
8. **Check for uncompleted tasks** — before declaring implementation done, verify ALL tasks in plan.md are checked off

### After Implementation
9. **Run /verify** — the single mechanical gate. ALL targets must pass.
10. **Run /review** — two-stage review. Spec compliance first, then quality agents.
11. **Fix review findings** — correction loop, max 2 iterations
12. **THEN commit** — only after verify + review both pass
13. **Never prompt to commit** during or right after implementation — prompt to run /verify instead

### When Debugging

**NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST.**

If you encounter a bug, test failure, or unexpected behavior:
1. **Read error messages carefully** — they often contain the exact solution
2. **Reproduce consistently** — can you trigger it reliably?
3. **Check recent changes** — git diff, what changed?
4. **Form a single hypothesis** — "I think X because Y"
5. **Test minimally** — smallest possible change, one variable at a time
6. **If fix doesn't work** — form NEW hypothesis, don't stack more fixes

**If 3+ fixes have failed: STOP.** Question whether the approach/architecture is fundamentally wrong. Discuss with the user before attempting more fixes. Three failed fixes = architectural problem, not a bug.

Red flags — if you catch yourself thinking these, STOP and return to step 1:
- "Quick fix for now, investigate later"
- "Just try changing X and see if it works"
- "I don't fully understand but this might work"
- "One more fix attempt" (after 2+ failures)
