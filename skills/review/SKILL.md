---
name: review
description: >-
  Run two-stage code review — spec-compliance first, then targeted quality agents.
  Use when the user invokes /review or asks for code review, quality check, or
  wants to run review agents against their changes.
version: 0.1.0
---

Orchestrate the two-stage review process. This is Phase 5 of the verified development workflow.

## Process

### 0. Determine Scope

- If `feature-name` provided, review that feature
- If `--agent <name>` provided, run only that specific agent
- Otherwise, read `.verified/state.md` to find the current feature
- If no feature found, review changed files vs main branch:
  ```bash
  git diff --name-only main
  ```

### 1. Pre-Flight Checks

Before running review agents:
1. Check that the project's verify command passes (or was recently run). If not, tell the user to run `/verify` first.
2. Check that tests pass. Review is pointless on broken code.
3. Identify the changed files:
   ```bash
   git diff --name-only main
   ```

### 2. Stage 1: Spec Compliance (always runs first)

Run the `spec-compliance-review` agent:
- Input: the feature's `spec.md` + all changed files
- This agent checks scenario coverage, requirement satisfaction, and scope

**If Stage 1 FAILS:**
- Show the findings to the user
- List specific gaps (uncovered scenarios, unmet requirements)
- Ask: "Fix these gaps before running quality review?"
- Do NOT proceed to Stage 2

**If Stage 1 PASSES:**
- Report pass, proceed to Stage 2

If `--stage2-only` flag is used, skip Stage 1 (for re-running quality agents after fixes).

### 3. Stage 2: Quality Review (targeted agents)

Select agents based on what changed. Run applicable agents in parallel:

| Changed Files | Agents to Run |
|--------------|---------------|
| Any source code | complexity-review, test-review |
| Error handling patterns | error-handling-review |
| Concurrent/async code | concurrency-review |
| Security-sensitive code (auth, crypto, SQL) | security-review |
| Code with interfaces/abstractions | interface-design-review |
| README, docs, comments changed | doc-review |
| Domain/business logic | domain-review |
| After GREEN phase | refactoring-review |
| Dead code risk (deleted/moved code) | dead-code-review |
| UI code (HTML, JSX, templates) | a11y-review |

When in doubt about applicability, include the agent — false positives are cheap, missed issues aren't.

### 4. Aggregate Results

Combine findings from all agents into a unified review report:

```markdown
# Code Review Report

**Feature:** {feature-name}
**Date:** {YYYY-MM-DD}

## Stage 1: Spec Compliance
**Status:** PASS/FAIL
{Summary from spec-compliance-review}

## Stage 2: Quality Review

### Findings by Severity

#### Errors (must fix)
| Agent | Location | Issue | Fix |
|-------|----------|-------|-----|

#### Warnings (should fix)
| Agent | Location | Issue | Fix |
|-------|----------|-------|-----|

#### Suggestions (nice to have)
| Agent | Location | Issue | Fix |
|-------|----------|-------|-----|

## Summary
- Errors: {count} (blocks merge)
- Warnings: {count}
- Suggestions: {count}
- Agents run: {list}
```

Save the report to `.verified/features/{feature-name}/review.md`.

### 5. Correction Loop

If errors or warnings found:
1. Present the findings to the user
2. Ask: "Would you like me to fix the errors and warnings?"
3. If yes, fix the issues (following TDD — new tests for new behavior)
4. Re-run ONLY the agents that found issues (not the full review)
5. Maximum 2 correction iterations. After that, present remaining issues for human decision.

### 6. Update State

```yaml
---
feature: {feature-name}
phase: review
status: complete
last_activity: {YYYY-MM-DD} - Review complete ({N} errors, {N} warnings, {N} suggestions)
---
```

### 7. Sync Codebase Docs

After review passes (no remaining errors), check if `.verified/codebase/` docs need updating:

1. Run the `doc-review` agent in **sync mode**
2. The agent analyzes what changed in this feature and updates affected codebase docs:
   - New packages → update ARCHITECTURE.md
   - New dependencies → update STACK.md
   - New external services → update INTEGRATIONS.md
   - New patterns introduced → update CONVENTIONS.md
   - New test infrastructure → update TESTING.md
   - New tech debt → update CONCERNS.md
   - Directory changes → update STRUCTURE.md
3. Only update docs that actually need changes — skip if nothing is affected

If `.verified/codebase/` doesn't exist yet, ask: "This is a good time to map the codebase. Run `/map` to create project context docs?"

### 8. Capture Learnings

After review and doc sync, systematically capture knowledge from this feature:

1. **Gotchas discovered** — things that were surprising, non-obvious, or caused debugging time
   - Example: "CMS migrations must be created explicitly, push:false means no auto-sync"
   - Example: "NULL CMS fields default safely in Go via derefFloatOr pattern"

2. **Patterns established** — new patterns introduced that future features should follow
   - Example: "Use data attributes on root element to pass server data to client JS"
   - Example: "Modal follows apartment-map.js pattern: backdrop + header + scrollable body"

3. **Decisions made** — significant choices not already captured as ADRs
   - If any are significant enough, create ADRs via the `adr` agent

4. **Where to save:**
   - Project-specific learnings → Claude Code memory (`.claude/projects/` memory files)
   - Codebase patterns → `.verified/codebase/CONVENTIONS.md`
   - Risks/gotchas → `.verified/codebase/CONCERNS.md`
   - Architecture decisions → `.verified/decisions/` via ADR agent

Ask the user: "Anything surprising or worth remembering from this feature? Any gotchas, patterns, or decisions to capture?"

If the user has nothing to add, check the review findings — any fixes that revealed non-obvious behavior should be captured as learnings.

### 9. Final Report

```
Review complete for: {feature-name}

  Stage 1 (Spec Compliance): PASS
  Stage 2 (Quality Review):
    Errors:      0
    Warnings:    2 (fixed)
    Suggestions: 3

  Codebase docs: {updated ARCHITECTURE.md, STACK.md / no changes needed}
  Learnings captured: {N} memories, {N} ADRs

  Report: .verified/features/{feature-name}/review.md

  Next: Human review, then merge.
```

## Running Individual Agents

To run a single agent:
```
/review --agent test-review
/review --agent security-review
```

This skips the two-stage orchestration and runs just that agent on changed files.

## Important

- Stage 1 MUST pass before Stage 2 runs (unless --stage2-only)
- Never skip spec-compliance — it catches the most expensive mistakes
- Correction loop is max 2 iterations — don't chase perfection
- Refactoring-review is advisory only — never blocks
- Save the report even if all passes — it's evidence of review
