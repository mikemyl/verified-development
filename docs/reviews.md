# Review

`/review` is a two-stage gate. Stage 1 must pass before Stage 2 runs.

- **Stage 1 — spec-compliance.** One agent checks the implementation against `spec.md`: is every scenario covered, every requirement satisfied, and is the scope right? If this fails, review stops here. Building the wrong thing correctly is still wrong.
- **Stage 2 — targeted quality agents.** Multiple agents review the change in parallel for correctness, safety, and design. Which agents run depends on the change (e.g. concurrency review only fires on concurrent Go code, a11y only on UI).

After both stages, `/review` syncs codebase docs (via the doc-review agent) and writes a process retro.

## Review agents

| Agent | Model | What it reviews |
|-------|-------|-----------------|
| **spec-compliance-review** | sonnet | Stage 1 gate: scenario coverage, requirement satisfaction, scope |
| test-review | sonnet | Tautological tests, boundary gaps, property tests, structure, **Farley Score** |
| security-review | opus | Injection, auth, data exposure, hardcoded creds, dependency CVEs |
| complexity-review | haiku | Cyclomatic/cognitive complexity, function length, nesting |
| error-handling-review | sonnet | Error wrapping, dropped errors, nil returns, error style |
| concurrency-review | sonnet | Goroutine lifecycle, data races, channel patterns, mutexes |
| dead-code-review | haiku | Unreachable functions, phantom packages, noop implementations |
| interface-design-review | haiku | Accept-interfaces-return-structs, consumer-site definition, DI |
| doc-review | sonnet | README accuracy, comment drift, codebase doc staleness |
| domain-review | opus | Abstraction leaks, boundary violations, ubiquitous language |
| refactoring-review | sonnet | Post-GREEN opportunities: duplication, naming, extraction |
| a11y-review | sonnet | WCAG 2.1 AA: contrast, ARIA, keyboard nav, semantic HTML |
| adr | sonnet | Captures architectural decisions as ADRs |
| executor | opus | Runs `/implement` plan tasks in waves with TDD + evidence (not a reviewer) |

Plan-time critics (`plan-critic-*`), the `docs-guardian`, and `use-case-data-patterns` are separate from the review pass — see [adversarial-critique.md](adversarial-critique.md) and the agent directory.

## Farley Score (test quality)

When a change adds or rewrites tests, `test-review` computes a **Farley Score** — Dave Farley's eight properties of good tests (Understandable, Maintainable, Repeatable, Atomic, Necessary, Granular, Fast, First), weighted:

```
(U×1.5 + M×1.5 + R×1.25 + A×1.0 + N×1.0 + G×1.0 + F×0.75 + T×1.0) / 9
```

The rubric and score bands live in `skills/test-design-reviewer/SKILL.md` (single source of truth).

**It is informational only.** PASS/WARN/FAIL comes from error/warning findings, never from the score. A high Farley Score with weak assertions is still a warning. The score fills the test-quality gap left when mutation testing was dropped as a hard verification requirement — without re-introducing a blocking gate.

## Process retro

Step 8c of `/review` writes a small **process-level** retro per feature — "what did we learn about *how* we worked," distinct from code-level findings:

- `.verified/features/<feature>/retro.md` — four sections: What worked / What didn't / Workflow tuning signals / Top process learning (any may be empty).
- `.verified/learnings.md` — append-only digest, one line per feature (`- YYYY-MM-DD **feature** — top learning`). Grep this to spot cross-feature trends.

Code-level findings (gotchas, conventions, ADRs) stay in their existing homes under `.verified/codebase/` and `.verified/decisions/`.
