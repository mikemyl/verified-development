---
name: quick
description: >-
  Execute a small change (bug fix, tweak, minor feature) with a compressed workflow.
  Still enforces TDD, verification, and proportional review — but skips spec/plan
  ceremony. Use when the user invokes /quick or asks for a quick fix, small change,
  one-liner, hotfix, or minor bug fix.
version: 0.1.0
---

Execute a small change with a compressed verified development workflow. TDD and verification are never skipped — but spec, plan, and full review are proportional to the change size.

## Process

### 1. Understand the Change

Parse the user's description. It should be one sentence:
- "fix off-by-one error in discount calculation"
- "add rate limiting to login endpoint"
- "update README with new install instructions"

If the description implies more than ~3 files changing or multiple independent concerns, suggest the full workflow:
```
This sounds like it might be bigger than a quick fix.
Consider running /specify <feature-name> for the full workflow.
Proceed with /quick anyway?
```

### 2. Load Context

- Read `.verified/state.md` — note that a quick task is in progress
- Read `.verified/codebase/` docs if they exist — understand conventions, architecture
- Read `.verified/config.json` — thresholds

### 3. TDD Cycle

Load the `tdd` skill. Follow RED-GREEN-REFACTOR:

**RED:** Write a test that exposes the bug or describes the new behavior.
Run it using the project's test command. Show the failing output.

**GREEN:** Write the minimum fix/change.
Run the test again. Show the passing output.

**REFACTOR:** Improve if needed. Run tests again.

For documentation-only changes (README, comments), skip TDD — there's nothing to test.

### 4. Verify

Run the full verification pipeline (detected from Justfile, Makefile, package.json, or pom.xml):

```bash
{project's verify command}
```

This is never skipped, even for a one-line fix. A small change can break linting, coverage thresholds, or introduce a security issue.

If verify fails, fix the issue before proceeding.

### 5. Proportional Review

Run only the review agents relevant to what changed. Determine scope:

```bash
git diff --name-only HEAD~1
```

| Changed Files | Agents to Run |
|--------------|---------------|
| Go code | complexity-review, test-review |
| Error handling code | + error-handling-review |
| Concurrent code | + concurrency-review |
| Auth/crypto/SQL | + security-review |
| UI code | + a11y-review |
| Docs/README | + doc-review |

Minimum: always run **test-review** (verify the new test is good) and **complexity-review** (verify the fix didn't increase complexity).

Skip these for quick fixes (they need full feature context):
- spec-compliance-review (no spec to comply with)
- domain-review (overkill for small changes)
- refactoring-review (not enough code to warrant)
- interface-design-review (unless interfaces changed)
- dead-code-review (unless code was deleted)

### 6. Codebase Doc Sync

If `.verified/codebase/` exists, check if the change affects any docs:
- Most quick fixes won't — skip sync if nothing structural changed
- If a new dependency was added → update STACK.md
- If a new pattern was introduced → update CONVENTIONS.md

### 7. Commit

Ask the user before committing. Suggest a commit message:

```
fix: {description from step 1}
```

For quick tasks, use conventional commit prefixes:
- `fix:` for bug fixes
- `feat:` for small features
- `docs:` for documentation
- `refactor:` for refactoring
- `chore:` for maintenance

### 8. Update State

Don't create a feature directory for quick tasks. Just update state.md:

```yaml
---
feature: none
phase: idle
status: complete
last_activity: {YYYY-MM-DD} - Quick: {description}
---
```

### 9. Summary

```
Quick fix complete: {description}

  TDD:     test written and passing
  Verify:  all gates passed
  Review:  {N} agents run, {findings summary}
  Commit:  {hash} {message}
```

## When NOT to Use /quick

- Feature requires multiple acceptance scenarios → use `/specify`
- Change spans more than 3 files with different concerns → use `/specify`
- Change needs architectural decisions → use `/specify` + ADR
- Change needs UI design → use `/specify` + `/ui-spec`
- You're unsure about the scope → start with `/specify`, you can always simplify later

## Important

- TDD is never skipped — even one-line fixes get a test
- `just verify` is never skipped — small changes break things
- Review is proportional, not absent — at minimum test-review + complexity-review
- No spec or plan files created — the commit message IS the documentation
- If the fix reveals a bigger problem, stop and suggest the full workflow
