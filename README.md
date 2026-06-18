# verified-development

A Claude Code plugin for specification-first, verified development: ATDD, layered mechanical gates, adversarial critique, and a panel of review agents. Language-aware, with Go as the first fully-supported stack and a TypeScript/frontend arm in progress.

## Why

AI agents produce code faster than humans can review it. Without structure, the failure modes compound:

- **Verification gap** — untested code, weak assertions, dead code, and security holes accumulate faster than review capacity scales.
- **Specification drift** — with no spec as source of truth, implementations diverge from intent; unrequested features get built while requirements get missed.
- **State loss** — work-in-progress vanishes between sessions; yesterday's decisions get re-debated today.
- **No mechanical enforcement** — standards live as suggestions the LLM can ignore; nothing stops unverified code from being committed.

The plugin answers each with an enforced workflow: specs define what to build, TDD drives how, mechanical gates verify, agents review, and a human signs off on behavior — not mechanical compliance.

## The workflow

```
SPECIFY  ->  PLAN  ->  IMPLEMENT  ->  VERIFY  ->  REVIEW
  what       how      TDD cycle     mechanical   agent + human
                                    gates        quality review
```

1. **`/specify`** — acceptance scenarios (Given/When/Then), requirements, success criteria. An adversarial challenge interrogates the problem first.
2. **`/plan`** — ordered, test-first tasks with file paths. A deterministic engine schedules parallel work; up to five critics stress-test the plan.
3. **`/implement`** — RED-GREEN-REFACTOR per task, atomic commits, concurrent execution in waves.
4. **`/verify`** — one command runs every mechanical gate: lint, test, coverage, security, dead code, build.
5. **`/review`** — spec-compliance gate, then targeted quality agents, then doc sync + process retro.

**Code is never committed before `/verify` and `/review` both pass.** That is the central rule.

→ Full detail, variants, and the pause/continue model: **[docs/workflow.md](docs/workflow.md)**

## Documentation

| Topic | What's covered |
|-------|----------------|
| **[Workflow](docs/workflow.md)** | The five phases, `/quick` / `/assess` / `/map` / `/ui-spec`, interruptible pause & continue |
| **[Planning & the wave engine](docs/planning.md)** | Task grammar, deterministic parallelization, collision detection |
| **[Review](docs/reviews.md)** | Two-stage review, every review agent, the Farley Score, process retro |
| **[Adversarial critique](docs/adversarial-critique.md)** | Spec-time challenge and the five plan critics |
| **[Go stack](docs/go-stack.md)** | Toolchain, verification pipeline, thresholds |
| **[Configuration & layout](docs/configuration.md)** | `config.json` toggles, `.verified/` structure, plugin layout, contributing |

## Commands

| Command | Purpose |
|---------|---------|
| `/init` | Scaffold project configs, Justfile, linters, `.verified/` |
| `/assess` · `/map` | Gap analysis · deep codebase analysis (existing projects) |
| `/specify` · `/ui-spec` · `/plan` · `/implement` · `/verify` · `/review` | The five-phase workflow (`/ui-spec` is optional, for UI features) |
| `/quick "<desc>"` | Compressed workflow for small changes |
| `/pause` · `/continue` | Capture mid-phase state · resume from it |
| `/progress` · `/update-plan` · `/session-report` | Status · revise spec/plan · session summary |
| `/install-hooks` | Project-specific enforcement (lint on write, pre-commit gate) |

## Installation

```bash
claude plugin marketplace add https://github.com/mikemyl/verified-development
claude plugin install verified-development
```

Scope to a single project with `--scope project` on both commands. To develop against a local clone, see [docs/configuration.md](docs/configuration.md#hacking-on-the-plugin).

## Getting started

```bash
# New project
/init                  # Scaffold configs, Justfile, .verified/
/install-hooks         # Enforcement: lint on write, verify on commit
/specify my-feature    # Start the workflow

# Existing project
/assess                # What verification layers are missing
/map                   # Produce .verified/codebase/ docs
/init                  # Scaffold only what's missing

# Every new session
/progress              # Current feature, phase, status, next step
```

## Influences

- [imti.co/go-ai-verified-development](https://imti.co/go-ai-verified-development/) — Go verification pipeline, thresholds, CLAUDE.md rules
- [agentic-dev-team](https://github.com/bdfinst/agentic-dev-team) — review agents, two-stage review, correction context
- [get-shit-done](https://github.com/glittercowboy/get-shit-done) — phase workflow, fresh context per agent, file-based state
- [spec-kit](https://github.com/github/spec-kit) — specification-first development, template-driven quality
- [citypaul/.dotfiles](https://github.com/citypaul/.dotfiles) — TDD, testing patterns, functional patterns
