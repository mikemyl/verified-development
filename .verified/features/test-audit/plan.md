# Implementation Plan: Test Audit

## Context

Retroactive, advisory command to triage an existing test corpus against the repo taxonomy. Three sub-systems, all serving "audit existing tests" (see `spec.md`):
1. **Taxonomy schema extension** — optional per-type fields: `match-paths`, `match-markers` (deterministic classification) and `good-example`, `bad-example`, `anti-patterns` (craft rubric). Additive, non-breaking; the forward gate ignores them.
2. **Deterministic corpus lib** (`hooks/lib/test-corpus.js`, Node, no deps; mirrors the sibling libs) — discover test functions in a path (Go first, by text/regex + brace-balance), classify each against the taxonomy's match-signals, compute a mechanical smell rank, emit `test-corpus/v1` JSON + summary + derived `<scope>`. Model-free, unit-tested.
3. **The `/test-audit` command** (`skills/test-audit/SKILL.md`) — require a repo taxonomy (else refuse → `/map`), run the corpus lib, LLM deep-dive the worst top-N via `test-design-reviewer` against each test's type rubric (generic craft rules from `tdd-go` + per-type exemplars/anti-patterns), write a ranked report to `.verified/audits/<scope>-tests.md`. Read-only, advisory.
Plus: generic craft rules single-sourced in `tdd-go`; `/map` populates the new taxonomy fields.

This plan dogfoods the v1.7.0 gate: tasks carry `(test:)`/`(scenario:)` trailers resolved against the plugin's own taxonomy at `.verified/codebase/TESTING.md` (`lib-unit` default, `prompt-anchor` exception, `none` sign-off). The corpus lib parses Go test source as TEXT (no Go toolchain) — tested with source-string fixtures. Runner: `node tests/run.cjs`; lint: `node scripts/lint-descriptions.cjs`.

## Tasks

### Phase 1: Taxonomy schema extension (optional fields)
- [x] T001 [P] Add example optional signals to the seed: per seed type add `- **match-paths:**` (glob), `- **match-markers:**` (comma list), `- **good-example:**`, `- **bad-example:**`, `- **anti-patterns:**` (comma list). Keep all OPTIONAL; existing required fields + Mermaid intact. (test: lib-unit) (scenario: AS-009, AS-016) (files: `hooks/lib/test-types-seed.md`)
- [x] T002 Write test: `taxonomy.js` parses the five new optional fields — arrays for `match-paths`/`match-markers`/`anti-patterns`, scalars for `good-example`/`bad-example`; a type omitting them stays valid (EC-004); existing required-field + `has_diagram` behavior unchanged; the updated seed parses to its four types with the new fields. INCLUDE an AS-011 assertion: `resolve` output for a type that omits all new fields is identical to the pre-extension shape (forward gate unaffected). (test: lib-unit) (scenario: AS-009, AS-016, AS-011) (files: `tests/taxonomy.test.cjs`) (depends on T001)
- [x] T003 Implement the parser extension in `taxonomy.js`: a declared `ARRAY_FIELDS` constant (`match-paths`, `match-markers`, `anti-patterns`) → comma-split trimmed arrays; `good-example`/`bad-example` → strings; all optional (absent → `[]`/`null`); NOT added to `REQUIRED_FIELDS` (forward gate unaffected, FR-011). (test: lib-unit) (scenario: AS-009, AS-016, AS-011) (files: `hooks/lib/taxonomy.js`) (depends on T002)

### Phase 2: Deterministic corpus classifier + ranker
- [x] T004 Write test: discovery + body extraction for `test-corpus.js`. Find Go `func TestXxx(t *testing.T)` (name, file, start line, body span via brace-balance) across a dir or single file; non-test files ignored; no tests → empty (EC-002, EC-008); unsupported-language files listed not fatal (EC-006). HARD fixtures that stress brace-balance: a test body with `{`/`}` inside a string literal, a `t.Run(...)` nested func literal, and a block comment containing braces — body span must be correct for all three. (test: lib-unit) (scenario: AS-013) (files: `tests/test-corpus.test.cjs`) (depends on T003)
- [x] T005 Write test: classification for `test-corpus.js`. A test matching a type's `match-paths` glob AND containing a `match-markers` token in its body → that type, sanctioned (AS-003); no match → `unclassified` (AS-004); markers matched only within the test body, not whole-file (EC-007); multi-type match resolved deterministically (most-specific path / most markers) with ambiguity flagged (EC-003, FR-015); a type lacking match-signals can't claim tests (EC-004). (test: lib-unit) (scenario: AS-003, AS-004) (files: `tests/test-corpus.test.cjs`) (depends on T004)
- [x] T006 Write test: ranking + summary + schema for `test-corpus.js`. Smell from classification (unclassified worst), assertion dispersion (raw `require.`/`assert.` count), length, weak match; ordered worst-first (AS-014); summary stats (counts by type, share sanctioned, coverage — AS-008); `<scope>` derived from path (`internal/analytics`→`analytics`, FR-006); output declares `schema: "test-corpus/v1"` with stable top-level keys; identical input → identical output (FR-014). (test: lib-unit) (scenario: AS-008, AS-014) (files: `tests/test-corpus.test.cjs`) (depends on T005)
- [x] T007 Implement discovery in `hooks/lib/test-corpus.js`: Go test-func discovery (regex) + brace-balance body span that ignores braces inside string/rune literals and comments; emit raw test list; module header + CLI shim style mirroring `waves.js`. (test: lib-unit) (scenario: AS-013) (files: `hooks/lib/test-corpus.js`) (depends on T004)
- [x] T008 Implement classification + ranking + summary + scope + CLI + schema in `hooks/lib/test-corpus.js`: a tiny portable `*`/`**` glob matcher (deterministic, Node-version-independent — see D-c), classification against `taxonomy.resolve`, smell ranking, summary, scope derivation; emit `test-corpus/v1` `{schema, scope, tests:[{name,file,line,type,sanctioned,smell,signals,ambiguous}], summary, unsupported_files}` with a `SCHEMA` constant + JSDoc typedef; CLI `test-corpus.js scan <path> --testing <TESTING.md|->`; model-free. (test: lib-unit) (scenario: AS-003, AS-004, AS-008, AS-014) (files: `hooks/lib/test-corpus.js`) (depends on T007, T006)

### Phase 3: Wiring — anchors first
- [x] T009 [P] Write anchor + drift tests in `tests/test-audit.test.cjs`: (a) `tdd-go` names all six craft rules and they are single-sourced — a drift guard asserts the audit skill and `/map` REFERENCE `tdd-go`, not restate the rule list (AS-018, SC-008); (b) `skills/test-audit/SKILL.md` requires a repo `## Test Types` (refuse → `/map`, no report), invokes `test-corpus.js`, deep-dives the top-N worst via `test-design-reviewer` against the type rubric, writes a ranked `.verified/audits/<scope>-tests.md` with summary + un-reviewed count, is READ-ONLY (asserts the skill performs no write/edit on audited files and states advisory-only), and cites craft patterns in verdicts (AS-001, AS-002, AS-005, AS-006, AS-007, AS-012, AS-015, EC-005, EC-009, EC-010); (c) `skills/map/SKILL.md` populates the five new taxonomy fields (AS-010, AS-017). (test: prompt-anchor) (scenario: AS-001, AS-002, AS-005, AS-006, AS-007, AS-010, AS-012, AS-015, AS-017, AS-018) (files: `tests/test-audit.test.cjs`)
- [x] T010 Add the actor-BDD craft-rules section to `tdd-go` (single source): the six named rules (fixtures-at-top; immutable fixture chaining; `Sends`/`Receives`-only assertions; sequences for setup; captured/supplementary data for SUT ids; single-behavior), each one line with the anti-pattern it prevents. (test: prompt-anchor) (scenario: AS-018) (files: `skills/tdd-go/SKILL.md`) (depends on T009)
- [x] T011 Implement `skills/test-audit/SKILL.md` (`/test-audit <path>`, description ≤100 chars): precondition check for `.verified/codebase/TESTING.md` `## Test Types` (refuse + point to `/map`, no report — FR-002/SC-003); run `node ${CLAUDE_PLUGIN_ROOT}/hooks/lib/test-corpus.js scan <path> --testing …`; select top-N worst (N configurable, default stated); spawn `test-design-reviewer` in sweep mode over those tests, judging each against its type's rubric (generic rules referenced from `tdd-go` + the type's `good-example`/`bad-example`/`anti-patterns`) and returning one Farley + craft verdict + recommendation per test (single Farley source — see D-e); aggregate into `.verified/audits/<scope>-tests.md` ranked worst-first with summary stats and the count not deep-reviewed; never modify files; advisory only; note stale exemplar refs (EC-010) and fall back to generic rules when a type has no exemplars (EC-009). (test: prompt-anchor) (scenario: AS-001, AS-002, AS-005, AS-006, AS-007, AS-012, AS-015) (files: `skills/test-audit/SKILL.md`) (depends on T009, T008, T010)
- [x] T012 Update `skills/map/SKILL.md`: when writing `## Test Types`, also populate `match-paths`/`match-markers` (from repo layout + DSL primitives) and `good-example` (a representative real test) + `anti-patterns` per type; REFERENCE the `tdd-go` craft rules rather than restating them. (test: prompt-anchor) (scenario: AS-010, AS-017) (files: `skills/map/SKILL.md`) (depends on T009, T003, T010)

### Phase 4: Docs + release
- [x] T013 Document the command: add a `/test-audit` row to the README Commands table + one-line mention; extend `docs/test-taxonomy.md` with the match-signals + craft fields and an "Auditing an existing corpus" section; add a `### Test audit (v1.8.0+)` section to `CLAUDE.md` including the `.verified/audits/<scope>-tests.md` output path. (test: none) (files: `README.md`, `docs/test-taxonomy.md`, `CLAUDE.md`) (depends on T011, T012)
- [x] T014 Bump version in both manifests (infra — required by plugin versioning convention). (test: none) (files: `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`) (depends on T010, T011, T012, T013)

## Task Legend
- `(test: <type>)` / `(scenario: AS-xxx)` = the v1.7.0 gate trailers, resolved against `.verified/codebase/TESTING.md`. `none`-tier tasks (T013, T014) carry no scenario and require sign-off (recorded in `test-signoffs.json`).
- `(files: a, b)` = file surface (wave-engine collision input). `(depends on TXXX)` = ordering. `[P]` = human hint; `hooks/lib/waves.js` is authoritative.

## Waves

Computed by `hooks/lib/waves.js` (exit 0, no collisions). Gate-clean (`test-gate.js` exit 0 with T013/T014 signed off).

| Wave | Tasks |
|------|-------|
| 1 | T001, T009 |
| 2 | T002, T010 |
| 3 | T003 |
| 4 | T004, T012 |
| 5 | T005, T007 |
| 6 | T006 |
| 7 | T008 |
| 8 | T011 |
| 9 | T013 |
| 10 | T014 |

## Verification
- `node tests/run.cjs` (all green, incl. unchanged forward-gate suite — SC-005) and `node scripts/lint-descriptions.cjs` (test-audit description ≤100 chars).
- `node hooks/lib/waves.js compute` on this plan (exit 0, no collisions).
- `node hooks/lib/test-gate.js check` on this plan (dogfood — must pass with T013/T014 signed off).
- Run `/review`.

## Decisions
- **D-a** Corpus analysis is a deterministic lib (`test-corpus.js`); the LLM deep-dive lives in the skill. Mirrors the gate split (deterministic parse/policy, judgment in the agent). Candidate ADR.
- **D-b** New taxonomy fields are OPTIONAL and excluded from `REQUIRED_FIELDS` — forward gate untouched (inline rationale; not an ADR).
- **D-c** Custom tiny glob matcher rather than `path.matchesGlob()` — portability across the unknown Node version in a user's Claude Code runtime (the stdlib API is recent/experimental). Inline rationale.
- **D-d** Generic craft rules single-sourced in `tdd-go` (drift-guarded, mirrors the Farley-rubric discipline). Inline rationale.
- **D-e** Deep-dive uses `test-design-reviewer` alone (single Farley + craft source). `test-review` is diff-scoped and would double-compute Farley; excluded from the sweep. Candidate ADR.
- **D-f** Go test source parsed as TEXT (regex + brace-balance), no Go toolchain. Known fragility budget: braces in string/rune literals and comments — explicitly covered by T004 fixtures; unsupported files fall back to not-audited. Candidate ADR.
