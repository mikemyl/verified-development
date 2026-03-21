# verified-development

A Claude Code plugin for specification-first, verified development with ATDD, layered quality gates, and review agents. Language-aware, with Go as the first supported stack.

## Problem

AI agents produce code faster than humans can review. Without structure, several things break down:

- **Verification gap** — untested code, weak assertions, dead code, security gaps compound faster than review capacity scales
- **Context rot** — LLM output quality degrades as context windows fill with accumulated conversation; without fresh context management, later work is worse than earlier work
- **State loss** — work-in-progress disappears between sessions; decisions made yesterday are re-debated today; there's no persistent memory of what was built, why, and what's next
- **Specification drift** — without specs as source of truth, the implementation diverges from intent; features get built that nobody asked for while requirements get missed
- **No mechanical enforcement** — coding standards exist as suggestions the LLM can ignore; nothing prevents committing unverified code

## Solution

A complete development workflow enforced via Claude Code plugin:
- **Specifications** define what to build before any code is written
- **TDD** drives implementation through failing tests
- **Mechanical gates** verify lint, coverage, mutation, security, dead code
- **Review agents** perform two-stage code review (spec-compliance, then quality)
- **Human review** as the final gate, focused on behavior — not mechanical compliance

## The 5-Phase Workflow

```
SPECIFY  ->  PLAN  ->  IMPLEMENT  ->  VERIFY  ->  REVIEW
  what       how      TDD cycle     mechanical   agent + human
                                    gates        quality review
```

1. **Specify** — Acceptance scenarios (Given/When/Then), requirements, success criteria
2. **Plan** — Ordered tasks with file paths, test-first ordering, parallelization markers
3. **Implement** — RED-GREEN-REFACTOR per task, atomic commits, verification evidence
4. **Verify** — `just verify` runs all gates: lint, test, coverage, mutation, security, dead code, build
5. **Review** — Stage 1: spec-compliance (right thing?), Stage 2: quality agents (right way?), then sync codebase docs

For UI features, add `/ui-spec` between Specify and Plan for design contracts, brand identity, and competitive research.

For existing projects, start with `/assess` (gap analysis) and `/map` (codebase understanding).

For small changes (bug fixes, tweaks), use `/quick` — compressed workflow with TDD + verify + proportional review.

## Commands

| Command | Phase | Purpose |
|---------|-------|---------|
| `/init` | Setup | Scaffold project configs, Justfile, linter settings, `.verified/` directory |
| `/assess` | Setup | Analyze existing codebase against verification standards, produce gap report |
| `/map` | Setup | Deep codebase analysis, produce living context docs in `.verified/codebase/` |
| `/specify <feature>` | Phase 1 | Create feature spec with acceptance scenarios and requirements |
| `/ui-spec <feature>` | Phase 1.5 | Create UI design contract with brand, screens, components (optional) |
| `/plan <feature>` | Phase 2 | Create ordered task list with file paths and test-first sequencing |
| `/implement <feature>` | Phase 3 | Execute plan with strict TDD (RED-GREEN-REFACTOR per task) |
| `/verify` | Phase 4 | Run `just verify` — all mechanical gates must pass |
| `/review` | Phase 5 | Two-stage review: spec-compliance, then targeted quality agents |
| `/quick "description"` | All-in-one | Compressed workflow for small changes with proportional review |
| `/progress` | Any time | Show current status and suggest next action |
| `/session-report` | End of session | Summarize work, outcomes, and carry-forward context |
| `/install-hooks` | Setup | Install project-specific enforcement hooks (post-write lint, pre-commit gate) |

## Core Principles

- **Acceptance scenarios before implementation** — Given/When/Then defined before code
- **Layered verification** — lint, test, coverage, mutation, security, dead code — all must pass
- **Numeric thresholds** — coverage >=80%, mutation >=60%, complexity <=10
- **Single verify command** — `just verify` runs everything, no warnings tolerated
- **No tautological tests** — tests encode expected outputs, never reimplement logic
- **No vaporware** — every package imported by non-test code, every table touched by DML
- **Two-stage review** — spec-compliance first, then targeted quality agents

## Project Structure (what gets created in your project)

```
your-project/
├── .verified/
│   ├── project.md                    # Project vision, constraints, tech stack
│   ├── config.json                   # Thresholds, workflow toggles
│   ├── state.md                      # Current feature, phase, status
│   ├── assessment.md                 # Gap analysis (from /assess)
│   ├── design-system.md              # Brand tokens — colors, typography (from /ui-spec)
│   ├── codebase/                     # Living project context (from /map)
│   │   ├── ARCHITECTURE.md
│   │   ├── CONVENTIONS.md
│   │   ├── STACK.md
│   │   ├── STRUCTURE.md
│   │   ├── TESTING.md
│   │   ├── INTEGRATIONS.md
│   │   └── CONCERNS.md
│   ├── decisions/                    # Architecture Decision Records
│   │   └── DEC-001-*.md
│   └── features/
│       └── {feature-name}/
│           ├── spec.md               # Acceptance scenarios, requirements
│           ├── ui-spec.md            # Screen specs, components (optional)
│           ├── plan.md               # Ordered tasks with file paths
│           ├── summary.md            # Implementation outcomes
│           └── review.md             # Review findings
├── Justfile                          # Verification pipeline targets
├── .golangci.yml                     # 43 linters configured
├── revive.toml                       # Complexity and idiom rules
└── codecov.yml                       # CI coverage gates
```

Codebase docs are created by `/map` and kept current — the doc-review agent updates them after each feature review.

## Review Agents (13)

Two-stage review: spec-compliance must pass before quality agents run.

| Agent | Model | What It Reviews |
|-------|-------|----------------|
| **spec-compliance-review** | sonnet | Stage 1 gate: scenario coverage, requirement satisfaction, scope |
| test-review | sonnet | Tautological tests, boundary gaps, property tests, test structure |
| security-review | opus | Injection, auth, data exposure, hardcoded creds, dependencies |
| complexity-review | haiku | Cyclomatic/cognitive complexity, function length, nesting |
| error-handling-review | sonnet | Error wrapping, dropped errors, nil returns, error style |
| concurrency-review | sonnet | Goroutine lifecycle, data races, channel patterns, mutexes |
| dead-code-review | haiku | Unreachable functions, phantom packages, noop implementations |
| interface-design-review | haiku | Accept-interfaces-return-structs, consumer-site definition, DI |
| doc-review | sonnet | README accuracy, comment drift, codebase doc staleness |
| domain-review | opus | Abstraction leaks, boundary violations, domain language |
| refactoring-review | sonnet | Post-GREEN opportunities: duplication, naming, extraction |
| a11y-review | sonnet | WCAG 2.1 AA: contrast, ARIA, keyboard nav, semantic HTML |
| adr | sonnet | Captures architectural decisions in structured format |

## Go Stack (first implementation)

Based on the methodology at https://imti.co/go-ai-verified-development/

### Prerequisites

These tools must be installed:

- [just](https://github.com/casey/just) — command runner
- [golangci-lint](https://golangci-lint.run) — meta-linter (43 linters enabled)
- [revive](https://github.com/mgechev/revive) — complexity and idiom rules
- [gremlins](https://github.com/go-gremlins/gremlins) — mutation testing
- [gosec](https://github.com/securego/gosec) — security scanner
- [govulncheck](https://pkg.go.dev/golang.org/x/vuln/cmd/govulncheck) — dependency vulnerabilities
- [deadcode](https://pkg.go.dev/golang.org/x/tools/cmd/deadcode) — unreachable function detector

### Verification Pipeline

| Layer | Tool | What it catches |
|-------|------|----------------|
| Linting | revive + golangci-lint (43 linters) | Complexity, concurrency bugs, deprecated APIs |
| Testing | `go test -race -shuffle=on -count=1` | Data races, test order dependencies |
| Coverage | go tool cover | Untested code (>=80% project, >=80% patch) |
| Mutation | gremlins | Weak assertions, missing boundary tests (>=60%) |
| Security | gosec + govulncheck | SQL injection, hardcoded creds, dependency vulns |
| Dead code | deadcode + ineffassign | Unreachable functions, unused assignments |
| Build | go build + go mod verify | Compilation and dependency integrity |

### Key Thresholds

| Metric | Threshold |
|--------|-----------|
| Test coverage (project + patch) | >= 80% |
| Mutation score | >= 60% |
| Cyclomatic complexity | <= 10 |
| Cognitive complexity | <= 15 |
| Function length | <= 80 lines, <= 50 statements |
| Function arguments | <= 5 |
| Return values | <= 3 |

## Installation

### From Claude Code marketplace

```bash
# Add the marketplace source
claude plugin marketplace add https://github.com/mikemyl/verified-development

# Install the plugin
claude plugin install verified-development
```

To scope to a single project instead of all projects:

```bash
claude plugin marketplace add --scope project https://github.com/mikemyl/verified-development
claude plugin install --scope project verified-development
```

### From source (development / testing)

```bash
# Clone the repo
git clone https://github.com/your-user/verified-development.git
cd verified-development

# Option 1: Symlink for persistent use across all projects
ln -s "$(pwd)" ~/.claude/plugins/verified-development

# Option 2: Run Claude Code with the plugin for a single session
claude --plugin-dir /path/to/verified-development
```

### Test locally without installing

```bash
# Navigate to any project
cd ~/your-project

# Start Claude Code pointing at the plugin directory
claude --plugin-dir ~/path/to/verified-development

# Verify it loaded — you should see the skills when you type /
# Try: /assess, /progress, /init
```

### Getting started in a project

```bash
# New project
/init                          # Scaffold configs, Justfile, .verified/
/install-hooks                 # Set up enforcement (lint on write, verify on commit)
/specify my-feature            # Start your first feature

# Existing project
/assess                        # Gap analysis — what verification layers are missing
/map                           # Deep codebase analysis — produces .verified/codebase/ docs
/init                          # Scaffold only what's missing
/install-hooks                 # Set up enforcement
```

## Plugin Structure

```
verified-development/
├── .claude-plugin/
│   ├── plugin.json                        # Plugin manifest
│   └── marketplace.json                   # Marketplace metadata
├── skills/
│   ├── verified-development/              # Universal workflow & principles
│   ├── go-verified-development/           # Go toolchain & standards
│   │   └── references/                    # Justfile, golangci-yml, revive, codecov
│   ├── specification/                     # How to write specs
│   ├── tdd/                               # Test-driven development
│   ├── ui-specification/                  # UI design contracts
│   ├── verify/                            # /verify — run verification pipeline
│   ├── specify/                           # /specify — create feature spec
│   ├── plan/                              # /plan — create implementation plan
│   ├── implement/                         # /implement — execute plan with TDD
│   ├── review/                            # /review — two-stage review agents
│   ├── assess/                            # /assess — evaluate existing codebase
│   ├── init-project/                      # /init — scaffold project configs
│   ├── ui-spec/                           # /ui-spec — create UI design contract
│   ├── map/                               # /map — analyze codebase, produce context docs
│   ├── quick/                             # /quick — compressed workflow for small changes
│   ├── progress/                          # /progress — show workflow status
│   ├── session-report/                    # /session-report — work summary and outcomes
│   └── install-hooks/                     # /install-hooks — project-specific enforcement hooks
├── agents/
│   ├── spec-compliance-review.md          # Stage 1: spec compliance gate
│   ├── test-review.md                     # Test quality & mutation gaps
│   ├── security-review.md                 # Vulnerabilities & auth issues
│   ├── complexity-review.md               # Function complexity thresholds
│   ├── error-handling-review.md           # Go error patterns
│   ├── concurrency-review.md              # Goroutine safety
│   ├── dead-code-review.md                # Unreachable code & vaporware
│   ├── interface-design-review.md         # Go interface patterns
│   ├── doc-review.md                      # Documentation accuracy & codebase doc sync
│   ├── domain-review.md                   # Abstraction leaks & boundaries
│   ├── refactoring-review.md              # Post-GREEN opportunities
│   ├── a11y-review.md                     # WCAG 2.1 AA accessibility
│   └── adr.md                             # Architecture decision records
└── hooks/
    ├── hooks.json                         # Plugin hooks (minimal)
    └── statusline.js                      # Feature, phase, status in status bar
```

## Future Stacks

The plugin architecture supports multiple languages. Each gets its own skill with toolchain-specific configuration:

- **TypeScript** — eslint, Stryker, strict mode, vitest
- **Java** — spotbugs, pitest, OWASP dependency-check
- **Rust** — clippy, cargo-mutants, cargo-audit

## Influences

This plugin combines ideas from:

- [imti.co/go-ai-verified-development](https://imti.co/go-ai-verified-development/) — Go verification pipeline, thresholds, CLAUDE.md rules
- [agentic-dev-team](https://github.com/bdfinst/agentic-dev-team) — Review agents, two-stage review, correction context
- [get-shit-done](https://github.com/glittercowboy/get-shit-done) — Phase workflow, fresh context per agent, file-based state
- [spec-kit](https://github.com/github/spec-kit) — Specification-first development, template-driven quality
- [citypaul/.dotfiles](https://github.com/citypaul/.dotfiles) — TDD, testing patterns, mutation testing, functional patterns
