# .golangci.yml Configuration

Use when scaffolding a new Go project with `/init`.

```yaml
run:
  timeout: 5m
  modules-download-mode: readonly

output:
  formats:
    - format: colored-line-number

linters:
  enable:
    # Error handling
    - errcheck          # dropped error returns on Close/Flush
    - errorlint         # modern error wrapping with %w
    - wrapcheck         # error context preservation
    - nilerr            # returning nil instead of actual error

    # Security
    - gosec             # SQL injection, hardcoded creds, weak crypto
    - noctx             # HTTP requests without context
    - rowserrcheck      # missing sql.Rows.Err() check
    - sqlclosecheck     # unclosed database resources

    # Complexity
    - funlen            # function length (80 lines, 50 statements)
    - gocyclo           # cyclomatic complexity <= 10
    - nestif            # nested conditionals <= 5
    - gocritic          # diagnostic, experimental, opinionated, performance, style

    # Concurrency
    - copyloopvar       # loop variable copy bugs
    - tparallel         # unsafe parallel test state sharing

    # Code quality
    - dupl              # code duplication (100 token threshold)
    - goconst           # magic numbers (min 3 chars, 3+ occurrences)
    - depguard          # block deprecated packages
    - misspell          # spelling errors in comments/strings
    - typecheck         # type checking
    - unused            # unused code
    - whitespace        # unnecessary blank lines
    - unconvert         # unnecessary type conversions
    - unparam           # unused function parameters
    - wastedassign      # wasted assignments
    - prealloc          # slice preallocation hints
    - revive            # extensible linter (configured via revive.toml)
    - staticcheck       # advanced static analysis
    - govet             # go vet checks
    - ineffassign       # unused assignments
    - bodyclose         # unclosed HTTP response bodies
    - durationcheck     # incorrect time.Duration multiplication
    - exportloopref     # loop variable export bugs
    - makezero          # append to non-zero-length slices
    - nolintlint        # nolint directive hygiene
    - predeclared       # shadowing predeclared identifiers
    - reassign          # reassigning package variables
    - tenv              # os.Setenv in tests (use t.Setenv)
    - testableexamples  # testable example functions
    - thelper           # test helper without t.Helper()
    - usestdlibvars     # use stdlib constants/variables

linters-settings:
  funlen:
    lines: 80
    statements: 50
  gocyclo:
    min-complexity: 10
  nestif:
    min-complexity: 5
  goconst:
    min-len: 3
    min-occurrences: 3
  dupl:
    threshold: 100
  gocritic:
    enabled-tags:
      - diagnostic
      - experimental
      - opinionated
      - performance
      - style
  depguard:
    rules:
      main:
        deny:
          - pkg: "io/ioutil"
            desc: "Deprecated since Go 1.16 — use io and os packages"
          - pkg: "github.com/pkg/errors"
            desc: "Use fmt.Errorf with %w for error wrapping"
  revive:
    config-file: revive.toml
  errcheck:
    check-type-assertions: true
    check-blank: true

issues:
  max-issues-per-linter: 0
  max-same-issues: 0
  exclude-rules:
    # Test files: relax length and duplication rules
    - path: _test\.go
      linters:
        - funlen
        - dupl
        - goconst
```

## Linter Rationale

**Error handling group**: Go's explicit error handling is only useful if errors are actually checked and wrapped with context. These linters catch the most common AI mistakes — dropping errors from Close(), returning nil instead of the error, and losing error chain context.

**Security group**: AI-generated code frequently uses `http.Get()` without context (no timeout), forgets to check `rows.Err()`, and leaves SQL connections open. These are production incidents waiting to happen.

**Complexity group**: AI tends to generate long functions with deep nesting. These linters enforce the thresholds that keep code reviewable.

**Concurrency group**: Go's concurrency model is powerful but error-prone. These catch loop variable capture bugs and unsafe test parallelism — issues that only manifest under race conditions.

**Code quality group**: Catch duplication, magic numbers, deprecated APIs, and other hygiene issues that compound over time.
