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

### 1. Read State (Source of Truth)

Read `.verified/state.md`. The `feature` field in state.md IS the current feature. This is non-negotiable — do not override it based on what other features look like.

If state.md doesn't exist, report:
```
No verified development state found.
Run /init to set up this project, or /assess to evaluate an existing codebase.
```

### 2. Read Current Feature Context

Read the CURRENT feature's artifacts (the one from state.md):
- `.verified/features/{feature}/plan.md` — check task completion status
- `.verified/features/{feature}/spec.md` — for context on what's being built
- `.verified/config.json` — project configuration

Do NOT read other features' files at this stage. Focus on the current one.

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

- **state.md is the source of truth** for which feature is current. NEVER override this.
- The `feature` field in state.md tells you THE current feature. Other features are secondary.
- If state.md says `feature: X` but X's plan has unchecked tasks, that's useful info — report it. Don't switch to a different feature that looks "more current."
- Keep output concise — the user wants a quick status check, not a report
- If state.md seems wrong (e.g., feature doesn't exist), flag it but don't silently pick a different one
