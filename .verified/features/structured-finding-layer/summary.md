# Implementation Summary: structured-finding-layer

**Completed:** 2026-07-12
**Tasks:** 14/14

## What Was Built
- `hooks/lib/findings.js` — pure SARIF→envelope core: `normalize()` (tool-prefixed rule ids,
  severity map, missing-location/ruleId handling), `dedup()` (within-adapter), `buildEnvelope()`
  (`findings/v1`, summary counts, `status` ok/skip, pinned `skipped` shape, optional `note`),
  `scan()` (extension-keyed adapter loader, language-conditional probing, graceful degradation),
  and a `scan <path>` CLI (exit 0 ok/skip, 1 usage; never non-zero for findings).
- `hooks/lib/findings/go.js` — Go adapter: `{lang, extensions, tool, run, normalize}`; `run()`
  invokes golangci-lint at module scope (`run --out-format sarif ./...`), returns null when absent.
- `skills/verify/SKILL.md` — new step 3b surfaces the envelope as a **non-blocking** section; the
  repo's existing verify command stays the sole gate.
- `.verified/decisions/0003-findings-envelope-contract.md` — ADR for the `findings/v1` contract.

## Test Coverage
- 3 test files: `tests/findings.test.cjs` (23 cases), `tests/findings-go.test.cjs` (2),
  `tests/findings-verify.test.cjs` (2) — **27 new cases**.
- Model-free: every test runs against SARIF fixtures / injected fake adapters; no external tool is
  invoked (SC-003). Fixture `tests/fixtures/golangci-lint.sarif`.
- Full suite: 305 passed, 0 failed. `scripts/lint-descriptions.cjs`: 0 violations.

## Decisions Made
- ADR 0003 — `findings/v1` envelope (SARIF interchange, tool-prefixed ids, within-adapter dedup,
  non-gating status). Cross-tool dedup deferred (FR-004/EC-006).
- Adapters in a new `hooks/lib/findings/` dir (decoupled from the test-corpus `hooks/lib/lang/`).

## Scope boundary held (SC-007)
- No `/review` finding-injection and no self-heal fix-loop — both are follow-up features.
- Producer only: `/verify` surfaces the envelope; no review-behavior change.
