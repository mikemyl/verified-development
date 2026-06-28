# Feature: Enforced Test Taxonomy

## Context

Agentic TDD through this plugin raised coverage but collapsed test readability in real use (keros-platform): tests named after functions instead of behaviors, hundred-line bodies, assertions scattered across the file, no discernible actor or boundary, and erosion of the project's test DSL (hand-rolled primitives where a canonical one existed). The prose guidance in the testing skills was already correct, so the defect is structural, not advisory.

Three structural causes: plan tasks are function-shaped, so the one-test-per-task executor inherits function granularity; a coverage-as-target mandate ("every error return needs a test") manufactures tests at whichever boundary is cheapest; and the repo's test-harness surface is undiscoverable, so the agent reinvents it.

This feature makes the **test boundary a first-class, enforced property of every plan task**, traced to the acceptance scenario it serves, drawn from a per-repo taxonomy that is both documented and visualized. The deepest lever is task→scenario traceability: a behavioral task that cannot name the scenario it serves should not have a test of its own.

Beneficiaries: the developer (readable, boundary-clear tests they can reason about) and the implementing agent (an unambiguous, machine-checked contract for what kind of test to write and where).

## Acceptance Scenarios

### AS-001 — Missing test type blocks the plan
**Given** a plan whose task adds observable behavior
**And** that task declares no test type
**When** the plan gate runs
**Then** the plan is not presented to the user
**And** the offending task is named in the failure.

### AS-002 — Unknown test type blocks the plan
**Given** a repo whose taxonomy defines the sanctioned test types
**And** a plan task declaring a test type that is not in that taxonomy
**When** the plan gate runs
**Then** the plan is not presented
**And** the failure names the task and the unrecognized type.

### AS-003 — Sign-off-tier type blocks until the user approves
**Given** a plan task declaring a test type marked `sign-off` in the taxonomy (e.g. `unit`, `none`)
**When** the plan gate runs
**Then** the plan is not presented
**And** the user is asked to explicitly approve that task's test type
**And** on approval the decision is recorded in the plan's audit trail
**And** without approval the task remains blocked.

### AS-004 — Untraceable behavioral task blocks the plan
**Given** a plan task declaring a behavioral test type (any type except `none`)
**And** that task references no acceptance scenario from the spec
**When** the plan gate runs
**Then** the plan is not presented
**And** the failure names the task that lacks a scenario reference.

### AS-005 — Refactor task is exempt from traceability
**Given** a plan task that changes structure without adding behavior, declared `(test: none)`
**And** the user has signed off on the `none` type for that task
**When** the plan gate runs
**Then** the task is not required to reference an acceptance scenario
**And** the plan is presented.

### AS-006 — Valid annotated plan is presented with a test-boundary summary
**Given** a plan in which every behavioral task declares a sanctioned test type and at least one acceptance scenario it serves
**When** the plan gate runs
**Then** the plan is presented
**And** the presentation includes a per-task summary of test type and the scenario(s) it serves.

### AS-007 — Dangling scenario reference blocks the plan
**Given** a plan task referencing an acceptance scenario identifier that does not exist in the spec
**When** the plan gate runs
**Then** the plan is not presented
**And** the failure names the task and the dangling reference.

### AS-008 — Every acceptance scenario is served by a task
**Given** a spec acceptance scenario that no plan task references
**When** the plan gate runs
**Then** the plan is not presented
**And** the failure names the unserved scenario.

### AS-009 — Repo without its own taxonomy still enforces via the seed
**Given** a repo whose context docs contain no `## Test Types` section
**When** the plan gate runs
**Then** the shipped seed taxonomy supplies the sanctioned types
**And** every block above still applies.

### AS-010 — Repo taxonomy is authoritative when present
**Given** a repo that defines its own `## Test Types`
**And** a plan task declaring a type that exists only in the shipped seed and not in the repo's list
**When** the plan gate runs
**Then** the type is treated as unknown
**And** the plan is not presented.

### AS-011 — Taxonomy is documented and visualized
**Given** the codebase-mapping flow runs on a repo
**When** it writes the test-context document
**Then** each test type carries its boundary, pattern, location, tier, and when-to-use guidance
**And** each test type carries a diagram of its harness showing the system under test, the actors that send and receive, the boundary, and any stubbed externals.

### AS-012 — Existing-test quality is a warning, never a block
**Given** a written test that does not match a sanctioned type or scatters its assertions
**When** test quality is reviewed
**Then** the finding is surfaced as a warning
**And** it never blocks the plan, verify, or review gates.

### AS-013 — Error paths are covered through the boundary, not by manufactured tests
**Given** production code with an error branch
**When** the agent plans tests for it
**Then** the branch is covered by an acceptance scenario that provokes it through a sanctioned boundary
**And** no guidance requires a dedicated internal test per error return.

### AS-014 — Harness reuse over reinvention
**Given** a test type whose taxonomy entry names the repo's canonical harness primitives
**When** the agent writes a test of that type
**Then** it uses those primitives rather than hand-rolling equivalents.

## Requirements

- **FR-001** A plan task carries a machine-readable test-type annotation. Tasks that add observable behavior MUST declare one.
- **FR-002** A plan task that serves user-observable behavior MUST reference at least one acceptance scenario identifier from the spec.
- **FR-003** The set of sanctioned test types is read from the repo's taxonomy. When the repo defines none, a shipped seed taxonomy supplies the baseline. When the repo defines its own list, that list is authoritative and the seed is not merged.
- **FR-004** A behavioral task with a missing test type, an unknown test type, or no scenario reference prevents the plan from being presented; the failure names the offending task and the specific cause.
- **FR-005** Each taxonomy entry declares a tier: `default` (no friction), `exception` (sanctioned, used without per-task sign-off), or `sign-off` (blocked until the user approves per use). The seed marks the public-boundary acceptance type `default`, data-access (`dao`) `exception`, and `unit`/`none` `sign-off`.
- **FR-006** A task whose test type is `sign-off` tier prevents the plan from being presented until the user explicitly approves; approval is recorded in the plan's audit trail.
- **FR-007** A `none`-typed task is exempt from the scenario-reference requirement but is `sign-off` tier.
- **FR-008** Every acceptance scenario in the spec MUST be referenced by at least one plan task; an unserved scenario blocks the plan.
- **FR-009** The repo taxonomy lives in a `## Test Types` section of the codebase test-context document. Each entry declares: type name, boundary, required pattern, location, tier, and when-to-use guidance.
- **FR-010** Each taxonomy entry includes a Mermaid diagram of its harness: the system under test, the actors that send and receive, the boundary, and stubbed externals.
- **FR-011** The codebase-mapping and project-initialization flows populate and refresh the repo taxonomy, including the diagrams.
- **FR-012** TDD guidance does not mandate a dedicated test per error return. Error paths are covered by acceptance scenarios that provoke them through a sanctioned boundary. Coverage is framed as a consequence of behavioral tests, not a target met by internal tests.
- **FR-013** A presented plan surfaces a per-task summary of test type and referenced scenario(s) for human review.
- **FR-014** Test-quality findings (a written test not matching a sanctioned type, or with scattered assertions) are warnings only. They never block the plan, verify, or review gates.
- **FR-015** Each taxonomy entry names the repo's canonical harness primitives for its type so the implementing agent reuses them.
- **FR-016** The type and traceability checks are computed by a model-free check that returns explicit severity/exit codes, consistent with the existing deterministic plan engine. Blocks are not LLM judgment calls.

## Edge Cases

- **EC-001** A task references a scenario identifier absent from the spec → blocked, dangling reference named (AS-007).
- **EC-002** A repo `## Test Types` section exists but is empty → fall back to the seed (treated as "no repo taxonomy").
- **EC-003** A taxonomy entry is missing a required field (boundary or pattern) → reported as a taxonomy defect.
- **EC-004** A taxonomy entry has prose but no Mermaid diagram → documentation warning, not a plan block (visualization is doc completeness, not a gate).
- **EC-005** A task references multiple scenarios, or several tasks reference one scenario → both allowed (many-to-many).
- **EC-006** A plan authored before this grammar (no annotations on any task) → reported with an explicit migration message identifying the missing annotations, not a cryptic parser failure.
- **EC-007** An agent labels a genuinely behavioral task `none` to bypass the scenario requirement → mitigated, not eliminated, by the `sign-off` tier on `none` plus the human-visible plan summary. Residual risk; out of scope to fully prevent.
- **EC-008** A scenario identifier is renamed in the spec after tasks were written → the now-dangling references block (EC-001), forcing the plan back into sync.

## Success Criteria

- **SC-001** Every acceptance scenario has a corresponding test.
- **SC-002** All verification gates pass (the project's verify command).
- **SC-003** A plan containing a behavioral task with no test type, an unknown type, or no scenario reference cannot be presented to the user.
- **SC-004** A repo with no taxonomy still enforces every block via the shipped seed.
- **SC-005** In a populated test-context document, every test type renders both prose (boundary, pattern, location, tier, when-to-use) and a Mermaid harness diagram.
- **SC-006** No guidance or code path mandates a dedicated test per error return.
- **SC-007** Test-quality findings are emitted as warnings only; none can block a gate.
- **SC-008** The type/traceability checks are deterministic: the same plan and taxonomy produce the same verdict on every run, with no model involvement in the block decision.
