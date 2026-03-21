# verified-development

A Claude Code plugin for specification-first, verified development with ATDD, layered quality gates, and review agents. Language-aware, with Go as the first supported stack.

## Problem

AI agents produce code faster than humans can review. Without automated verification, mistakes compound — untested code, weak assertions, dead code, security gaps. The review bottleneck doesn't scale with the output.

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

For existing projects, start with `/assess` (gap analysis) and `/map` (codebase understanding).

For small changes (bug fixes, tweaks), use `/quick` — compressed workflow with TDD + verify + proportional review.

## Core Principles

- **Acceptance scenarios before implementation** — Given/When/Then defined before code
- **Layered verification** — lint, test, coverage, mutation, security, dead code — all must pass
- **Numeric thresholds** — coverage >=80%, mutation >=60%, complexity <=10
- **Single verify command** — `just verify` runs everything, no warnings tolerated
- **No tautological tests** — tests encode expected outputs, never reimplement logic
- **No vaporware** — every package imported by non-test code, every table touched by DML
- **Two-stage review** — spec-compliance first, then targeted quality agents

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

## Plugin Structure

```
verified-development/
├── .claude-plugin/
│   └── plugin.json
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
│   └── progress/                          # /progress — show workflow status
├── agents/
│   ├── spec-compliance-review.md          # Stage 1: spec compliance gate
│   ├── test-review.md                     # Test quality & mutation gaps
│   ├── security-review.md                 # Vulnerabilities & auth issues
│   ├── complexity-review.md               # Function complexity thresholds
│   ├── error-handling-review.md           # Go error patterns
│   ├── concurrency-review.md              # Goroutine safety
│   ├── dead-code-review.md                # Unreachable code & vaporware
│   ├── interface-design-review.md         # Go interface patterns
│   ├── doc-review.md                      # Documentation accuracy
│   ├── domain-review.md                   # Abstraction leaks & boundaries
│   ├── refactoring-review.md              # Post-GREEN opportunities
│   ├── a11y-review.md                     # WCAG 2.1 AA accessibility
│   └── adr.md                             # Architecture decision records
└── hooks/
    └── hooks.json
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
