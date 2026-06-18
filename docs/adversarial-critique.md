# Adversarial Critique

Two stress-test gates sit inside the workflow. Both exist to catch flaws while they're cheap to fix — before code at spec time, before approval at plan time.

## Spec-time challenge (inside `/specify`)

Before approaches are proposed, a Socratic Q&A interrogates the **problem** itself. Six categories: ambiguity, surface area, alternatives, edge cases, dependencies, out-of-scope. Rules:

- One question at a time, max 8 questions.
- Stop early when you signal you've had enough.
- The audit trail goes to `.verified/features/<feature>/discussion.md` — it preserves the options that were *considered and rejected*, not just the chosen direction, so future-you understands why the spec looks the way it does.

Opt out with `--no-challenge` or `.verified/config.json` → `"workflows": { "challenge": false }`.

## Plan-time critics (inside `/plan`)

Before you approve the plan, up to five critic agents run in parallel to stress-test it.

| Critic | When it runs | Catches |
|--------|--------------|---------|
| `plan-critic-acceptance` | always | Does every spec scenario / requirement / edge case have a task? |
| `plan-critic-design` | always | Architecture smells, hidden decisions, missing ADRs, abstraction drift |
| `plan-critic-strategic` | always | Scope, priorities, dependency cycles, sizing, sequencing |
| `plan-critic-ux` | only if `ui-spec.md` exists | UI/UX coverage |
| `plan-critic-parallelization` | only if the wave engine reports `parallel: true` | Are same-wave tasks truly independent — files, coupling, shared state? |

A fully sequential plan with no UI spec runs three critics; a parallel UI plan runs all five.

The parallelization critic is fed the wave engine's `collisions` array (see [planning.md](planning.md)). The script proves *mechanical* file overlap; this critic catches the *semantic* coupling a script can't — e.g. a same-wave task B that consumes an interface task A introduces.

### Severity policy

All critics share one finding schema — `{critic, severity, description, tied_to, recommendation?}` — and one severity rubric:

- **error** → auto-fixes the plan.
- **warning** → surfaced to you (max 10 visible).
- **suggestion** → recorded only.

Findings are written to `.verified/features/<feature>/concerns.md`. Opt out with `--no-critics` or `"workflows": { "plan_critics": false }`.

> The rubric and finding schema are defined once in `skills/specify/references/challenge.md` and reused verbatim across all five critic agents. Changing the rubric means updating all six files; `tests/adversarial-critique.test.cjs` catches drift.
