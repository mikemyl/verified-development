# Implementation Plan: Enforced Test Taxonomy

## Context

Make the test boundary a first-class, enforced property of every plan task, traced to the acceptance scenario it serves, drawn from a per-repo test taxonomy (seed-backed, authoritative-when-present) that is documented and visualized with Mermaid harness diagrams. See `spec.md`.

Architecture (follows the plugin's one-lib-per-concern precedent — `handoff.js`, `state.js`, `waves.js`):
- **`hooks/lib/test-types-seed.md`** — shipped seed taxonomy in exact `## Test Types` format, with Mermaid diagrams. Single source of truth: parsed by `taxonomy.js` as the fallback AND copied/adapted into a repo by `/map` and `/init`.
- **`hooks/lib/waves.js`** (extend) — parse two new task trailers `(test: <type>)` and `(scenario: <id...>)` into each task object; publish the task-object shape as a documented JSDoc typedef so `test-gate.js` consumes a named contract, not a black-box call. Wave math untouched.
- **`hooks/lib/taxonomy.js`** (new) — parse a `## Test Types` section into a taxonomy map; resolve repo-taxonomy-else-seed (authoritative, not merged).
- **`hooks/lib/test-gate.js`** (new) — the deterministic policy. Consumes the documented task-object shape + resolved taxonomy + spec scenario ids + approved sign-off ids; emits `test-gate/v1` with severity-coded findings and exit codes (0 ok · 1 usage · 2 blocked · 3 malformed taxonomy).

Cross-cutting decisions:
- **Scenario id pattern is configurable** (`config.json` `workflows.scenario_id_pattern`), default tolerant — matches `AS-001`, `S001`, `SC-01`, `FR-001`-style ids. Default chosen so existing specs work unmodified; documented as a contract.
- **Sign-off approvals persist** in `.verified/features/<feature>/test-signoffs.json` (machine-readable). `/plan` reads it, passes `--approved` to the gate, writes new approvals there. `concerns.md` stays critic-output only.
- **FR-015 (named canonical primitives) is prose-enforced**, not gate-checked — the seed and `/map` name primitives per type; the gate does not validate them. Stated explicitly so no future reader assumes a mechanical check.

Scenario id convention in this spec: `AS-001`..`AS-014`.

## Tasks

### Phase 1: Seed taxonomy + resolver
- [x] T001 [P] Create the shipped seed taxonomy markdown: `## Test Types` with one entry per seed type — `acceptance` (tier `default`, boundary `public/API`, pattern Sends/Receives DSL, names canonical harness primitives per FR-015), `dao` (tier `exception`), `unit` (tier `sign-off`), `none` (tier `sign-off`, refactor). Each entry: boundary, required pattern, location, tier, when-to-use, named primitives, and a Mermaid `flowchart` harness diagram (actor → boundary → SUT → stubbed externals → actor). (files: `hooks/lib/test-types-seed.md`) — covers AS-009, AS-011, AS-014, FR-015
- [x] T002 [P] Write test for `taxonomy.js`. FIRST assertion: the shipped seed file parses to exactly four types with all required fields and `has_diagram:true` for each (validates the seed before any parser logic). Then: resolves repo taxonomy when present/non-empty; falls back to seed when section absent or empty (EC-002); repo list is authoritative — a seed-only type is absent when the repo defines its own list (AS-010); missing required field (boundary/pattern) reported as a taxonomy defect (EC-003); prose-without-diagram sets `has_diagram:false` without erroring (EC-004). (files: `tests/taxonomy.test.cjs`) (depends on T001)
- [x] T003 Implement `taxonomy.js`: `parseTaxonomy(md)`, `loadSeed()` (reads `test-types-seed.md`), `resolve({repoDoc})` → `{types, source:"repo"|"seed", defects:[]}`. CLI `taxonomy.js resolve <testing.md|->`. (files: `hooks/lib/taxonomy.js`) (depends on T002) — covers AS-009, AS-010, EC-002, EC-003, EC-004

### Phase 2: Task grammar extension (parse only)
- [x] T004 [P] Write test: `waves.js` `parsePlan` captures `(test: acceptance)` → `task.test_type` and `(scenario: AS-001, AS-002)` → `task.scenarios` (array); absent trailers → `test_type:null`, `scenarios:[]`; new clauses stripped from `task.title`; existing files/deps parsing and wave math unchanged (regression). (files: `tests/waves.test.cjs`) — covers FR-001, FR-002
- [x] T005 Implement grammar extension in `waves.js`: add `TEST_RE`/`SCENARIO_RE`, capture `test_type`+`scenarios` in `parsePlan`, strip in `stripClauses`; add a JSDoc `@typedef Task` documenting the task-object shape as the shared contract for `test-gate.js`. Do not alter the wave/collision algorithm. (files: `hooks/lib/waves.js`) (depends on T004) — covers FR-001, FR-002

### Phase 3: Deterministic gate
- [x] T006 Write test for `test-gate.js` BLOCKING cases → `test-gate/v1`, exit 2: missing test type on a behavioral task (AS-001); unknown type not in taxonomy, naming task+type (AS-002); `sign-off`-tier type with no approved id (AS-003); behavioral task (type ≠ `none`) with no scenario ref (AS-004); `none` task exempt from scenario ref but requires sign-off (AS-005); dangling scenario ref absent from spec (AS-007, EC-001, EC-008); spec scenario served by no task (AS-008). (files: `tests/test-gate.test.cjs`) (depends on T003, T005)
- [x] T007 Write test for `test-gate.js` PASSING + edge + propagation: valid annotated plan → exit 0 with per-task `summary` (AS-006); many-to-many task/scenario allowed (EC-005); taxonomy `defects` propagate as findings/exit 3 (EC-003); prose-without-diagram propagates as a `severity:warning`, never a block (EC-004); configurable scenario-id pattern accepts non-`AS-` ids (e.g. `S001`); zero-annotation plan returns an explicit migration finding, not a crash (EC-006). (files: `tests/test-gate.test.cjs`) (depends on T006)
- [x] T008 Implement `test-gate.js`: consume the documented `waves` task-object shape, resolved taxonomy (`taxonomy.resolve`), spec scenario ids (configurable pattern, default tolerant), and `--approved T0..` set; emit `test-gate/v1` `{findings:[{code,severity,task,detail}], summary:[{task,test_type,scenarios}], blocked}`. CLI `test-gate.js check <plan.md> --spec <spec.md> --testing <testing.md|-> [--approved ids]`; exit 0/1/2/3. (files: `hooks/lib/test-gate.js`) (depends on T007) — covers AS-001..AS-008, EC-001, EC-003, EC-004, EC-005, EC-006, EC-008, FR-016

### Phase 4: Wiring — anchors first
- [x] T009 [P] Write gate-wiring prompt-anchor tests: `/plan` invokes `test-gate.js` after wave compute, refuses to present on `blocked`, renders a `## Test Boundaries` per-task summary, prompts for sign-off on `sign-off`-tier tasks and persists approvals to `test-signoffs.json`; `/implement` re-runs `test-gate.js` and gates each wave on `blocked`. (files: `tests/test-taxonomy.test.cjs`) — covers FR-006, FR-013, FR-016
- [x] T010 [P] Write doc-framing prompt-anchor tests: `/map` and `/init` reference `test-types-seed.md` and write a `## Test Types` section with Mermaid; `tdd-go`/`testing` contain the coverage-as-consequence framing and no per-error-path mandate; `test-review`/`test-design-reviewer` state taxonomy/quality findings are WARN-only. (files: `tests/test-taxonomy-docs.test.cjs`) — covers FR-012, FR-014
- [x] T011 Wire `/plan`: after step 8a (waves) add step 8a-bis — read `test-signoffs.json`, run `test-gate.js check --approved <ids>`, refuse to present on `blocked` (exit 2) like the existing collision gate, render the gate `summary` into a `## Test Boundaries` table, and for each `sign-off`-tier task ask the user; write approvals back to `test-signoffs.json` and re-run before presenting. (files: `skills/plan/SKILL.md`) (depends on T009, T008) — covers AS-003, AS-006, FR-006, FR-013
- [x] T012 Wire `/implement`: alongside the collision gate, read `test-signoffs.json`, re-run `test-gate.js check`, refuse to dispatch while `blocked`; on a pre-grammar plan surface the migration finding rather than failing opaquely. (files: `skills/implement/SKILL.md`) (depends on T009, T008) — covers AS-001, EC-006
- [x] T013 Wire `/map`: when writing `TESTING.md`, emit a `## Test Types` section seeded from `hooks/lib/test-types-seed.md` — content adaptation only, the section structure must stay parse-compatible with `taxonomy.js` — with a Mermaid harness diagram per type and named canonical primitives. (files: `skills/map/SKILL.md`) (depends on T010, T001, T003) — covers AS-011, AS-014
- [x] T014 Wire `/init-project`: scaffold a starter `## Test Types` section into the project's `TESTING.md` from `test-types-seed.md`, structure preserved. (files: `skills/init-project/SKILL.md`) (depends on T010, T001, T003) — covers AS-009, AS-011
- [x] T015 Reframe coverage in `tdd-go` and `testing`: remove the "every error return needs a test" mandate; replace with "error paths are covered by a scenario that provokes them through a sanctioned boundary"; state coverage is a consequence of behavioral tests, not a target met by internal tests. (files: `skills/tdd-go/SKILL.md`, `skills/testing/SKILL.md`) (depends on T010) — covers AS-013, FR-012
- [x] T016 Wire WARN-only quality: `test-review` and `test-design-reviewer` flag a written test that doesn't match a sanctioned type or scatters assertions as a `warning` that never changes PASS/WARN/FAIL gating (consistent with existing Farley non-blocking wiring). (files: `agents/test-review.md`, `skills/test-design-reviewer/SKILL.md`) (depends on T010) — covers AS-012, FR-014

### Phase 5: ADRs + release
- [x] T017 Record the cross-cutting decisions as an ADR: D-b seed dual-role (gate fallback + scaffold template, gate-parseable fields canonical), D-c repo taxonomy authoritative-not-merged (rejected alternative: merge), D-e sign-off persistence in `test-signoffs.json`, D-f configurable scenario-id pattern. (files: `.verified/decisions/0001-test-taxonomy-design.md`) (depends on T003, T008, T011)
- [x] T018 Bump version in both manifests and note the feature (infra — no spec item, required by plugin versioning convention). (files: `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`) (depends on T011, T012, T013, T014, T015, T016, T017)

## Task Legend
- `(files: a, b)` = file surface (wave-engine collision input).
- `(depends on TXXX)` / `(depends on T001-T003)` = ordering.
- `[P]` = human hint; `hooks/lib/waves.js` is authoritative.

## Waves

Computed by `hooks/lib/waves.js` (`plan-waves/v1`, exit 0, no collisions, no undeclared). Each wave runs concurrently.

| Wave | Tasks | Notes |
|------|-------|-------|
| 1 | T001, T004, T009, T010 | seed md · waves-test · 2 anchor-test files — distinct |
| 2 | T002, T005, T015, T016 | taxonomy-test · waves-impl · tdd-go+testing · review-wiring |
| 3 | T003 | taxonomy.js impl |
| 4 | T006, T013, T014 | gate-blocking-test · /map · /init |
| 5 | T007 | gate-passing/edge test |
| 6 | T008 | test-gate.js impl |
| 7 | T011, T012 | /plan · /implement wiring (both consume the gate) |
| 8 | T017 | ADR |
| 9 | T018 | version bump |

## Verification
- `node tests/run.cjs` (all suites green) and `node scripts/lint-descriptions.cjs`.
- Recompute `node hooks/lib/waves.js compute` on this plan (no collisions, exit 0).
- Run `/review` for two-stage code review.

## Decisions
- **D-a** Three libs: parse (`waves.js`) / resolve (`taxonomy.js`) / policy (`test-gate.js`). Shared task-object contract documented as a JSDoc typedef (not a black-box `parsePlan` call). → ADR T017.
- **D-b** Seed is one markdown artifact = gate fallback + scaffold template; gate-parseable fields are canonical. → ADR T017.
- **D-c** Repo taxonomy authoritative (replaces seed), not merged (FR-003, AS-010). → ADR T017.
- **D-d** All blocks are deterministic exit codes from `test-gate.js`; no new LLM critic (FR-016).
- **D-e** Sign-off approvals persist in `test-signoffs.json`; `concerns.md` stays critic-only. → ADR T017.
- **D-f** Scenario-id pattern configurable, default tolerant. → ADR T017.
