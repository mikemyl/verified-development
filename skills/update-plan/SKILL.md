---
name: update-plan
description: >-
  Update a feature's spec or plan based on new information discovered during
  implementation. Use when the user invokes /update-plan or says "update the spec",
  "revise the plan", "change requirements", "lower the threshold", or when
  implementation reveals the original spec/plan needs adjustment.
version: 0.1.0
---

Update a feature's specification or plan when implementation reveals the original was wrong, incomplete, or unrealistic.

## When to Use

- Coverage targets were unrealistic and need lowering
- A requirement turns out to be infeasible
- New edge cases discovered during implementation
- Task ordering needs to change
- New tasks need to be added
- Tasks need to be removed (descoped)
- Acceptance scenarios need revision

## Process

### 1. Determine Feature

- If feature name provided as argument, use it
- If no argument, read `.verified/state.md` for the current feature

### 2. Identify What Changed

Ask the user (or infer from context):
- What specifically needs updating? (spec, plan, or both)
- Why? (discovered during implementation, requirement changed, unrealistic target)

### 3. Update Spec (if needed)

Read `.verified/features/{feature-name}/spec.md` and make targeted updates:
- Revise acceptance scenarios
- Update requirements (FR-xxx)
- Adjust success criteria (SC-xxx)
- Add/remove edge cases (EC-xxx)
- Add a revision note at the top:
  ```
  > **Revised {YYYY-MM-DD}**: {what changed and why}
  ```

### 4. Update Plan (if needed)

Read `.verified/features/{feature-name}/plan.md` and make targeted updates:
- Add new tasks (next available T-number)
- Remove tasks (mark as `- [~] TXXX [DESCOPED] reason`)
- Reorder tasks
- Update task descriptions
- Adjust verification thresholds

### 5. Update State

```yaml
---
feature: {feature-name}
phase: {current phase — don't change}
status: in-progress
last_activity: {YYYY-MM-DD} - Updated {spec/plan}: {what changed}
---
```

### 6. Summary

```
Updated: .verified/features/{feature-name}/{spec.md|plan.md}

Changes:
  - {what was changed}
  - {why}

Continuing implementation from current position.
```

## Important

- Don't restart implementation — continue from where you left off
- Mark descoped tasks clearly (don't delete them — history matters)
- Add revision notes so future readers understand why things changed
- If the change is significant (architecture shift, major requirement change), capture as ADR
- Spec changes may invalidate previous review results — note this
