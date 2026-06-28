# Discussion: test-audit

Spec-time stress test audit trail. Options considered and rejected, not only the chosen direction.

## Problem framing

The forward gate (enforced-test-taxonomy, v1.7.0) blocks NEW under-tested plan tasks. It does nothing for the large body of ALREADY-MERGED tests that predate the taxonomy — keros-platform has mapping tests, internal/unit-style tests, and mcp_oauth tests with their own pattern, all hard to read and reason about as user behavior. `test-audit` is the retroactive, advisory counterpart: sweep an existing test corpus, triage it against the repo taxonomy, produce a ranked worklist to chip away at over time. Advisory only — it audits merged code, so it never blocks.

Distinct from `/review` (diff-scoped to the active feature) and `/assess` (whole-project standards gap). Its own verb, scoped to an arbitrary test-corpus path.

## Decisions

### D1 — Classification mechanism: hybrid (deterministic rank → LLM deep-dive)
- **Chosen:** a cheap deterministic pre-pass classifies/scores EVERY test by mechanical signals (path, imports, DSL/marker calls, assertion shape) and ranks the corpus worst-first; LLM sweep agents (`test-review`, `test-design-reviewer`) deep-review only the worst-ranked top-N. Scales to large suites, controls LLM cost, deterministic signal is reusable.
- **Rejected — pure LLM sweep:** accurate per-test but cost/latency scales linearly with corpus size (hundreds of Go test funcs); ranking itself becomes an LLM judgment.
- **Rejected — pure deterministic:** can't judge readability/traceability ("can a human read this as a behavior") — exactly the quality the user cares about; would mostly echo lint/coverage.
- Note: legacy tests carry NO annotation, so type must be INFERRED — unlike the forward gate which reads the `(test:)` annotation. This is why the audit is fundamentally heuristic+LLM, not a pure script.

### D2 — Deliverable: report-only with fix recommendations
- **Chosen:** a durable, ranked triage report (`.verified/audits/<module>-tests.md`), worst offenders first, each with inferred type, taxonomy match, readability/traceability verdict, Farley score, and a concrete recommendation. Read-only — never edits tests. User acts manually or feeds items into `/quick`/`/specify`.
- **Rejected — report + guided fix:** mixing audit with rewrite risks changing legacy test behavior; larger/riskier surface.
- **Rejected — report + JSON worklist export:** progress-tracking state is premature; revisit if chipping-away-over-time needs machine tracking. (Markdown report is human-trackable for now.)

### D3 — Match signals: extend taxonomy schema; require repo taxonomy
- **Chosen:** add OPTIONAL machine-matchable fields per `## Test Types` entry — `match-paths` (glob) and `match-markers` (identifier/regex tokens) — so the deterministic classifier can map a test to a type ("calls `Sends`/`Receives`, under `**/scenarios/**` → acceptance"). `/test-audit` REQUIRES a repo taxonomy (`.verified/codebase/TESTING.md`); if absent it instructs `/map` first — the generic seed can't recognize repo-specific types (handler, mapping, mcp_oauth). Additive, backward-compatible change to the v1.7.0 taxonomy; `taxonomy.js` parses the new fields, the seed gains example signals, `/map` populates them.
- **Rejected — infer from prose fields, no schema change:** prose `location`/`primitives` aren't globs/tokens; fuzzier classification, more unclassified fallthrough.
- **Rejected — LLM does classification too:** reintroduces per-test LLM cost, weakens the deterministic-where-possible goal.
- **Consequence:** this feature touches just-shipped v1.7.0 code (taxonomy.js, seed, /map). Must keep `match-paths`/`match-markers` OPTIONAL so the gate and existing repos without them keep working (forward gate doesn't need them).

## Open / to settle in spec
- Unit of analysis: per-test-function (Go `TestXxx`); language-aware, Go first.
- Ranking ("smell") signals for pass 1: unclassifiable/unsanctioned type, scattered-assertion count, function length, weak match to the type's expected pattern.
- top-N default for the LLM deep-dive (configurable).
- "Traceability" for a legacy test with no spec = can a human identify the user-observable behavior it asserts (an LLM readability judgment in pass 2), NOT a scenario-id match.

### D4 — Good/bad exemplars + craft rubric (added during spec)
- **Chosen:** the audit's deep-dive judges each test against an actor-BDD **craft rubric**, not just Farley. Two layers:
  - **Generic craft rules** live ONCE in `tdd-go` (single source, referenced — mirrors the Farley-rubric discipline; no duplication): fixtures declared at the top (not inline body vars); immutable fixture chaining (a derived fixture must not mutate its origin); assert only via `Sends`/`Receives` (no scattered raw `require`/`assert`); sequences (`Given…` helpers) to hide setup; captured/supplementary data for SUT-generated identifiers (never fetch-and-assert ids inline); short, single-behavior, readable.
  - **Per-type repo exemplars** live in the taxonomy: each `## Test Types` entry gets optional `good-example`, `bad-example`, and `anti-patterns`, populated by `/map` from the repo's real tests (e.g. acceptance → `TestShouldMarkReservationUploadedToShortTermRegistry`). Per-type because a `dao` test legitimately differs from an `acceptance` test.
- The deep-dive reports which good patterns hold and which anti-patterns are present (feeding the recommendation), scored against the test's resolved type's rubric.
- **Rejected — one global good/bad reference:** conflates types; a `dao`/`unit` test held to the acceptance `Sends`/`Receives` rubric yields false violations.
- **Rejected — audit prompt + tdd-go only, no taxonomy fields:** exemplars can't be repo-specific or `/map`-discoverable, and the rubric isn't inspectable in the repo's `TESTING.md`.
- Anti-patterns the user named (the bad exemplars): scattered assertions; inline variables instead of top fixtures; asserting on ids + capturing ids in-test instead of via captured data; raw `SendsAndAwaits`+`require`/`assert` instead of `Sends`/`Receives`; very long tests where the behavior under test is unclear.

## Residual / out of scope
- Auto-fixing or rewriting tests (D2).
- Progress-tracking JSON worklist (D2 rejected for now).
