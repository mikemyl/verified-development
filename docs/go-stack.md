# Go Stack

Go is the first fully-supported stack. The methodology is based on [imti.co/go-ai-verified-development](https://imti.co/go-ai-verified-development/).

## Prerequisites

These tools must be installed:

- [just](https://github.com/casey/just) — command runner
- [golangci-lint](https://golangci-lint.run) — meta-linter (43 linters enabled)
- [revive](https://github.com/mgechev/revive) — complexity and idiom rules
- [gosec](https://github.com/securego/gosec) — security scanner
- [govulncheck](https://pkg.go.dev/golang.org/x/vuln/cmd/govulncheck) — dependency vulnerabilities
- [deadcode](https://pkg.go.dev/golang.org/x/tools/cmd/deadcode) — unreachable function detector

## Verification pipeline

`just verify` runs every layer. All must pass with no warnings.

| Layer | Tool | What it catches |
|-------|------|-----------------|
| Linting | revive + golangci-lint (43 linters) | Complexity, concurrency bugs, deprecated APIs |
| Testing | `go test -race -shuffle=on -count=1` | Data races, test-order dependencies |
| Coverage | go tool cover | Untested code (≥80% project, ≥80% patch) |
| Security | gosec + govulncheck | SQL injection, hardcoded creds, dependency vulns |
| Dead code | deadcode + ineffassign | Unreachable functions, unused assignments |
| Build | go build + go mod verify | Compilation and dependency integrity |

## Thresholds

Defined in the project's build config (read them there, don't hardcode):

| Metric | Threshold |
|--------|-----------|
| Test coverage (project + patch) | ≥ 80% |
| Cyclomatic complexity | ≤ 10 |
| Cognitive complexity | ≤ 15 |
| Function length | ≤ 80 lines, ≤ 50 statements |
| Function arguments | ≤ 5 |
| Return values | ≤ 3 |

## Future stacks

The plugin architecture supports multiple languages; each gets its own skill with toolchain-specific configuration. A TypeScript/frontend skill arm already ships (strict mode, functional patterns, DDD, hexagonal architecture, Vitest Browser Mode testing). Planned:

- **TypeScript** — eslint, strict mode, vitest (skill arm present; full `/verify` toolchain in progress)
- **Java** — spotbugs, OWASP dependency-check
- **Rust** — clippy, cargo-audit
