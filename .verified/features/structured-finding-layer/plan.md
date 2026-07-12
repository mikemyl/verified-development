# Implementation Plan: structured-finding-layer

## Context

Producer-only SARIF finding envelope (see spec.md, discussion.md). Build `hooks/lib/findings.js`
(pure SARIF→envelope: normalize, dedup, buildEnvelope, scan orchestration + CLI), a Go
static-analysis adapter under `hooks/lib/findings/go.js` (golangci-lint, runtime tool seam separate
from the pure parser), and wire `/verify` to surface the envelope as a non-blocking section. All
`hooks/lib` code is model-free and unit-tested against SARIF **fixtures** — no tool is invoked in
any test. No npm deps.

The whole findings core is one file (`hooks/lib/findings.js`) built test-first in layers, so the
test/impl pairs form a sequential chain (each depends on the previous). The Go adapter and the
`/verify` wiring are separate files.

## Tasks

### Phase 1: Envelope core (pure functions)

- [ ] T001 Write tests for `normalize(sarifText, {tool, lang})`: one SARIF result → one finding with prefixed `<tool>.<lang>.<rule>` id; severity map error→error, warning→warning, note→suggestion; missing `location` → `{file: "unknown", line: 0}` (EC-003); missing `ruleId` → `<tool>.<lang>.unknown` (EC-004); parsing invokes no external tool (files: `tests/findings.test.cjs`) (test: lib-unit) (scenario: AS-1, AS-2, AS-10)
- [ ] T002 Implement `findings.js` `normalize()` + severity map + rule-id prefixing per T001 (files: `hooks/lib/findings.js`) (depends on T001) (test: lib-unit) (scenario: AS-1, AS-2)
- [ ] T003 Write tests for `dedup(findings)` — **within-adapter** dedup (rule_ids are tool-prefixed): identical `file`+`line`+`rule_id` collapse to one (EC-006); findings differing in file, line, OR rule_id are kept separate — incl. two findings at the same `file:line` with different `rule_id`s (files: `tests/findings.test.cjs`) (depends on T002) (test: lib-unit) (scenario: AS-3)
- [ ] T004 Implement `findings.js` `dedup()` per T003 (files: `hooks/lib/findings.js`) (depends on T003) (test: lib-unit) (scenario: AS-3)
- [ ] T005 Write tests for `buildEnvelope({scope, findings, skipped})`: `schema == "findings/v1"`; `summary` counts by severity; empty results → `findings: []` + `status: "ok"` (EC-001); no findings + no adapters run → `status: "skip"`; **`skipped` entry shape is exactly `{lang, tool, reason, hint}`** (files: `tests/findings.test.cjs`) (depends on T004) (test: lib-unit) (scenario: AS-9)
- [ ] T006 Implement `findings.js` `buildEnvelope()` + `findings/v1` schema + summary + status + `skipped` shape per T005 and ADR 0003 (files: `hooks/lib/findings.js`) (depends on T005) (test: lib-unit) (scenario: AS-9)

### Phase 2: Go adapter

- [ ] T007 Add a golangci-lint SARIF fixture (hand-authored to golangci-lint ≥ 1.55 SARIF output; record the captured version in a comment atop the fixture) and write tests for the Go adapter's pure normalize: two results across two files → two findings with `golangci-lint.go.<rule>` ids and correct `file:line` (files: `tests/findings-go.test.cjs`, `tests/fixtures/golangci-lint.sarif`) (depends on T006) (test: lib-unit) (scenario: AS-7)
- [ ] T008 Implement `hooks/lib/findings/go.js`: exports `{lang: "go", extensions: [".go"], tool: "golangci-lint", run(scope)}`. `run` is the runtime seam — it invokes golangci-lint at **module/package scope** (`golangci-lint run --out-format sarif ./...`, NOT per-file: golangci-lint is package-aware and per-file invocation drops cross-file findings), returns SARIF text or `null` when the tool is absent. Normalization defers to `findings.js` `normalize()`. (files: `hooks/lib/findings/go.js`) (depends on T007) (test: lib-unit) (scenario: AS-7)

### Phase 3: scan() orchestration

- [ ] T009 Write tests for `scan()` discovery: adapters auto-load from `hooks/lib/findings/` by extension; a scope with no `.go` files never probes the Go tool (AS-5); a **mixed** scope (`.go` + an unsupported extension) runs the Go adapter and does not error on the unsupported files (files: `tests/findings.test.cjs`) (depends on T008) (test: lib-unit) (scenario: AS-5)
- [ ] T010 Implement `findings.js` `scan()` adapter loader + language-conditional probing per T009 (files: `hooks/lib/findings.js`) (depends on T009) (test: lib-unit) (scenario: AS-5)
- [ ] T011 Write tests for `scan()` graceful-degradation matrix: no tool available → `status: "skip"`, exit 0 (AS-4); tool crashes / is absent → adapter in `skipped` with a hint, status never `"fail"` (AS-6); malformed SARIF → skip-with-hint, no crash (EC-002); scope of only-unsupported languages → `status: "skip"` + explicit note (EC-005); CLI usage error (missing/invalid scope arg) → exit 1 (FR-009) (files: `tests/findings.test.cjs`) (depends on T010) (test: lib-unit) (scenario: AS-4, AS-6)
- [ ] T012 Implement `findings.js` `scan()` graceful degradation + status derivation + the `scan <scope>` CLI (exit 0 ok/skip, 1 usage; never non-zero for findings) per T011 (files: `hooks/lib/findings.js`) (depends on T011) (test: lib-unit) (scenario: AS-4, AS-6)

### Phase 4: /verify wiring (non-blocking)

- [ ] T013 Write anchor test: `skills/verify/SKILL.md` runs `findings.js` and surfaces the envelope as a NON-BLOCKING section, and the wiring text states the envelope never flips the pass/fail gate. (Note: SC-005's "a test proves non-gating" is satisfied at the anchor level — a skill step can't run a live `/verify` in a unit test; the non-gating guarantee is enforced by FR-009's CLI contract, unit-tested in T011/T012.) (files: `tests/findings-verify.test.cjs`) (depends on T012) (test: prompt-anchor) (scenario: AS-8)
- [ ] T014 Wire `/verify`: add a step that runs `findings.js scan` and surfaces the `findings/v1` envelope as an informational section, explicitly non-gating (the repo's existing verify command stays the sole gate) per T013 (files: `skills/verify/SKILL.md`) (depends on T013) (test: prompt-anchor) (scenario: AS-8)

## Task Legend
- `(files: a, b)` = the file surface this task creates/modifies (wave-collision input).
- `(depends on TXXX)` = ordering.
- `(test: <type>)` = sanctioned test type; `(scenario: <id>)` = spec scenario(s) served.

## Waves

Computed by `hooks/lib/waves.js` (exit 0, no collisions, `parallel: false`). The plan is a fully
sequential test→implement chain (the envelope core is one file built in layers), so every wave is a
single task: `Wave N → T00N` for N = 1..14. No parallel waves → the parallelization critic is not
spawned.

## Test Boundaries

Computed by `hooks/lib/test-gate.js` (exit 0, not blocked). Every task declares a sanctioned type
and serves a real spec scenario:

| Task | Test type | Scenarios |
|------|-----------|-----------|
| T001 | lib-unit | AS-1, AS-2, AS-10 |
| T002 | lib-unit | AS-1, AS-2 |
| T003 | lib-unit | AS-3 |
| T004 | lib-unit | AS-3 |
| T005 | lib-unit | AS-9 |
| T006 | lib-unit | AS-9 |
| T007 | lib-unit | AS-7 |
| T008 | lib-unit | AS-7 |
| T009 | lib-unit | AS-5 |
| T010 | lib-unit | AS-5 |
| T011 | lib-unit | AS-4, AS-6 |
| T012 | lib-unit | AS-4, AS-6 |
| T013 | prompt-anchor | AS-8 |
| T014 | prompt-anchor | AS-8 |

## Verification
- Run `node tests/run.cjs` (the repo's verify) after all tasks complete.
- Run `/review` for two-stage code review.

## Decisions
- **The `findings/v1` envelope contract → ADR `.verified/decisions/0003-findings-envelope-contract.md`**
  (SARIF-as-interchange, tool-prefixed rule ids, within-adapter dedup, non-gating `status` with no
  `fail`). A cross-feature durable contract like `plan-waves/v1`/`test-gate/v1`, so it gets an ADR
  (per plan-critic-design).
- **Adapters live in `hooks/lib/findings/` (new dir), not the test-corpus `hooks/lib/lang/` dir.**
  Keeps the two adapter contracts decoupled — test-corpus adapters have a locked
  `{discover, countAssertions}` shape; findings adapters have a `{run}` shape. Same *pattern*
  (auto-load by extension), separate registry. A directory choice, recorded here (not ADR-worthy).
- **`normalize()` is pure; the tool invocation is the adapter's `run()` seam.** Enables model-free
  fixture tests with no toolchain (SC-003), mirroring `test-corpus.js`.
- **Cross-tool dedup deferred** (EC-006/FR-004): with tool-prefixed rule ids, dedup is
  within-adapter; suppressing tool B when tool A flags the same line needs a precedence policy that
  arrives with the second adapter.
