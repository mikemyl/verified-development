---
name: specification
description: >-
  How to write feature specifications for verified development. Use when creating
  acceptance scenarios, defining requirements, writing Given/When/Then criteria,
  or working on spec.md files. Triggers on: "write a spec", "acceptance scenarios",
  "feature specification", "Given/When/Then", "requirements", "what should we build",
  or when creating files in .verified/features/.
version: 0.1.0
---

# Writing Feature Specifications

A specification defines WHAT to build and WHY — never HOW. It is the source of truth for what the implementation must satisfy. Every acceptance scenario maps to test cases; the spec-compliance review agent validates coverage.

## Spec Format

Specifications live at `.verified/features/{feature-name}/spec.md`.

### Template

```markdown
# Feature: {Feature Name}

## Context

{1-3 sentences: What is this feature? Why does it matter? Who benefits?}

## Acceptance Scenarios

### Scenario: {Descriptive name}
Given {precondition}
When {action}
Then {expected outcome}
And {additional outcome if needed}

### Scenario: {Another scenario}
Given {precondition}
When {action}
Then {expected outcome}

## Requirements

- FR-001: {System MUST/SHOULD do X}
- FR-002: {System MUST/SHOULD do Y}

## Edge Cases

- EC-001: {What happens when X is empty/nil/zero?}
- EC-002: {What happens when X exceeds maximum?}

## Success Criteria

- SC-001: {Measurable outcome — e.g., "Response time < 200ms"}
- SC-002: {Every scenario above has a corresponding test}
- SC-003: {Mutation score >= 60% on feature package}
```

## Writing Rules

### Focus on WHAT, never HOW

Bad:
> FR-003: System MUST use a Redis cache with TTL of 300 seconds

Good:
> FR-003: System MUST cache lookups with a maximum staleness of 5 minutes

The spec survives technology changes. If you switch from Redis to Memcached, the spec doesn't change.

### Every requirement must be testable

Bad:
> FR-004: System SHOULD be fast and responsive

Good:
> FR-004: System MUST respond to search queries within 200ms at p95

If you can't write a test for it, it's not a requirement — it's a wish.

### Scenarios are test cases

Each acceptance scenario maps directly to one or more test cases:

```
Scenario: Gold customer gets 10% discount
Given a customer with tier "gold"
When they place an order for $100.00
Then the total is $90.00
```

Becomes a row in a table-driven test:
```go
{"gold customer 10% discount", "gold", 100.00, 90.00},
```

### Edge cases kill mutants

Edge cases define the boundary values that catch mutations:

```
EC-001: Zero-value order returns $0.00 regardless of discount
EC-002: Discount percentage > 100% is clamped to 100%
EC-003: Negative discount percentage is treated as 0%
```

These become the boundary rows in table-driven tests that kill `<` to `<=` mutations.

### Mark ambiguities explicitly

If something is unclear, don't guess — mark it:

> FR-005: System MUST notify the user when their session expires
> [NEEDS CLARIFICATION: notification channel — email, in-app, or push?]

Maximum 3 clarification markers. If you have more than 3, the feature is too vague to spec — discuss further with the user.

### Requirements are numbered and categorized

Use prefixes:
- `FR-` — Functional Requirements (what the system does)
- `EC-` — Edge Cases (boundary conditions)
- `SC-` — Success Criteria (measurable outcomes)

MUST vs SHOULD:
- **MUST** — Non-negotiable. Implementation fails without this.
- **SHOULD** — Important but negotiable. Can be deferred if needed.

### Success criteria include verification gates

Always include:
```
- SC-N: Every acceptance scenario has a corresponding test
- SC-N+1: Mutation score >= 60% on feature package
- SC-N+2: All verification gates pass (just verify)
```

These are the mechanical criteria that the verification pipeline checks.

## Spec Quality Checklist

Before moving to the Plan phase, verify:

- [ ] Every scenario is independent (testable without other scenarios)
- [ ] No implementation details (no mention of specific tools, databases, APIs)
- [ ] Every requirement has a test strategy (how would you verify it?)
- [ ] Edge cases cover boundary values (zero, empty, negative, maximum, overflow)
- [ ] Success criteria are measurable (numbers, not adjectives)
- [ ] Maximum 3 [NEEDS CLARIFICATION] markers
- [ ] No duplicate requirements (each captures a unique behavior)
- [ ] Context section explains WHY (business value, not technical necessity)

## Common Mistakes

### Over-specification
Writing 30 requirements for a feature that needs 8. More requirements = more tests = more maintenance. Only specify what matters for correctness.

### Under-specification of edges
Writing 10 happy-path scenarios and 0 edge cases. The edges are where bugs hide and where mutation testing catches weak assertions.

### Implementation leaking in
"System MUST store user data in PostgreSQL" — that's an implementation decision, not a requirement. "System MUST persist user data durably" is the actual requirement.

### Vague success criteria
"System should be secure" — how would you test this? Replace with: "System MUST rate-limit login attempts to 5 per minute per IP" — now you can write a test.

## Relationship to Other Phases

```
SPECIFY          PLAN              IMPLEMENT
spec.md    →     plan.md     →     test + code
scenarios  →     task order  →     table-driven tests
requirements →   file paths  →     implementation
edge cases →     boundary    →     mutation-killing
                 test tasks        test rows
```

The spec is stable. Plans change when architecture changes. Code changes when implementation changes. But the spec only changes when the user's needs change.
