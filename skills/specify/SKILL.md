---
name: specify
description: >-
  Create a feature specification with acceptance scenarios, requirements, and
  success criteria. Use when the user invokes /specify or asks to define a feature,
  write requirements, create acceptance scenarios, or start a new feature.
version: 0.1.0
---

Create a specification for a new feature. This is Phase 1 of the verified development workflow.

## Process

### 1. Parse Arguments

- First argument: feature name (kebab-case, e.g., `user-authentication`)
- Remaining text: optional brief description of the feature
- If no arguments provided, ask the user what feature they want to specify

### 2. Load Project Context

Read `.verified/state.md` if it exists:
- If a feature is currently in-progress in a later phase (implement, verify, review), warn the user they're starting a new feature while another is incomplete
- This is a warning, not a block — the user may intentionally work on multiple features

Read `.verified/codebase/` docs if they exist — these inform specification:
- `ARCHITECTURE.md` — understand what already exists to avoid re-specifying
- `INTEGRATIONS.md` — know current external services and boundaries
- `CONVENTIONS.md` — use consistent domain language in scenarios
- `CONCERNS.md` — be aware of risks when specifying new features

### 3. Create Feature Directory

```bash
mkdir -p .verified/features/{feature-name}
```

### 4. Gather Context

If the user provided a description, use it as starting context. Then ask targeted questions to fill gaps. Focus on:

1. **Who uses this?** (user role, system, scheduled job)
2. **What triggers it?** (user action, API call, event, timer)
3. **What's the happy path?** (main success scenario)
4. **What can go wrong?** (error cases, edge cases, invalid input)
5. **What are the boundaries?** (limits, thresholds, constraints)
6. **How do you know it works?** (observable outcomes, measurable criteria)

Ask questions conversationally — not a rigid checklist. Adapt based on what the user says. Stop when you have enough to write scenarios.

### 5. Write Specification

Load the specification skill for guidance on format and quality.

Write `.verified/features/{feature-name}/spec.md` following the template:

```markdown
# Feature: {Feature Name}

## Context
{Why this feature exists and who benefits}

## Acceptance Scenarios
{Given/When/Then for each scenario}

## Requirements
{FR-001, FR-002, ... — numbered, testable}

## Edge Cases
{EC-001, EC-002, ... — boundary conditions}

## Success Criteria
{SC-001, SC-002, ... — measurable outcomes}
```

Always include these standard success criteria:
- Every acceptance scenario has a corresponding test
- Mutation score >= 60% on feature package
- All verification gates pass (the project's verify command)

### 6. Quality Check

Run through the spec quality checklist:
- Every scenario is independent
- No implementation details
- Every requirement is testable
- Edge cases cover boundaries (zero, empty, negative, maximum)
- Success criteria are measurable
- Maximum 3 [NEEDS CLARIFICATION] markers

If issues found, fix them before presenting to the user.

### 7. Present and Confirm

Show the complete spec to the user. Ask:
- "Does this capture what you want to build?"
- "Any scenarios missing?"
- "Any requirements I got wrong?"

Iterate based on feedback until the user approves.

### 8. Update State

Create or update `.verified/state.md`:

```yaml
---
feature: {feature-name}
phase: specify
status: complete
last_activity: {YYYY-MM-DD} - Specification complete
---
```

If `.verified/config.json` doesn't exist, create it with defaults:

```json
{
  "language": "{detected or asked}",
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

### 9. Suggest Next Step

```
Specification complete: .verified/features/{feature-name}/spec.md

Next: Run /plan {feature-name} to create the implementation plan.
     Or /ui-spec {feature-name} if this feature has a UI.
```

## Important

- Never include implementation details in the spec (no database names, no API frameworks, no specific libraries)
- If the user describes implementation ("use Redis for caching"), translate to requirement ("cache with max 5 min staleness")
- Edge cases are critical — they become the boundary tests that kill mutants
- The spec is the source of truth for the spec-compliance review agent in Phase 5
