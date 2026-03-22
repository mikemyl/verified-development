---
name: go-verified-development
description: >-
  Go-specific verified development toolchain. Use when working on Go projects
  with verified development. Triggers on: Go code, .go files, Justfile with Go targets,
  golangci-lint, revive, gremlins, gosec, govulncheck, Go testing patterns,
  table-driven tests, property-based tests with rapid, or any Go verification task.
version: 0.1.0
---

# Go Verified Development

Go-specific toolchain, standards, and patterns for the verified development workflow. Based on the methodology at https://imti.co/go-ai-verified-development/.

## Prerequisites

These tools must be installed before using the verification pipeline:

- `just` — command runner (https://github.com/casey/just)
- `golangci-lint` — meta-linter (https://golangci-lint.run)
- `revive` — Go linter with complexity rules
- `gremlins` — mutation testing (https://github.com/go-gremlins/gremlins)
- `gosec` — security scanner (https://github.com/securego/gosec)
- `govulncheck` — dependency vulnerability checker
- `deadcode` — unreachable function detector

## Verification Pipeline

`just verify` chains these targets sequentially. All must pass.

| Target | Tool | What It Catches |
|--------|------|----------------|
| `lint` | revive + golangci-lint | Complexity, concurrency bugs, deprecated APIs |
| `test` | `go test -race -shuffle=on -count=1` | Data races, test order dependencies, cached passes |
| `coverage` | go tool cover | Untested code (>=80% project) |
| `patch-coverage` | go tool cover + diff | Untested new code (>=80% changed lines) |
| `mutation` | gremlins | Weak assertions, missing boundary tests (>=60%) |
| `security` | gosec + govulncheck | SQL injection, hardcoded creds, dependency vulns |
| `deadcode` | deadcode + ineffassign | Unreachable functions, unused assignments |
| `build` | go build + go mod verify | Compilation and dependency integrity |

See `references/justfile-template.md` for the complete Justfile.

## Thresholds

| Metric | Threshold |
|--------|-----------|
| Test coverage (project) | >= 80% |
| Test coverage (patch) | >= 80% (5% tolerance) |
| Mutation score | >= 60% |
| Cyclomatic complexity | <= 30 per function (package avg <= 10) |
| Cognitive complexity | <= 20 per function |
| Function length | <= 100 lines, <= 50 statements |
| Function arguments | <= 5 |
| Return values | <= 3 |
| Max public structs/file | 5 |

## Go Coding Standards

### Error Handling
- Always wrap errors with context: `fmt.Errorf("operation failed: %w", err)`
- Never ignore errors silently — handle or propagate
- Use sentinel errors for expected conditions, wrapped errors for unexpected
- Error strings: lowercase, no punctuation, no "failed to" prefix

### Naming
- MixedCaps (no underscores except in test names)
- Acronyms all-caps: HTTP, URL, ID, API, JSON
- Package names: short, lowercase, no underscores or mixedCaps
- Interfaces: verb-er pattern (Reader, Writer, Stringer)

### Interfaces
- Accept interfaces, return structs
- Define interfaces at the consumer, not the provider
- Keep interfaces small (1-3 methods)
- Use composition over large interfaces

### Context
- Always first parameter when needed
- Never store in structs
- Use for cancellation, deadlines, request-scoped values only

### Concurrency
- Channels for communication, mutexes for state
- Always run tests with `-race`
- Never start goroutines without a shutdown mechanism
- Use `errgroup` for parallel operations with error propagation

### Dependencies
- All pinned in go.mod
- Run `go mod tidy` before every commit
- Use `internal/` to enforce import boundaries
- Block deprecated packages via `depguard` (e.g., `io/ioutil`)

## Test Patterns

### Table-Driven Tests (Kill Mutants)

Structure tests with boundary values that catch mutations:

```go
tests := []struct {
    name     string
    input    float64
    discount float64
    want     float64
}{
    {"standard price",      100.0, 20.0,  80.0},
    {"no discount",         100.0, 0.0,   100.0},  // kills <= mutation
    {"full discount",       100.0, 100.0, 0.0},    // kills >= mutation
    {"over 100% clamped",   100.0, 150.0, 0.0},    // kills > to >= mutation
    {"negative clamped",    100.0, -10.0, 100.0},   // kills < to <= mutation
    {"boundary: 1%",        100.0, 1.0,   99.0},    // kills constant mutation
    {"boundary: 99%",       100.0, 99.0,  1.0},     // kills constant mutation
    {"zero price",          0.0,   50.0,  0.0},     // edge case
}
```

Every boundary in the implementation needs a test case at that exact boundary, plus one on each side.

### Property-Based Tests (rapid)

Verify invariants across random inputs:

```go
func TestDiscount_NeverNegative(t *testing.T) {
    rapid.Check(t, func(t *rapid.T) {
        price := rapid.Float64Range(0, 100000).Draw(t, "price")
        pct := rapid.Float64Range(-100, 200).Draw(t, "pct")
        result := ApplyDiscount(price, pct)
        if result < 0 {
            t.Fatalf("negative result %f for price=%f pct=%f", result, price, pct)
        }
    })
}
```

Use property tests for:
- Monotonicity (higher discount -> lower price)
- Identity (0% discount returns original)
- Idempotency (applying same operation twice has same effect)
- Bounds (result always within expected range)

### No-Vaporware Tests

Verify everything is wired up — no dead packages or phantom tables:

1. **Package wiring**: scan `pkg/`, verify each package is imported by non-test code
2. **Database tables**: extract table names from migrations, verify each has DML in non-test code
3. **Noop detection**: scan for `var _ Interface = (*Struct)(nil)` — fail if interface has only noop implementations

## Linter Configuration

See reference files for complete configurations:
- `references/golangci-yml.md` — 43 linters with rationale
- `references/revive-toml.md` — complexity and idiom rules
- `references/justfile-template.md` — all verification targets

## Project Setup

Use `/init` to scaffold a new Go project with:
1. `Justfile` with all verification targets
2. `.golangci.yml` with 43 linters enabled
3. `revive.toml` with complexity thresholds
4. `codecov.yml` with project + patch coverage gates
5. `.verified/config.json` with Go-specific settings
