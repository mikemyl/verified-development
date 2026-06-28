# Go Stack

The plugin is language-agnostic — it runs whatever verify command the repo declares. This page is **one example** of wiring a stack's verify command, using Go: the bundled `tdd-go` skill and the toolchain below show what a fully-wired stack looks like, not the only stack the plugin supports. The methodology is based on [imti.co/go-ai-verified-development](https://imti.co/go-ai-verified-development/).

To teach the plugin your own stack's mechanics and verify command, see [docs/configuration.md — Teaching the plugin your stack](configuration.md#teaching-the-plugin-your-stack).

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

## Other stacks

Go is one example, not a special case. The workflow, craft rubric, and test taxonomy are language-neutral, and `/verify` runs whatever command the repo declares — so any stack works without the plugin bundling its toolchain. What the Go example above adds is convenience: a ready-made `tdd-go` skill and a pre-wired `/verify` pipeline.

Some of that convenience is already shared across languages. Test-corpus analysis (`/test-audit`) reads **Go, TypeScript, Python, and Java** via drop-in adapters (`hooks/lib/lang/*.js`), and the table below shows where each language sits relative to the bundled Go example:

| Stack | `/test-audit` adapter | Bundled TDD skill | Bundled `/verify` toolchain |
|-------|:---:|:---:|:---:|
| Go | ✅ | `tdd-go` | ✅ golangci-lint · revive · gosec · govulncheck |
| TypeScript | ✅ | `react-testing` / `front-end-testing` | — (declare your own) |
| Python | ✅ | — | — (declare your own) |
| Java | ✅ | — | — (declare your own) |
| Rust | — | — | — (declare your own) |

Anything in the "declare your own" column is not a gap to be filled by the plugin — it is the per-repo extension point: see [docs/configuration.md — Teaching the plugin your stack](configuration.md#teaching-the-plugin-your-stack).
