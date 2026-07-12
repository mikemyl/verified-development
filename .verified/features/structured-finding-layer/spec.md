# Feature: structured-finding-layer

## Context

Today `/verify` gets a single opaque pass/fail from `just verify` (or the repo's equivalent). There
is no structured, per-finding stream — so nothing downstream (review agents, future self-heal) can
consume "what exactly did the linters find, where." This feature adds a deterministic
finding-normalization layer that turns whatever static-analysis tools a repo has into one versioned
envelope, using SARIF as the interchange format.

Scope is deliberately narrow (see `discussion.md`): the **producer only**. `hooks/lib/findings.js`
+ a Go/golangci-lint SARIF adapter, and `/verify` surfaces the envelope as a **non-blocking
informational section**. The `/review` "don't re-report these" injection and the static self-heal
fix-loop are separate follow-up features. Review behavior does not change here.

Beneficiary: `/verify` gains a structured findings view now; the envelope is the substrate the next
two features build on. It follows the plugin's doctrine — a script produces the structured data
model-free (like `waves.js`, `test-gate.js`, `test-corpus.js`), and graceful degradation is
first-class so a missing or broken linter never blocks a green build.

## Acceptance Scenarios

### AS-1 — Normalize a SARIF result into the envelope
Given a SARIF document with one `error`-level result at `foo.go:12`,
When `findings.js` normalizes it (Go/golangci-lint context),
Then the envelope contains one finding with `severity: "error"`, `file: "foo.go"`, `line: 12`, and a
rule id prefixed `golangci-lint.go.<rule>`.

### AS-2 — SARIF severity maps to our vocabulary
Given SARIF results at levels `error`, `warning`, and `note`,
When normalized,
Then their findings carry severity `error`, `warning`, and `suggestion` respectively.

### AS-3 — Duplicate findings collapse
Given two results at the same `file` + `line` + rule id,
When the envelope is built,
Then they collapse to a single finding (dedup), and two results at the same file+line but
*different* rule ids are kept separate.

### AS-4 — No tool available is a skip, never a failure
Given no configured static-analysis tool is available for any language in scope,
When `findings.js` runs,
Then the envelope `status` is `skip` and the process exits `0` — it never reports a failure.

### AS-5 — Language-conditional probing
Given the changed scope contains no `.go` files,
When `findings.js` runs,
Then the Go adapter's tool is not probed or invoked (no "golangci-lint missing" noise on a non-Go
change).

### AS-6 — A crashing or missing linter degrades, never blocks
Given the Go adapter's tool is installed but exits non-zero for its own internal reason (crash) or
is absent,
When `findings.js` runs,
Then that adapter degrades to skip-with-hint, the envelope `status` is never `fail`, and a green
build is never blocked by the linter's absence or crash.

### AS-7 — Go adapter parses golangci-lint SARIF
Given a golangci-lint `--out-format sarif` fixture with two findings across two files,
When the Go adapter normalizes it,
Then both findings appear with go-prefixed rule ids and correct `file:line`.

### AS-8 — /verify surfaces the envelope without changing the gate
Given `/verify` runs on a repo,
When `findings.js` produces an envelope,
Then `/verify` surfaces a structured findings section, and the pass/fail gate remains driven solely
by the repo's existing verify command — the envelope never flips it (informational, like the Farley
score).

### AS-9 — Versioned contract
Given any envelope,
When it is produced,
Then `envelope.schema == "findings/v1"`.

### AS-10 — Parsing needs no toolchain
Given only a SARIF string (a fixture),
When `normalize()` is called,
Then it returns findings without invoking any external tool — the parser is pure and model-free.

## Requirements

- **FR-001** `hooks/lib/findings.js` exposes `normalize(sarifText, {tool, lang}) → findings[]`,
  parsing SARIF `runs[].results[]` into unified findings `{rule_id, file, line, severity, message,
  tool, lang}`.
- **FR-002** Rule ids are prefixed `<tool>.<lang>.<rule>` so findings from different tools/languages
  never collide.
- **FR-003** SARIF level → severity mapping: `error→error`, `warning→warning`, `note→suggestion`
  (documented, deterministic).
- **FR-004** `findings.js` dedups by `file` + `line` + `rule_id`; findings differing in any of the
  three are kept separate. Because `rule_id` is tool-prefixed (FR-002), this is **within-adapter**
  dedup — it collapses a tool that reports the same issue twice. Two *different* tools flagging the
  same line for different reasons carry different `rule_id`s and are correctly kept as separate
  findings. True cross-tool overlap suppression (a precedence policy that hides tool B's finding
  when tool A already reported the same line) is explicitly **deferred** until a second adapter
  exists — it needs a precedence chain this single-adapter feature does not define.
- **FR-005** `findings.js` emits a versioned envelope `findings/v1`:
  `{schema, scope, findings, summary, skipped, status}` where `status ∈ {ok, skip}`, `summary`
  carries counts by severity, and `skipped` lists adapters that were skipped with a reason.
- **FR-006** Graceful degradation: no configured tool for any in-scope language → `status: skip`,
  exit `0`; a missing or crashing tool → that adapter added to `skipped` with a hint, never a
  non-zero exit and never `status: fail`.
- **FR-007** Per-language adapters are auto-loaded by file extension (mirroring the test-corpus lang
  adapters). A Go adapter runs `golangci-lint --out-format sarif`; its tool invocation is a runtime
  seam distinct from the pure `normalize()` parser.
- **FR-008** Language-conditional probing: an adapter's tool is only probed/invoked when a file of
  its extension is present in the scanned scope.
- **FR-009** CLI: `findings.js scan <scope>` prints the envelope JSON. Exit codes: `0` ok/skip · `1`
  usage error. (No exit code means "linter found problems" — findings are data, not a gate.)
- **FR-010** `/verify` runs `findings.js` and surfaces the envelope as a non-blocking informational
  section; the repo's existing verify command remains the sole pass/fail gate.
- **FR-011** No npm dependencies; Node-only; model-free (mirrors the sibling `hooks/lib` modules).

## Edge Cases

- **EC-001** SARIF with an empty `results` array → `findings: []`, `status: ok` (a clean run, not a
  skip).
- **EC-002** Malformed SARIF (invalid JSON) from a tool → the adapter degrades to skip-with-hint
  naming the tool; the pipeline is not crashed.
- **EC-003** A SARIF result with no `location` / `physicalLocation` → finding recorded with a
  sentinel (`file: unknown`, `line: 0`), not a crash.
- **EC-004** A SARIF result with no `ruleId` → the finding is kept with a synthesized
  `<tool>.<lang>.unknown` id (never dropped silently).
- **EC-005** Scope contains only unsupported languages (no adapter) → `status: skip` with an
  explicit note (mirrors `test-audit`'s only-unsupported behavior), not a misleading empty `ok`.
- **EC-006** One tool/adapter emits the same `file` + `line` + `rule_id` twice (a double-report) →
  deduped to one. Conversely, two findings at the same `file:line` with *different* `rule_id`s
  (e.g. two different linters, or two rules of one linter) are kept **separate** — that is not a
  duplicate. (Cross-tool overlap suppression is deferred; see FR-004.)

## Success Criteria

- **SC-001** Every acceptance scenario has a corresponding test.
- **SC-002** All verification gates pass (the project's verify command).
- **SC-003** `findings.js` is unit-tested model-free against SARIF **fixtures** — no external tool is
  invoked in any test.
- **SC-004** No new npm dependencies; the module follows the existing no-deps `hooks/lib` pattern.
- **SC-005** A test proves the envelope is **non-gating**: a `/verify` run with findings present
  does not flip the pass/fail result (behavior parity with the pre-feature gate).
- **SC-006** Graceful-skip is proven: absent-tool and crashing-tool fixtures both yield a non-`fail`
  status and exit `0`.
- **SC-007** The `/review` injection and the self-heal fix-loop are NOT introduced by this feature
  (scope boundary held).
