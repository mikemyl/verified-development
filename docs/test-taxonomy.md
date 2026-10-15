# Test taxonomy

Agentic TDD raises coverage numbers while collapsing test readability: function-shaped tests,
scattered assertions, no declared boundary. The taxonomy makes the *test boundary* a declared,
per-repo property that `test-review` judges against and `/plan` picks scenario types from.

## Test types

The seed (`hooks/lib/test-types-seed.md`) ships five types:

| Type | Boundary | Pattern | When to use |
|------|----------|---------|-------------|
| `acceptance` | public/API | actor-based Sends/Receives DSL | Default for any user-observable behaviour. The system as a whole through its public interfaces: real infrastructure, third parties stubbed. |
| `core` | one component's edges, in process | the same DSL at both edges: a stub actor per collaborator, in-memory transport, controlled clock | Default for one component's exact behaviour: mapping field by field, orderings, timeouts, "sends nothing", error paths real collaborators never produce. One component per test. |
| `dao` | database | real DB fixture | When behaviour cannot be observed through the public boundary and needs a real datastore (query shape, migrations, persistence). Prefer acceptance where possible. |
| `unit` | near the code | standard test | Genuinely complex pure logic (algorithms, value objects, parsers). The plan says why. |
| `none` | — | — | Structure-only changes (refactor, rename, move). The plan says why. |

`acceptance` and `core` are both default tier and share fixtures; the line between them is the
harness, not the verbs. Acceptance tests the deployed system and only what its public interfaces
expose; core tests one component with every collaborator replaced by a stub the test drives and
observes, so it can pin exact messages in both directions, assert that nothing was sent, and move
the clock. On a mature system core is the main body of tests and acceptance the smaller set of
user journeys (the split comes from TransFICC's test-type guidance, where the two are called
acceptance tests and adaptor core tests).

Each type ships a Mermaid harness diagram showing the boundary shape, and the seed encodes the
**boundary doctrine** in `anti-patterns:`: reading state back below the test's own boundary,
seeding below it when the system's API can drive it, post-construction fixture mutation. Those are
the smells that let a test look green while proving nothing.

### Resolution

A repo's real taxonomy lives in `.verified/codebase/TESTING.md` under `## Test Types`, written by
`/map`. When a repo defines that section it is **authoritative** — it fully replaces the seed, not
merged. A repo that defines any taxonomy loses `acceptance` unless it re-declares it.

```bash
node hooks/lib/taxonomy.js resolve .verified/codebase/TESTING.md   # parsed types, source, defects
node hooks/lib/taxonomy.js extract .verified/codebase/TESTING.md   # the section text alone
```

`extract` is what `/review` hands `test-review`: the rubric, not the 80 KB of prose around it.

## Tiers

| Tier | Types (seed) | Meaning |
|------|-------------|---------|
| `default` | `acceptance` | The expected choice |
| `exception` | `dao` | Sanctioned without discussion; prefer `acceptance` where possible |
| `sign-off` | `unit`, `none` | The plan states the reason and the user agrees before building |

## Fields

Required per type: `boundary`, `pattern`, `location`, `tier`, `when-to-use`, `primitives`. A
missing required field is a `defect` the resolver reports.

Optional, populated by `/map` from the repo:

| Field | Shape | Used for |
|-------|-------|----------|
| `match-paths` | comma-list of globs (`*` within a segment, `**` across) | classify a test file by path |
| `match-markers` | comma-list of identifier tokens | classify by tokens in the test body |
| `good-example` | one `path::TestName` | the golden path a reviewer and an author open first |
| `bad-example` | one reference | a representative anti-pattern test |
| `anti-patterns` | comma-list | **a gate**: `test-review` raises a match as a blocking `error` |

Because `anti-patterns:` blocks, `/map` lists only mechanical, no-judgment smells there. Oracle
provenance (snapshots, golden files) is non-blocking by default and becomes blocking only when a
repo adds `circular oracles` to a type's list.

The generic actor-BDD craft rules (fixtures-at-top, immutable fixture chaining, `Sends`/`Receives`
-only assertions, sequences, captured data, single behaviour) live once in the `testing` skill and
are referenced, not restated, by `/map`, `/test-audit`, `tdd-go` and the TS testing skills.

## Coverage

Coverage is a consequence of the taxonomy (each scenario ships a test at its boundary), not a
per-error-path target. A mismatch between a test's declared type and what it actually does is a
non-blocking `warning` from `test-review` — a judgment call, unlike a declared anti-pattern.

## Auditing an existing corpus (`/test-audit`)

`/test-audit <path>` triages tests that already exist, worst-first. Advisory and read-only.

```
/test-audit internal/analytics
```

1. **Requires a repo taxonomy** (`## Test Types` in `TESTING.md`); with none it points at `/map`.
2. **Deterministic pass** (`hooks/lib/test-corpus.js`, `test-corpus/v1`) discovers every test,
   classifies it via `match-paths` + `match-markers`, and ranks by mechanical smell (unclassified,
   scattered assertions, length, weak match).
3. **Deep-dive** sends the worst top-N to `test-design-reviewer`, judged against the type's rubric →
   Farley score, patterns held/violated, a recommendation per test.
4. **Report** at `.verified/audits/<scope>-tests.md`, ranked, with the count not deep-reviewed.

### Language adapters

Discovery and assertion counting are per language; classify/rank/report are not. Adapters are
drop-in files under `hooks/lib/lang/`, each exporting
`{ id, extensions, testFileGlobs, discover, countAssertions }`, auto-loaded by extension.

| Adapter | Recognizes | Body extraction |
|---------|-----------|-----------------|
| `go` | `func TestXxx(t *testing.T)` | brace-balance (shared `cfamily`) |
| `typescript` | `it()`/`test()` (incl. `.only`/`.skip`), `.ts/.tsx/.js/.jsx` | brace-balance |
| `python` | `def test_*`, methods in `class Test*` | indentation scanner |
| `java` | `@Test`-annotated methods | brace-balance |

A test file in a language with no adapter is listed under `unsupported_files`; a scope of only
unsupported languages produces an explicit note. Discovery skips `.git`, `node_modules`, `vendor`
and `dist`, so vendored or built tests never count against coverage. The same adapters' `countAssertions` drive
`hooks/lib/test-weakening.js`, which flags test files that lost assertions in a change.

```bash
node hooks/lib/test-corpus.js scan <path> --testing .verified/codebase/TESTING.md
node hooks/lib/test-weakening.js scan <base-ref>
```
