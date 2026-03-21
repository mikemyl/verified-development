---
name: session-report
description: >-
  Generate a session report with work summary, outcomes, and decisions made.
  Use when the user invokes /session-report or asks for a session summary,
  "what did we do?", "wrap up", or is ending a work session.
version: 0.1.0
---

Generate a summary of what was accomplished in this session.

## Process

### 1. Gather Session Context

Read all available context:
- `.verified/state.md` — current position and last activity
- `.verified/features/` — check which features were worked on
- `.verified/decisions/` — any ADRs created this session
- Git log for today's commits:
  ```bash
  git log --oneline --since="$(date -v-8H '+%Y-%m-%dT%H:%M:%S')" 2>/dev/null || git log --oneline -20
  ```
- Git diff stats:
  ```bash
  git diff --stat HEAD~$(git log --oneline --since="$(date -v-8H '+%Y-%m-%dT%H:%M:%S')" 2>/dev/null | wc -l | tr -d ' ') 2>/dev/null || echo "no baseline"
  ```

### 2. Summarize Work

Categorize what happened:

**Features progressed:**
- Which features moved through which phases?
- What's the current state of each?

**Code changes:**
- Files created/modified/deleted
- Tests added
- Lines changed (approximate)

**Verification results:**
- Did the verify command pass? When was it last run?
- Any review findings addressed?

**Decisions made:**
- ADRs created
- Significant technical choices (even if not captured as ADR)

**Quick fixes:**
- Any `/quick` tasks completed

### 3. Generate Report

Present the report directly (don't write to a file unless the user asks):

```markdown
# Session Report — {YYYY-MM-DD}

## Work Summary

### Features
| Feature | Phase Start | Phase End | Status |
|---------|------------|-----------|--------|
| {name}  | {phase}    | {phase}   | {status} |

### Changes
- {N} commits
- {N} files changed (+{added} -{removed})
- {N} tests added

### Verification
- Last the verify command: {PASS/FAIL/not run}
- Review: {completed/in-progress/not started}

### Decisions
- DEC-{NNN}: {title}

## Outcomes
- {What was accomplished — concrete deliverables}

## Carry Forward
- {What's next — current state and suggested next action}
- {Any blockers or open questions}

## Codebase Docs
- {Updated: ARCHITECTURE.md, STACK.md / No changes}
```

### 4. Suggest Next Session Start

```
Next session: Run /progress to pick up where you left off.
```

## Important

- Keep the report concise — this is a quick summary, not a novel
- Focus on outcomes (what was delivered) not process (what commands were run)
- If no git commits exist for this session, base the report on conversation context
- Don't write the report to a file unless explicitly asked — just display it
- The "Carry Forward" section is the most important — it's context for the next session
