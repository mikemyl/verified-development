---
name: plan
description: "Plan a multi-file feature in chat, then stress-test it with three critics before you build."
version: 2.0.0
---

A plan for a change that is too big to just build: more than ~3 files, more than one acceptance
scenario, a signature or schema change, a migration. Below that, build and `/review`.

The plan lives in chat. No `plan.md`, no `spec.md`, no feature directory: on measured projects those
files were never executed, rotted after the feature shipped, and 32 of 39 had no test citing them.
The scenarios are the tests. What survives from the old pipeline is the plan critics, which caught a
module-wide compile break and two money bugs before any code existed.

## 1. Understand

Restate the request in three lines: what changes for the user, what must not change, what is out of
scope. Ask at most three questions, one at a time, only where the answer changes the plan. Ground
external-API behaviour live (a real call, a real export) rather than from memory; a mis-scoped
feature costs more than a question.

## 2. Read, then stop

- `.verified/codebase/TESTING.md` `## Test Types`: which type tests which boundary, its primitives
  and `good-example:`. Run `node ${CLAUDE_PLUGIN_ROOT}/hooks/lib/taxonomy.js extract
  .verified/codebase/TESTING.md` for the section alone.
- The files the change touches, and how a sibling feature did the same kind of thing.
- Every call site of a signature or schema you will change — enumerated, not sampled.

Stop after ~15 files. If you are still reading, you have enough.

## 3. Write the plan in chat

```markdown
## Plan — <feature>

**Scope.** <what changes> / <what must not change> / <out of scope>

**Acceptance scenarios** (the tests that will exist; written first)
| Test | Type | Given / When / Then |
|------|------|---------------------|
| `internal/handler/x_test.go::TestOverride_FreezesSync` | t2-handler-bdd | … |

**Tasks**
- T001 <one sentence> — files: a, b — done when: <observable>
- T002 … — depends on T001

**Decisions** — <choice> over <alternative> because <reason>
**Risks / open questions** — …
```

Rules:

- Every scenario is **named as the test that will exist**, `path::TestName`, in the repo's own DSL,
  with its type from `TESTING.md`. If the repo has no suitable type, the plan says which seam to
  extend, never "unit test it".
- Signature and schema changes are **additive evolution**: add alongside, migrate, delete last. The
  blast radius (every reader of an old default, every call site) is listed in the task, not
  discovered mid-build.
- Tests precede the code they test. One task is one commit-sized unit with a done criterion.
- **No placeholders**: no "TBD", "add validation", "write tests for the above", "similar to T3".

## 4. Critics (default on)

Skip only with `--no-critics` or `.verified/config.json` `workflows.plan_critics: false`.

Dispatch in ONE message, in parallel: `verified-development:plan-critic-acceptance`,
`verified-development:plan-critic-design`, `verified-development:plan-critic-strategic`. Paste the
plan text and the user's request into each prompt — the critics read the plan in the prompt;
there is no file. Each returns at most 10 findings per `references/critic-rubric.md`.

Policy, from that rubric:

- `error` → **re-draft** the plan before the user sees it (a scenario with no task, an undeclared
  dependency, a type mismatch). Say what changed.
- `warning` → show it under the plan, max 10, severity then critic order.
- `suggestion` → drop it.

A critic that fails or returns malformed output is named in the report; the others still count.

## 5. Present and confirm

The plan, then the warnings as a numbered list. The user approves, edits, or dismisses each warning
with a reason. Iterate until approved. Then build: scenario tests first, the verify command run by
you with a real exit code, `/review` before commit.

## Important

- No file is written. If the user wants the plan kept, they paste it into an issue or PR.
- Keep it under ~20 tasks. Bigger means two features.
- Never make up a command; read the Justfile/Makefile/package.json before naming one.
