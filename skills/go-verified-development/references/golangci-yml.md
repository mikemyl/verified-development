# .golangci.yml Configuration

Use when scaffolding a new Go project with `/init`. Based on https://gist.github.com/maratori/47a4d00457a92aa426dbd48a18776322

Replace `{MODULE_PATH}` with your Go module path (from go.mod).

```yaml
# Based on https://gist.github.com/maratori/47a4d00457a92aa426dbd48a18776322

version: "2"

issues:
  max-same-issues: 500

formatters:
  enable:
    - goimports
    - golines
    - gci
    - gofmt

  settings:
    goimports:
      local-prefixes:
        - {MODULE_PATH}

    gci:
      sections:
        - standard
        - default
        - prefix({MODULE_PATH})
      custom-order: true

    golines:
      max-len: 160

linters:
  enable:
    - asasalint         # check for pass []any as any in variadic func(...any)
    - asciicheck         # check for non-ASCII identifiers
    - bidichk            # check for dangerous unicode character sequences
    - bodyclose          # check HTTP response body is closed
    - canonicalheader    # check for non-canonical HTTP header names
    - copyloopvar        # detect loop variable copies (Go 1.22+)
    - cyclop             # check function and package cyclomatic complexity
    - depguard           # block imports of deprecated/unwanted packages
    - dupl               # detect duplicate code fragments
    - durationcheck      # check for incorrect time.Duration multiplication
    - errcheck           # check for unchecked errors
    - errname            # check error variable naming conventions
    - errorlint          # find code that can cause problems with error wrapping
    - exhaustive         # check exhaustiveness of enum switch/map
    - exptostd           # detect replaceable golang.org/x/ usage with stdlib
    - fatcontext         # detect nested context in loops
    - forbidigo          # forbid specific identifiers (e.g., fmt.Print)
    - funcorder          # check function declaration order
    - funlen             # detect long functions
    - gocheckcompilerdirectives  # check go:generate directives
    - gochecknoglobals   # check that no global variables exist
    - gochecknoinits     # check that no init functions exist
    - gochecksumtype      # check sum type exhaustiveness
    - gocognit           # check cognitive complexity
    - goconst            # find repeated strings that could be constants
    - gocritic           # opinionated Go linter (diagnostic, style, performance)
    - gocyclo            # check cyclomatic complexity
    - godot              # check that comments end in a period
    - gomoddirectives    # manage the use of 'replace' in go.mod
    - goprintffuncname   # check that printf-like functions end with f
    - gosec              # security issues
    - govet              # go vet with all analyzers
    - iface              # detect unused interface constraints
    - ineffassign        # detect ineffectual assignments
    - intrange           # find places where integer range could be used
    - loggercheck        # check structured logger arguments
    - makezero           # find slice declarations not initialized with zero length
    - mirror             # suggest use of alternative functions for efficiency
    - musttag            # enforce field tags in marshaled structs
    - nakedret           # find naked returns in long functions
    - nestif             # detect deeply nested if statements
    - nilerr             # find code returning nil instead of the error
    - nilnesserr         # detect returning nil error after nil check
    - nilnil             # check for returning nil, nil
    - noctx              # find HTTP requests without context
    - nolintlint         # require explanation for nolint directives
    - nonamedreturns     # disallow named returns
    - nosprintfhostport  # check for misuse of Sprintf for host:port
    - perfsprint         # detect fmt.Sprint replaceable with strconv
    - predeclared        # find shadowed predeclared identifiers
    - promlinter         # check Prometheus metrics naming
    - protogetter        # check proto message field access
    - reassign           # detect variable reassignment
    - recvcheck          # check receiver type consistency
    - revive             # extensible linter (configured below)
    - rowserrcheck       # check sql.Rows.Err() is called
    - sloglint           # ensure consistent structured logging
    - spancheck          # check OpenTelemetry span usage
    - sqlclosecheck      # check SQL connections are closed
    - staticcheck        # advanced static analysis
    - testableexamples   # check testable example functions
    - testifylint        # check testify usage patterns
    - testpackage        # enforce _test package for tests
    - tparallel          # detect unsafe parallel test patterns
    - unconvert          # detect unnecessary type conversions
    - unparam            # detect unused function parameters
    - unused             # detect unused code
    - usestdlibvars      # detect possibility to use stdlib vars/consts
    - usetesting         # detect os.TempDir in tests (use t.TempDir)
    - wastedassign       # detect wasted assignments
    - whitespace         # detect unnecessary blank lines
    - exhaustruct        # check struct fields are fully initialized
    - ireturn            # check interface returns
    - interfacebloat     # check interface method count
    - decorder           # check declaration order and count
    - wrapcheck          # check errors are wrapped

  settings:
    cyclop:
      max-complexity: 30
      package-average: 10.0

    depguard:
      rules:
        "deprecated":
          files:
            - "$all"
          deny:
            - pkg: github.com/golang/protobuf
              desc: Use google.golang.org/protobuf instead
            - pkg: github.com/satori/go.uuid
              desc: Use github.com/google/uuid instead, satori's package is not maintained
            - pkg: github.com/gofrs/uuid$
              desc: Use github.com/gofrs/uuid/v5 or later
        "non-test files":
          files:
            - "!$test"
          deny:
            - pkg: math/rand$
              desc: Use math/rand/v2 instead, see https://go.dev/blog/randv2
        "non-main files":
          files:
            - "!**/main.go"
          deny:
            - pkg: log$
              desc: Use log/slog instead, see https://go.dev/blog/slog

    errcheck:
      check-type-assertions: true

    exhaustive:
      check:
        - switch
        - map

    exhaustruct:
      allow-empty: true
      allow-empty-returns: true
      exclude:
        # std libs
        - ^net/http.Client$
        - ^net/http.Cookie$
        - ^net/http.Request$
        - ^net/http.Response$
        - ^net/http.Server$
        - ^net/http.Transport$
        - ^net/url.URL$
        - ^os/exec.Cmd$
        - ^reflect.StructField$
        # common libs
        - ^github.com/spf13/cobra.Command$
        - ^github.com/spf13/cobra.CompletionOptions$
        - ^github.com/stretchr/testify/mock.Mock$
        - ^golang.org/x/tools/go/analysis.Analyzer$
        - ^google.golang.org/protobuf/.+Options$
        - ^gopkg.in/yaml.v3.Node$

    funcorder:
      struct-method: false

    funlen:
      lines: 100
      statements: 50

    gochecksumtype:
      default-signifies-exhaustive: false

    gocognit:
      min-complexity: 20

    gocritic:
      settings:
        captLocal:
          paramsOnly: false
        underef:
          skipRecvDeref: false

    govet:
      enable-all: true
      disable:
        - fieldalignment
      settings:
        shadow:
          strict: true

    inamedparam:
      skip-single-param: true

    mnd:
      ignored-functions:
        - args.Error
        - flag.Arg
        - flag.Duration.*
        - flag.Float.*
        - flag.Int.*
        - flag.Uint.*
        - os.Chmod
        - os.Mkdir.*
        - os.OpenFile
        - os.WriteFile
        - prometheus.ExponentialBuckets.*
        - prometheus.LinearBuckets

    interfacebloat:
      max: 20

    nakedret:
      max-func-lines: 0

    nolintlint:
      allow-no-explanation: [ funlen, gocognit, golines ]
      require-explanation: true
      require-specific: true

    perfsprint:
      strconcat: false

    reassign:
      patterns:
        - ".*"

    rowserrcheck:
      packages:
        - github.com/jmoiron/sqlx

    sloglint:
      no-global: all
      context: scope

    staticcheck:
      checks:
        - all
        - -ST1000
        - -ST1016
        - -QF1008

    usetesting:
      os-temp-dir: true

    revive:
      rules:
        - name: dot-imports
          # Add your test packages here to allow dot imports in tests:
          # arguments:
          #   - allowedPackages:
          #       - "{MODULE_PATH}/testing/dsl"
          #       - "{MODULE_PATH}/testing/fixtures"

  exclusions:
    warn-unused: true
    presets:
      - std-error-handling
      - common-false-positives
    rules:
      - source: 'TODO'
        linters: [ godot ]
      - text: 'should have a package comment'
        linters: [ revive ]
      - text: 'exported \S+ \S+ should have comment( \(or a comment on this block\))? or be unexported'
        linters: [ revive ]
      - text: 'package comment should be of the form ".+"'
        source: '// ?(nolint|TODO)'
        linters: [ revive ]
      - text: 'comment on exported \S+ \S+ should be of the form ".+"'
        source: '// ?(nolint|TODO)'
        linters: [ revive, staticcheck ]
      - path: '_test\.go|fixtures/'
        linters:
          - bodyclose
          - dupl
          - errcheck
          - funlen
          - goconst
          - gosec
          - noctx
          - wrapcheck
```

## Key Differences from Minimal Configs

This config is comprehensive and battle-tested. Notable choices:

**Formatters section** — goimports, golines (160 char max), gci (import grouping), gofmt. Ensures consistent formatting beyond what `go fmt` provides.

**Exhaustiveness checks** — `exhaustive` checks switch/map completeness on enums. `exhaustruct` ensures struct fields are explicitly set (with sensible exclusions for common stdlib/lib types).

**No globals, no init** — `gochecknoglobals` and `gochecknoinits` enforce initialization through constructors and dependency injection.

**Strict error handling** — `errcheck` with type assertions, `wrapcheck` for error wrapping, `nilerr` and `nilnesserr` for nil-instead-of-error returns.

**Logging discipline** — `sloglint` enforces structured logging via slog. `depguard` blocks `log` package outside main.go (forces slog).

**Test file relaxations** — bodyclose, dupl, errcheck, funlen, goconst, gosec, noctx, wrapcheck are relaxed in test files and fixtures, since test code has different constraints.

**Complexity thresholds** — cyclop max 30 (package average 10), gocognit min 20, funlen 100 lines / 50 statements. These are practical thresholds that flag genuinely problematic code without being overly strict.

**nolint discipline** — `nolintlint` requires explanation and specific linter name for all nolint directives (except funlen, gocognit, golines).

### Customization

When scaffolding a new project:
1. Replace `{MODULE_PATH}` with your module path
2. Add your test packages to the revive dot-imports allowlist
3. Add project-specific exhaustruct exclusions for domain-specific types
4. Adjust `rowserrcheck` packages if using a different SQL library
