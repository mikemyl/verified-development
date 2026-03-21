---
name: progress
description: >-
  Show current workflow progress, feature status, and suggest next action.
  Use when the user invokes /progress or asks "where are we?", "what's the status?",
  "what should I do next?", or wants to see workflow state.
version: 0.1.0
---

Show the current state of verified development and suggest the next action.

## Process

### 1. Read State

Read `.verified/state.md`. If it doesn't exist, report:
```
No verified development state found.
Run /init to set up this project, or /assess to evaluate an existing codebase.
```

### 2. Gather Context

Read additional files based on state:
- `.verified/config.json` — project configuration
- `.verified/features/` — list all features and their artifacts
- Current feature's directory — check which artifacts exist

### 3. Display Progress

```
Verified Development Status
============================

Project: {from project.md or directory name}
Language: {from config.json}

Current Feature: {feature-name}
Phase: {specify | ui-spec | plan | implement | verify | review}
Status: {in-progress | complete | blocked}
Last Activity: {date - description}

Feature Artifacts:
  [x] spec.md          — {scenario count} scenarios, {requirement count} requirements
  [ ] ui-spec.md       — not created (optional)
  [x] plan.md          — {task count} tasks
  [~] implementation   — {completed}/{total} tasks done
  [ ] summary.md       — pending
  [ ] review.md        — pending

Decisions: {count} ADRs in .verified/decisions/

Verification: {last run date or "not run yet"}
```

### 4. Suggest Next Action

Based on current state:

| State | Suggestion |
|-------|-----------|
| No .verified/ | Run `/init` to set up the project |
| Init complete, no features | Run `/specify <feature>` to start a feature |
| Spec complete | Run `/plan <feature>` (or `/ui-spec` if UI feature) |
| UI spec complete | Run `/plan <feature>` |
| Plan complete | Run `/implement <feature>` |
| Implementation complete | Run `/verify` |
| Verify passes | Run `/review` |
| Review complete | Ready for human review and merge |

### 5. Show Other Features (if any)

If multiple features exist, show a summary:

```
Other Features:
  user-auth          — review complete
  payment-processing — plan complete (paused)
```

## Important

- Read state.md first — it's the source of truth
- If state.md is out of sync with actual files, trust the files and suggest updating state
- Keep output concise — the user wants a quick status check, not a report
