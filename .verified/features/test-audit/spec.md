# Feature: Test Audit

## Context

The forward gate shipped in `enforced-test-taxonomy` (v1.7.0) blocks new under-tested plan tasks but does nothing for the large body of already-merged tests that predate the taxonomy. Real repos (keros-platform) carry mapping tests, internal/unit-style tests, and pattern-divergent suites (e.g. mcp_oauth) that are hard to read and hard to reason about as user behavior. There is no systematic way to revisit them.

`test-audit` is the retroactive, advisory counterpart to the gate: point it at an existing test corpus and it triages every test against the repo's test taxonomy, then produces a durable, ranked worklist — worst offenders first — so a large legacy suite can be chipped away over time. Because it audits already-merged code, it is advisory only: it never blocks any gate and never modifies a file.

It is distinct from `/review` (diff-scoped to the active feature) and `/assess` (whole-project standards gap). It is its own verb, scoped to an arbitrary test-corpus path.

To classify legacy tests — which carry no `(test:)` annotation — deterministically, the taxonomy gains optional machine-matchable signals per type (`match-paths`, `match-markers`). A cheap deterministic pass classifies and ranks the whole corpus; an LLM pass deep-reviews only the worst-ranked few. The match-signals are optional and do not affect the forward gate.

Beneficiaries: a developer paying down test debt in an existing codebase, who needs a prioritized, behavior-focused read on which tests to fix first.

## Acceptance Scenarios

### AS-001 — Ranked report for a taxonomy-backed corpus
**Given** a repo whose `.verified/codebase/TESTING.md` has a `## Test Types` section
**And** a target path containing tests
**When** `/test-audit <path>` runs
**Then** a report is written to `.verified/audits/<scope>-tests.md`
**And** it lists the corpus's tests ranked worst-first.

### AS-002 — Refuse without a repo taxonomy
**Given** a repo with no `## Test Types` section in its codebase docs
**When** `/test-audit <path>` runs
**Then** no report is produced
**And** the user is told to run `/map` first to establish the taxonomy
**And** the run does not fall back to the generic seed for classification.

### AS-003 — Deterministic classification of a matching test
**Given** a taxonomy type declaring `match-paths` and `match-markers`
**And** a test whose file path matches the glob and whose body uses the markers
**When** the audit's deterministic pass runs
**Then** the report records that test as the type, marked sanctioned
**And** this classification involves no model call.

### AS-004 — Unclassifiable test is surfaced, not hidden
**Given** a test that matches no taxonomy type's signals
**When** the audit runs
**Then** the report marks it `unclassified`
**And** it is ranked among the worst offenders.

### AS-005 — Deep-dive is limited to the worst-ranked tests
**Given** a ranked corpus larger than the deep-dive limit
**When** the audit runs
**Then** only the top-N worst-ranked tests receive a deep quality review
**And** N is configurable
**And** the report states how many tests were ranked but not deep-reviewed (no silent truncation).

### AS-006 — Each deep-reviewed offender gets a verdict and a recommendation
**Given** a test selected for deep review
**When** the audit reviews it
**Then** the report records a Farley score, a readability/traceability verdict (can a human identify the user-observable behavior it asserts?), and a concrete recommendation (e.g. move to a sanctioned boundary, split scattered assertions).

### AS-007 — Read-only
**Given** any audit run
**When** it completes
**Then** no test file and no source file has been modified.

### AS-008 — Corpus summary
**Given** a completed audit
**When** the report is written
**Then** it includes summary stats: counts by inferred type, the share that is sanctioned, classification coverage, and how many tests were deep-reviewed.

### AS-009 — Taxonomy parses the new match-signals
**Given** a `## Test Types` entry that declares `match-paths` and `match-markers`
**When** the taxonomy is resolved
**Then** those fields are available on the resolved type
**And** a type that omits them is still valid (the fields are optional).

### AS-010 — /map populates match-signals
**Given** `/map` documents a repo's tests
**When** it writes the `## Test Types` section
**Then** each type includes `match-paths` and `match-markers` where they are discoverable from the repo's test layout and patterns.

### AS-011 — Forward gate is unaffected
**Given** a taxonomy whose types declare no match-signals
**When** the forward test-gate runs
**Then** its behavior and verdicts are unchanged from v1.7.0.

### AS-012 — Re-run regenerates
**Given** a prior audit report for a scope
**When** `/test-audit` is run again on that scope
**Then** the report is regenerated to reflect the corpus's current state.

### AS-013 — Empty corpus
**Given** a target path containing no recognizable tests
**When** `/test-audit <path>` runs
**Then** it reports that no tests were found
**And** it does not error.

### AS-014 — Ranking reflects smell
**Given** a clean sanctioned test and a long, scattered-assertion, unclassified test in the same scope
**When** the audit ranks them
**Then** the scattered/unclassified test ranks worse than the clean sanctioned one.

## Requirements

- **FR-001** A command `/test-audit <path-or-module>` audits the tests under an arbitrary path or module (a single file or a directory).
- **FR-002** The audit requires a repo taxonomy (`## Test Types` in `.verified/codebase/TESTING.md`). If absent, it refuses, produces no report, and instructs the user to run `/map`. It does not use the generic seed for classification.
- **FR-003** A deterministic, model-free pass classifies each in-scope test by the taxonomy's `match-paths` (path glob) and `match-markers` (identifier/regex tokens in the test body). A test matching a type's signals is recorded as that type and marked sanctioned.
- **FR-004** The deterministic pass computes a mechanical rank ("smell") for each test from at least: classification outcome (unclassified ranks worst), assertion dispersion, test length, and weakness of the type match. The corpus is ordered worst-first.
- **FR-005** An LLM pass deep-reviews only the top-N worst-ranked tests, where N is configurable with a sensible default. It produces, per reviewed test, a Farley score, a readability/traceability verdict, and a concrete recommendation.
- **FR-006** The audit writes a durable report to `.verified/audits/<scope>-tests.md`, ranked worst-first, with per-test: location, inferred type, sanctioned/unclassified status, the mechanical smell signals, and — for deep-reviewed tests — the Farley score, verdict, and recommendation.
- **FR-007** The report includes corpus summary stats: counts by inferred type, share sanctioned, classification coverage, and number deep-reviewed.
- **FR-008** The audit is read-only: it never modifies test or source files.
- **FR-009** The taxonomy schema gains optional `match-paths` and `match-markers` fields per type. The parser captures them; their absence is valid and leaves the type unaffected for all other uses.
- **FR-010** `/map` populates `match-paths` and `match-markers` for each type it documents, where discoverable from the repo.
- **FR-011** The forward test-gate's behavior is unchanged when match-signals are absent — the new fields are optional and non-breaking.
- **FR-012** Test discovery is language-aware, supporting Go first (e.g. `TestXxx` functions); files in unsupported languages are noted, not fatal.
- **FR-013** The audit is advisory: it never blocks any gate and its result is a report, not a pass/fail verdict.
- **FR-014** The deterministic classifier and ranker are model-free and unit-testable: identical input yields identical output.
- **FR-015** When a test matches more than one type's signals, the classifier resolves the tie deterministically (e.g. most specific path / most markers matched) and the report notes the ambiguity.

## Edge Cases

- **EC-001** No repo taxonomy → refuse, no report, point to `/map` (AS-002).
- **EC-002** Path contains no recognizable tests → graceful "no tests found" (AS-013).
- **EC-003** A test matches multiple types' signals → deterministic tie-break, ambiguity noted (FR-015).
- **EC-004** A taxonomy type declares no match-signals → tests for that type cannot be auto-classified; they fall to `unclassified` and the report notes the type lacks signals.
- **EC-005** Very large corpus (hundreds of tests) → all are ranked; only top-N deep-reviewed; the un-reviewed remainder count is surfaced (no silent truncation).
- **EC-006** Mixed/unsupported test languages in scope → recognized languages audited; others listed as not-audited, no crash.
- **EC-007** A match-marker token appears in a non-test helper or production file → classification is scoped to test files / test functions only, avoiding false positives.
- **EC-008** Scope is a single test file vs a directory → both supported (FR-001).

## Success Criteria

- **SC-001** Every acceptance scenario has a corresponding test.
- **SC-002** All verification gates pass (the project's verify command).
- **SC-003** A run against a repo with no taxonomy never writes a report and always points to `/map`.
- **SC-004** The deterministic classifier+ranker is model-free and produces identical output for identical input (unit-tested).
- **SC-005** The forward test-gate suite passes unchanged after the match-signal schema extension (no regression).
- **SC-006** The report ranks worst-first and never silently drops tests — the count not deep-reviewed is always shown.
- **SC-007** No test or source file is modified by an audit run.
