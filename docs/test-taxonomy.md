# Test taxonomy

Agentic TDD raises coverage numbers while collapsing test readability: function-shaped tests, scattered assertions, no declared boundary. The enforced test taxonomy makes the *test boundary* and *scenario traceability* machine-checked properties of plan tasks. A deterministic script, not an LLM, makes the block decision.

## Task-grammar trailers

Two trailers extend the task grammar ([docs/planning.md](planning.md)):

```
T004 [P] Add booking handler (files: handler.go, handler_test.go) (depends on T001) (test: acceptance) (scenario: AS-003)
T007 Refactor fee calculator (files: fee.go) (test: none)
```

- `(test: <type>)` — the task's sanctioned test type. Must be a type in the active taxonomy.
- `(scenario: <id>)` — comma- or space-separated acceptance-scenario ids this task serves (e.g. `AS-003, AS-007`). Behavioral tasks must carry at least one.

Both are parsed by `hooks/lib/waves.js` (`test_type`/`scenarios` on the task object) and consumed exclusively by `hooks/lib/test-gate.js`. The wave math ignores them.

## Test types

The four seed types:

| Type | Boundary | Pattern | When to use |
|------|----------|---------|-------------|
| `acceptance` | public/API | actor-based Sends/Receives DSL | Default for any task adding user-observable behavior. Drive the system through its public boundary as an external actor. |
| `dao` | database | real DB fixture | When behavior cannot be observed through the public boundary and needs a real datastore (query shape, migrations, persistence). Prefer acceptance where possible. |
| `unit` | near the code | standard test | Reserved for genuinely complex pure logic (algorithms, value objects, parsers). Requires per-task sign-off. |
| `none` | — | — | Tasks that change structure without adding behavior (refactor, rename, move). Sign-off required. |

Each type ships a Mermaid harness diagram in `hooks/lib/test-types-seed.md` showing the boundary shape.

### Taxonomy resolution

The **seed** (`hooks/lib/test-types-seed.md`) is the fallback. A repo's real taxonomy lives in `.verified/codebase/TESTING.md` under a `## Test Types` section and is seeded or refreshed by `/map` and `/init`.

When a repo defines a `## Test Types` section, that list is **authoritative** — it fully replaces the seed (not merged). Seed-only types (`dao`, etc.) are absent unless re-declared. The consequence: a repo that defines any taxonomy loses `acceptance` unless it includes it.

## Tiers

| Tier | Types (seed) | Friction |
|------|-------------|---------|
| `default` | `acceptance` | None — the expected path |
| `exception` | `dao` | Sanctioned; no per-task sign-off needed, but prefer `acceptance` where possible |
| `sign-off` | `unit`, `none` | Blocked until the user explicitly approves; approvals persist in `.verified/features/<feature>/test-signoffs.json` across sessions and `/implement` re-runs |

## The gate

`hooks/lib/test-gate.js` emits a `test-gate/v1` contract: severity-coded `findings`, a per-task `summary`, and a `blocked` boolean.

### Finding codes

| Code | Severity | Scope | Meaning |
|------|----------|-------|---------|
| `TAXONOMY_DEFECT` | error | spec-level | A required taxonomy field (`boundary`, `pattern`, `location`, `tier`, `when-to-use`, `primitives`) is missing on a type |
| `DIAGRAM_MISSING` | warning | spec-level | A taxonomy type has prose but no Mermaid harness diagram |
| `MIGRATION_NEEDED` | error | spec-level | Plan has no `(test:…)` or `(scenario:…)` annotations — migrate it to the grammar |
| `MISSING_TEST_TYPE` | error | task | Task declares no `(test: …)` trailer |
| `UNKNOWN_TEST_TYPE` | error | task | `(test: …)` value is not in the active taxonomy |
| `SIGNOFF_REQUIRED` | error | task | Task uses a sign-off-tier type without an approved entry in `test-signoffs.json` |
| `UNTRACEABLE_TASK` | error | task | Behavioral task (non-`none` boundary) references no scenario |
| `DANGLING_SCENARIO` | error | task | Task references a scenario id absent from the spec |
| `UNSERVED_SCENARIO` | error | spec-level | A spec scenario is served by no task |

### Exit codes

| Code | Meaning |
|------|---------|
| `0` | Ok — no errors |
| `1` | Usage or read error |
| `2` | Blocked — one or more error findings |
| `3` | Malformed taxonomy — `TAXONOMY_DEFECT` present (takes precedence over exit 2) |

The gate is deterministic: no LLM is involved in the block decision. See [ADR 0001](./../.verified/decisions/0001-test-taxonomy-design.md) and `CLAUDE.md § Enforced test taxonomy`.

## How /plan and /implement use it

**`/plan` (step 8a-bis)** runs the gate after the wave engine:

1. If `TAXONOMY_DEFECT` or `MIGRATION_NEEDED` — refuses to present the plan.
2. Renders a `## Test Boundaries` table (one row per task: id, test type, scenarios).
3. Surfaces `SIGNOFF_REQUIRED` tasks to the user; prompts for approval; writes approvals to `test-signoffs.json`; re-runs the gate with `--approved`.
4. Warnings (`DIAGRAM_MISSING`) are non-blocking — shown but do not block plan approval.

**`/implement`** re-runs the gate before dispatching each wave. If the plan pre-dates the grammar (`MIGRATION_NEEDED`), `/implement` surfaces this and requests migration before proceeding.

## Coverage

Coverage is a consequence of the taxonomy (each behavioral task ships a test), not an independent per-error-path target. A mismatch between the declared type and what the test actually tests is `WARN`-only — surfaced by the `test-review` / `test-design-reviewer` agents during `/review`, never blocking.

## Scenario-id pattern

The default pattern matches `AS-001`, `AS001`, `S-001`, `S001` forms. It intentionally excludes requirement (`FR-`), edge-case (`EC-`), and success-criterion (`SC-`) ids, so those do not generate spurious `UNSERVED_SCENARIO` findings.

Override for repos using other conventions via `workflows.scenario_id_pattern` in `.verified/config.json` (a string passed to `new RegExp(..., 'g')`).

## Residual risk (EC-007)

An agent can label a behavioral task `(test: none)` to bypass traceability. This is mitigated — not eliminated — by `none` being sign-off tier (requires explicit human approval) plus the human-visible `## Test Boundaries` summary in `/plan` output. Fully preventing it is out of scope.

## CLI

```bash
node hooks/lib/test-gate.js check path/to/plan.md \
  --spec path/to/spec.md \
  [--testing path/to/TESTING.md|-] \
  [--approved T003,T007] \
  [--scenario-pattern "AS-\d+"]
```

Outputs `test-gate/v1` JSON to stdout. Exit codes as above.

## Optional fields: match-signals & craft rubric

Beyond the required fields, each `## Test Types` entry may declare optional fields. They are non-breaking — the forward gate ignores them; only `/test-audit` consumes them.

| Field | Shape | Used for |
|-------|-------|----------|
| `match-paths` | comma-list of globs (`*` within a segment, `**` across) | classify an existing test by its file path |
| `match-markers` | comma-list of identifier tokens | classify by tokens found in the test body |
| `good-example` | one reference | a representative well-formed test of this type |
| `bad-example` | one reference | a representative anti-pattern test |
| `anti-patterns` | comma-list | the smells `/test-audit` flags for this type |

`/map` populates these from the repo. The generic actor-BDD craft rules (fixtures-at-top, immutable fixture chaining, `Sends`/`Receives`-only assertions, sequences, captured data, single-behavior) are language-neutral — they live once in the `testing` skill and are referenced — not restated — here, by the audit, by `tdd-go`, and by the TS testing skills.

## Auditing an existing corpus (`/test-audit`)

The forward gate blocks new under-tested plan tasks; `/test-audit <path>` is its retroactive, advisory counterpart — it triages tests that already exist.

```
/test-audit internal/analytics
```

1. **Requires a repo taxonomy** (`.verified/codebase/TESTING.md` `## Test Types`). With none, it refuses and points you to `/map` — the generic seed can't recognize a repo's own types.
2. **Deterministic pass** (`hooks/lib/test-corpus.js`, `test-corpus/v1`) discovers every test, classifies it via `match-paths` + `match-markers`, and ranks the corpus worst-first by a mechanical smell (unclassified, scattered assertions, length, weak match).
3. **Deep-dive** sends the worst top-N to `test-design-reviewer`, judged against the type's rubric (the `testing` skill's craft rules + the type's exemplars/anti-patterns) → a Farley score, which patterns hold/violate, and a recommendation per test.
4. **Report** at `.verified/audits/<scope>-tests.md` — ranked worst-first, with summary stats and the count not deep-reviewed (no silent truncation).

Read-only and advisory: it never modifies a test and never blocks a gate.

### Language adapters

Test discovery and assertion-counting are per-language; the classify/rank/report core is language-agnostic. Adapters are drop-in files under `hooks/lib/lang/` — each exports `{ id, extensions, testFileGlobs, discover, countAssertions }` and is auto-loaded by extension, so adding a language is a new file, not a core change.

| Adapter | Recognizes | Body extraction |
|---------|-----------|-----------------|
| `go` | `func TestXxx(t *testing.T)` | brace-balance (shared `cfamily`) |
| `typescript` | `it()`/`test()` (incl. `.only`/`.skip`), `.ts/.tsx/.js/.jsx` | brace-balance |
| `python` | `def test_*`, methods in `class Test*` | indentation scanner |
| `java` | `@Test`-annotated methods | brace-balance |

A test file in a language with no adapter is listed under `unsupported_files` (never silently dropped); if a scope contains *only* unsupported languages, the report carries an explicit note.

```bash
node hooks/lib/test-corpus.js scan <path> --testing .verified/codebase/TESTING.md
```
