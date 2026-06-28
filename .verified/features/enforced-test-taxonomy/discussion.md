# Discussion: enforced-test-taxonomy

Audit trail of the spec-time stress test. Records options considered and rejected, not only the chosen direction.

## Problem framing

Agentic TDD via this plugin produced low-quality tests in keros-platform: function-shaped names (`TestBackfillCommissionCorrections_AppendsCorrectedVersionWhenCommissionChanged`), 100-line bodies, scattered assertions, no clear actor/boundary, DSL pattern erosion (`SendsAndWaits` reinvented instead of `EventuallyReceives`). Coverage went up; readability and "read-the-test-as-a-user" collapsed.

Diagnosed root causes (the prose guidance was already correct, so the defect is structural):
1. **Task→test granularity** — plan tasks are function-shaped, executor writes one test per task, so tests inherit function granularity. This is the primary defect.
2. **Coverage-as-target** — `tdd-go` mandates "every error return needs a test"; mutation-aware planning manufactures tests to close gaps. Contradicts "don't test for coverage's sake."
3. **DSL undiscoverability** — repo's test DSL surface isn't mapped, so the agent reinvents primitives and falls back to raw assertions.

## Decisions

### D1 — Taxonomy source: per-repo, plugin ships a seed
- **Chosen:** Plugin ships a default taxonomy (acceptance @public-boundary, dao, unit @near-code, none). Each repo owns its real list in `.verified/codebase/TESTING.md` (`## Test Types`), populated/edited during `/map` or `/init`. Plugin reads it; never hardcodes repo-specific types.
- **Rejected — plugin-owned fixed set:** can't express repo-specific types (keros `handler`, `mapping`) without a plugin change.
- **Rejected — per-repo, no seed:** a repo with no taxonomy has no enforcement; gate inert until authored. The seed guarantees a baseline so the gate is never inert.

### D2 — Gate severity
- **BLOCK** — behavioral task with missing or unknown (not-in-taxonomy) test type.
- **BLOCK** — task declaring `(test: unit)` or `(test: none)` without explicit user sign-off recorded at plan time.
- **BLOCK** — task with `(test: acceptance)` (or any behavioral type) naming no spec scenario it serves. Refactor/wiring tasks use `(test: none)` and are exempt.
- **WARN only** — existing-test quality (test-review / Farley) for already-written tests that don't match a sanctioned type or have scattered assertions. Matches existing non-blocking Farley wiring.

### D3 — Readability stays WARN-only
- **Chosen:** quality is non-blocking. The structural gate (boundary + traceability + fewer manufactured tests) removes most rot; Farley/test-review surface the rest for human judgment.
- **Rejected — canonical-pattern BLOCK:** a mechanical "acceptance test bypasses DSL" block is objective but needs per-type mandatory-pattern declarations and a bypass-detecting parser; deferred, not foreclosed.
- **Rejected — Farley-threshold BLOCK:** reverses the v1.6.0 non-blocking decision; heuristic scores risk false stops and rubric gaming.
- **Acknowledged limit:** a correctly-annotated, traced acceptance task can still be implemented as an ugly blob. This feature fixes placement + traceability + manufactured-test volume, NOT internal readability. Readability remains a WARN signal for the human.

### D4 — Visualize each test harness (added during approach selection)
- **Requirement:** every entry in `## Test Types` carries a diagram of its harness — system-under-test, actors (Sends/Receives), boundary, stubbed externals — alongside the prose (boundary, pattern, location, when-to-use, default/exception).
- **Chosen format — Mermaid.** Plain text: diffable, agent-authorable, regenerable by `/map`, renders inline in GitHub/VS Code/JetBrains/Obsidian where `.verified/codebase/*.md` is read. The actor DSL maps to a flowchart: `Client --Sends--> [boundary] --> SUT --> stubbed externals --Receives--> Client`.
- **Rejected — Excalidraw:** `.excalidraw` JSON blobs an agent can't meaningfully lay out; not inline-renderable in markdown; drifts from prose.
- **Rejected — HTML:** doesn't render in markdown viewers; separate heavy artifact.

## Open / deferred
- Canonical-pattern enforcement (DSL bypass detection) — possible future feature.
- Whether the `(test:)` / `(scenario:)` grammar extends the existing deterministic plan engine or a sibling — implementation detail for /plan, out of spec scope.
