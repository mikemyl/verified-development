# The Workflow

The plugin enforces a five-phase loop. Each phase is a slash command backed by a skill. State lives in `.verified/`, so the workflow survives across sessions and context resets.

```
SPECIFY  ->  PLAN  ->  IMPLEMENT  ->  VERIFY  ->  REVIEW
  what       how      TDD cycle     mechanical   agent + human
                                    gates        quality review
```

## The five phases

### 1. Specify — `/specify <feature>`
Produces acceptance scenarios (Given/When/Then), requirements, and success criteria before any code exists. Before the spec is written, an optional **adversarial challenge** interrogates the problem framing (see [adversarial-critique.md](adversarial-critique.md)). Output: `.verified/features/<feature>/spec.md`.

### 2. Plan — `/plan <feature>`
Turns the spec into an ordered, test-first task list with explicit file paths. A **deterministic wave engine** computes which tasks can run in parallel, and up to five **plan critics** stress-test the plan before you approve it (see [planning.md](planning.md)). Output: `plan.md`.

### 3. Implement — `/implement <feature>`
Executes the plan with strict RED-GREEN-REFACTOR per task, atomic commits, and verification evidence. Independent tasks run concurrently in waves via executor agents. Output: working code + `summary.md`.

### 4. Verify — `/verify`
Runs the project's single verification command (`just verify` for Go). This is the mechanical pass/fail gate: lint, test, coverage, security, dead code, build. No warnings tolerated. See [go-stack.md](go-stack.md) for the Go pipeline.

### 5. Review — `/review`
Two-stage review: a spec-compliance gate runs first (did we build the right thing?), then targeted quality agents run (did we build it the right way?). Finishes by syncing codebase docs and writing a per-feature process retro. See [reviews.md](reviews.md).

**Commit happens only after `/verify` and `/review` both pass.** This is the workflow's hardest rule.

## Variants and entry points

| Situation | Command | What it does |
|-----------|---------|--------------|
| UI feature | `/ui-spec <feature>` | Design contract (brand, screens, components) between Specify and Plan |
| Existing project | `/assess` | Gap analysis against verification standards |
| Existing project | `/map` | Deep codebase analysis → living docs in `.verified/codebase/` |
| Small change | `/quick "<description>"` | Compressed workflow — keeps TDD + verify, trims spec/plan ceremony, proportional review |
| Any time | `/progress` | Show current feature, phase, status, and next action |
| Mid-phase | `/update-plan` | Revise spec or plan when implementation reveals it was wrong |

## Interruptibility (pause / continue)

Every phase is interruptible at any tool-use boundary.

- **`/pause`** — captures where the phase is into `handoff.json` (machine-readable, schema-versioned) plus `continue-here.md` (narrative companion), then ends the turn.
- **`/continue`** — reads the handoff and state, briefs you, and recommends the next action. It refuses if any blocker has `severity: blocking`, so you can't accidentally skip past a failure.

`state.md` (schema v2) tracks `active_phase`, `next_action`, and branch options, so a fresh session knows exactly where to pick up. If the JSON handoff and the narrative `continue-here.md` ever disagree, the JSON wins.
