# Feature: Language-Agnostic Core

## Context

The plugin's durable value is its language-agnostic workflow, principles, and mechanisms — spec-first, ATDD, the deterministic gates, the test taxonomy, the review loop, and `/test-audit`'s pluggable adapters. Bundling language-specific toolchains or test idioms (eslint configs, "use vitest", Maven vs Gradle) is a depreciating asset: tools churn, and the plugin would own keeping them current forever. Claude can infer a repo's test runner and idioms from its existing tests; repo-specific mechanics belong per-repo, in `.verified/codebase/` docs (written by `/map`) or a user's own repo skill.

Most of the plugin is already agnostic in mechanism: `/verify` runs the **repo's own** verify command, and `/test-audit` reads source. The residual privilege lives in `agents/executor.md`, which hardcodes Go/TypeScript detection and points at a non-existent bare `tdd` skill.

This feature removes that residual language privilege, fixes the dangling reference, confirms `/verify` and `/init` are stack-neutral, and documents the "teach your stack per-repo" model. It explicitly does **not** add any per-language skill, config, or stack doc. The existing Go skills (`tdd-go`, `go-verified-development`) are kept as-is so Go users aren't regressed; they simply stop being a privileged branch.

Beneficiaries: developers on any stack (the workflow works without bundled support for their language) and the maintainer (no per-language toolchain debt).

## Acceptance Scenarios

### AS-001 — Executor is language-agnostic
**Given** a target repo in any language
**When** an executor starts under `/implement`
**Then** it loads the neutral `testing` skill
**And** infers the repo's test runner and idioms from the repo's existing tests and `.verified/codebase/` docs (`TESTING.md`, `CONVENTIONS.md`)
**And** does not require the repo to be one of a fixed language list.

### AS-002 — Go is not regressed
**Given** a Go repo (`go.mod`)
**When** an executor starts
**Then** Go-idiomatic TDD guidance (`tdd-go`) is still applied
**And** the existing Go `/verify` path is unchanged.

### AS-003 — No dangling skill reference
**Given** `agents/executor.md`, `skills/react-testing`, and `skills/front-end-testing`
**When** their skill references are resolved
**Then** every referenced skill exists
**And** no reference to a non-existent bare `tdd` skill remains anywhere in the plugin.

### AS-004 — /verify is stack-neutral
**Given** a repo with a verify command (a `config.json` custom command, or a `Justfile`/`Makefile`/`package.json`/build-tool target)
**When** `/verify` runs
**Then** it runs that command regardless of language
**And** it makes no Go-specific assumption
**And** a repo with no verify command gets clear guidance on defining one rather than a failure.

### AS-005 — /init is stack-neutral
**Given** a repo being initialized in any language
**When** `/init` runs
**Then** it scaffolds `.verified/` and captures/prompts for the repo's verify command
**And** it does not generate language-specific linter/test configs or assume a particular stack.

### AS-006 — Docs describe the agnostic model
**Given** the README and `docs/`
**When** a reader looks for language support
**Then** the docs state the plugin is language-agnostic (runs the repo's verify command, infers idioms) and explain that per-repo mechanics live in `.verified/codebase/` or a repo skill
**And** `docs/go-stack.md` is reframed so Go reads as one example, not "the supported stack".

### AS-007 — Teaching a stack per-repo is documented
**Given** a developer on an unsupported-by-bundle language
**When** they consult the docs
**Then** there is explicit guidance for teaching the plugin their stack's mechanics via `.verified/codebase/` docs or a per-repo skill, without expecting bundled toolchains.

### AS-008 — The neutral core is not regressed
**Given** the existing language-neutral core and test suite
**When** this feature lands
**Then** all pre-existing tests still pass and no behavior of the neutral workflow changes except the executor's de-privileging.

## Requirements

- **FR-001** `agents/executor.md` loads the neutral `testing` skill for every repo and determines test runner/idioms by inference from the repo's existing tests and `.verified/codebase/` docs, instead of branching on a fixed `go.mod`/`tsconfig.json` list.
- **FR-002** `tdd-go` remains applied for Go repos (don't regress), but as the one bundled example rather than a privileged hardcoded branch; the executor's logic does not fail or degrade for non-Go/non-TS repos.
- **FR-003** No reference to a non-existent skill remains; `executor.md`, `react-testing`, and `front-end-testing` reference only skills that exist (the bare `tdd` reference is removed/repointed to `testing`).
- **FR-004** `/verify` selects and runs the repo's verify command generically (`config.json` custom command, else `Justfile`/`Makefile`/`package.json`/build-tool target); no language hardcoding; an absent verify command yields guidance, not a crash.
- **FR-005** `/init` is language-neutral: it scaffolds `.verified/` and records the repo's verify command but does not generate per-language configs.
- **FR-006** The README and `docs/` state the agnostic model and where per-repo mechanics live; `docs/go-stack.md` is reframed (Go as an example, not the privileged stack).
- **FR-007** Explicit guidance exists for teaching the plugin a stack per-repo (via `.verified/codebase/` docs or a repo skill).
- **FR-008** This feature adds **no** new per-language skill, config, or stack-doc file (it is a de-coupling, not an expansion).
- **FR-009** The Go stack and the language-neutral core are not regressed (existing tests stay green).

## Edge Cases

- **EC-001** Repo with no verify command → `/verify` explains how to define one; no crash, no Go assumption (FR-004).
- **EC-002** Repo in a language the plugin has no bundled knowledge of (e.g. Rust, Elixir) → the executor still functions via neutral `testing` + inference; no missing-skill error (AS-001, FR-002).
- **EC-003** Go repo → `tdd-go` still applies (AS-002, FR-002).
- **EC-004** Repo with `.verified/codebase/TESTING.md` defining its taxonomy/mechanics → the executor uses it as the idiom source (FR-001).
- **EC-005** Repo with multiple stack manifests → `/verify` uses the `config.json` custom command or asks; it does not silently default to Go.
- **EC-006** Existing references to `tdd-go` (a real skill) are fine and must NOT be removed — only the non-existent bare `tdd` reference is the bug (FR-003).

## Success Criteria

- **SC-001** Every acceptance scenario has a corresponding test (prompt-anchor or unit, per the plugin's test style).
- **SC-002** All verification gates pass (the plugin's own `node tests/run.cjs` + `lint-descriptions`).
- **SC-003** A test asserts there is **no** dangling reference to a non-existent `tdd` skill in `agents/` or `skills/`.
- **SC-004** The change adds **zero** new `*-verified-development`, `tdd-<lang>`, or `docs/<lang>-stack.md` files (verifiable from the diff).
- **SC-005** The Go `/verify` path and all pre-existing tests pass unchanged.
- **SC-006** The README and docs no longer claim a privileged/only-Go stack; they describe the agnostic model and the per-repo extension point.
