# revive.toml Configuration

Use when scaffolding a new Go project with `/init`.

```toml
# All violations are errors — no warnings tolerated
ignoreGeneratedHeader = false
severity = "error"
confidence = 0.8
errorCode = 1
warningCode = 1

# --- Complexity ---

[rule.cyclomatic]
  severity = "error"
  arguments = [10]

[rule.cognitive-complexity]
  severity = "error"
  arguments = [15]

[rule.argument-limit]
  severity = "error"
  arguments = [5]

[rule.function-result-limit]
  severity = "error"
  arguments = [3]

[rule.function-length]
  severity = "error"
  arguments = [80, 50]

[rule.max-public-structs]
  severity = "warning"
  arguments = [5]

# --- Concurrency ---

[rule.modifies-value-receiver]
[rule.waitgroup-by-value]
[rule.atomic]
[rule.range-val-in-closure]
[rule.range-val-address]

# --- Error handling ---

[rule.error-return]
[rule.error-strings]
[rule.error-naming]

# --- Logic errors ---

[rule.constant-logical-expr]
[rule.identical-branches]
[rule.unconditional-recursion]
[rule.unhandled-error]
  arguments = [
    "fmt.Printf",
    "fmt.Println",
    "fmt.Print"
  ]

# --- Naming & idioms ---

[rule.var-naming]
[rule.var-declaration]
[rule.package-comments]
[rule.dot-imports]
[rule.blank-imports]
[rule.context-as-argument]
[rule.context-keys-type]
[rule.indent-error-flow]
[rule.unused-parameter]
[rule.redefines-builtin-id]
[rule.exported]
[rule.unexported-return]
[rule.receiver-naming]
[rule.time-naming]
[rule.time-equal]
[rule.errorf]
[rule.empty-block]
[rule.superfluous-else]
[rule.unreachable-code]
[rule.defer]
  arguments = [["call-chain", "loop", "method-call", "recover", "immediate-recover", "return"]]
```

## Rule Rationale

### Complexity Rules
- **cyclomatic=10**: Functions with more than 10 decision paths are too complex to review reliably
- **cognitive-complexity=15**: Measures human difficulty reading code (nesting, breaks in flow)
- **argument-limit=5**: More than 5 args means the function needs an options struct
- **function-result-limit=3**: More than 3 returns signals the function does too much
- **function-length=80/50**: Long functions hide bugs; 80 lines / 50 statements is the limit

### Concurrency Rules
- **modifies-value-receiver**: Methods on value receivers silently lose modifications
- **waitgroup-by-value**: Copying a WaitGroup breaks synchronization
- **atomic**: Non-atomic operations on shared state cause races
- **range-val-in-closure/address**: Classic Go gotcha — loop variable captured by reference

### Error Handling Rules
- **error-return**: Error should be the last return value
- **error-strings**: Error strings should not be capitalized or end with punctuation
- **error-naming**: Error variables should be named `err` or `errFoo`

### Logic Error Rules
- **constant-logical-expr**: Catches `if x || true` tautologies
- **identical-branches**: if/else with identical code is always a bug
- **unconditional-recursion**: Infinite recursion without base case
- **unhandled-error**: fmt.Print* errors matter in production (log pipelines, redirected output)

### Naming & Idiom Rules
- **indent-error-flow**: Forces early returns (happy path not nested)
- **context-as-argument**: Context must be first parameter
- **redefines-builtin-id**: Prevents shadowing `error`, `len`, `cap`, etc.
- **blank-imports**: Only valid in main packages and test files
