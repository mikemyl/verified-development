# ADR 0001 — Enforced Test Taxonomy: design decisions

**Status:** Accepted
**Date:** 2026-06-28
**Feature:** enforced-test-taxonomy
**Context:** Agentic TDD raised coverage but collapsed test readability (function-shaped tests, scattered assertions, no clear boundary). The fix makes the test boundary and scenario traceability machine-checked properties of plan tasks. These are the cross-cutting decisions taken during spec/plan; the per-decision audit trail is in `.verified/features/enforced-test-taxonomy/discussion.md` and `concerns.md`.

## D-a — Three single-concern libs, not one
`waves.js` (parse), `taxonomy.js` (resolve repo-or-seed), `test-gate.js` (policy/verdict). Follows the plugin's one-lib-per-concern precedent (`handoff.js`, `state.js`, `waves.js`). The shared data contract — the task object — is published as a JSDoc `@typedef Task` in `waves.js`; `test-gate.js` consumes that documented shape via `parsePlan` rather than reimplementing parsing.
**Rejected:** folding the gate into `waves.js` (couples scheduling and test policy); a black-box `parsePlan` call with no documented contract (silent breakage on shape change).

## D-b — Seed taxonomy is one markdown artifact serving two roles
`hooks/lib/test-types-seed.md` is BOTH the gate's fallback data (parsed by `taxonomy.js` when a repo defines no taxonomy) AND the scaffolding template `/map` and `/init` copy into a repo's `.verified/codebase/TESTING.md`. Gate-parseable fields are canonical; the same file is human-readable.
**Rejected:** separate fallback-data and template files (drift between what the gate enforces and what repos are told to write).
**Consequence:** a new field needed for only one role must stay parse-compatible; template prose the gate doesn't parse is ignored, not an error.

## D-c — Repo taxonomy is authoritative, not merged
When a repo defines its own `## Test Types`, that list fully replaces the seed; seed-only types (e.g. `dao`) are absent unless re-declared.
**Rejected:** merging seed + repo (a repo that intentionally removed a type would silently get it back from the seed).
**Consequence (surprise to guard):** a repo that defines a taxonomy loses `acceptance` etc. unless it re-declares them. The seed only fills the gap when a repo defines nothing.

## D-d — Blocks are deterministic exit codes, no new LLM critic
The type/traceability gate is `test-gate.js` (exit 0 ok · 1 usage · 2 blocked · 3 malformed taxonomy). No model judgment in a block. The existing `plan-critic-acceptance` still covers semantic scenario coverage; this gate covers the mechanically-checkable part (type present, type sanctioned, scenario referenced, scenario exists, scenario served).

## D-e — Sign-off approvals persist in `test-signoffs.json`
`sign-off`-tier types (`unit`, `none`) block until the user approves per task. Approvals persist in `.verified/features/<feature>/test-signoffs.json` (machine-readable id list); `/plan` reads it, passes `--approved` to the gate, writes new approvals, re-runs. `concerns.md` stays critic-output only.
**Rejected:** recording approvals in `concerns.md` (conflates automated critic findings with interactive human decisions); in-context-only state (lost across sessions / `/implement` re-run).

## D-f — Scenario-id pattern configurable, tolerant default
The gate extracts spec scenario ids with a default tolerant regex (`AS-001`, `S001`, `SC-01`, `FR-001` forms), overridable via `scenarioPattern` (and `config.json` `workflows.scenario_id_pattern`). Default chosen so existing specs work unmodified across arbitrary repos.
**Rejected:** hardcoded `AS-\d+` (breaks on repos using other id conventions — silent false UNSERVED/vacuous-pass failures).

## Accepted residual risk
**EC-007:** an agent can still smuggle a behavioral task past traceability by labelling it `(test: none)`. Mitigated (not eliminated) by `none` being sign-off tier plus the human-visible `## Test Boundaries` summary. Fully preventing it is out of scope.

## FR-015 enforcement level
Named canonical harness primitives per type are **prose-enforced** (seed + `/map`), not gate-checked — deliberately, to avoid scope creep in the gate contract.
