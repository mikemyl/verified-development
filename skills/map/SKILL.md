---
name: map
description: "Analyze the codebase and produce structured context docs in .verified/codebase/."
version: 0.1.0
---

Analyze the current codebase and produce structured context documents that inform all future development work. These documents are read by `/plan`, `/implement`, `/specify`, and review agents.

## Process

### 1. Check Prerequisites

- Project must exist (has source code)
- `.verified/` directory should exist (run `/init` first if not)
- If `.verified/codebase/` already exists, ask: "Update existing docs or regenerate from scratch?"

### 2. Create Codebase Directory

```bash
mkdir -p .verified/codebase
```

### 3. Analyze and Write Documents

Produce each document by reading the actual codebase. Use parallel agents where possible for speed.

#### ARCHITECTURE.md
Analyze package/module structure and produce:

```markdown
# Architecture

*Last updated: {YYYY-MM-DD}*

## Overview
{1-2 sentence description of the system}

## Package Structure
{For each top-level package/module:}
### {package-name}
- **Purpose:** {what it does}
- **Dependencies:** {what it imports}
- **Depended on by:** {what imports it}

## Key Patterns
- {Pattern 1: e.g., "Repository pattern for data access"}
- {Pattern 2: e.g., "Handler -> Service -> Repository layering"}

## Data Flow
{How data moves through the system — request lifecycle, event flow, etc.}

## Dependency Graph
{Key dependency relationships, import boundaries}
```

#### CONVENTIONS.md
Read actual code and extract patterns:

```markdown
# Conventions

*Last updated: {YYYY-MM-DD}*

## Coding Style
- {Observed naming patterns}
- {Error handling approach}
- {Logging patterns}

## Project Conventions
- {How configs are handled}
- {How migrations work}
- {API response format}

## Testing Conventions
- {Test file placement}
- {Test naming patterns}
- {Fixture/factory patterns}
- {Integration test approach}

## Git Conventions
- {Branch naming}
- {Commit message style}
- {PR process}
```

#### STACK.md
Detect from dependency files (go.mod, package.json, etc.):

```markdown
# Stack

*Last updated: {YYYY-MM-DD}*

## Language
- {Language and version}

## Frameworks
- {Web framework, version, what it's used for}
- {Other frameworks}

## Dependencies (key ones)
| Dependency | Version | Purpose |
|-----------|---------|---------|
| {name}    | {ver}   | {what it does} |

## Infrastructure
- **Database:** {type, how accessed}
- **Cache:** {if any}
- **Message queue:** {if any}
- **Search:** {if any}

## Dev Tools
- {Build tool}
- {Linter}
- {Test framework}
```

#### STRUCTURE.md
Map the directory tree:

```markdown
# Structure

*Last updated: {YYYY-MM-DD}*

## Directory Layout
{Annotated directory tree — top 3 levels with descriptions}

## Entry Points
- {Main entry point and what it starts}

## Module Boundaries
- {What's public vs internal}
- {Import restrictions}

## Key Files
| File | Purpose |
|------|---------|
| {path} | {what it does and why it matters} |
```

#### TESTING.md
Analyze test infrastructure:

```markdown
# Testing

*Last updated: {YYYY-MM-DD}*

## Test Infrastructure
- **Framework:** {test framework}
- **Runner:** {how tests are run}
- **Coverage tool:** {what measures coverage}

## Test Organization
- {Where tests live}
- {Test naming conventions}
- {Test categories (unit, integration, e2e)}

## Test Patterns
- {Table-driven tests? Actor-based BDD?}
- {Fixture/factory patterns}
- {How test data is managed}
- {Mocking approach}

## Current Coverage
- {Approximate coverage if measurable}
- {Areas with good coverage}
- {Areas with poor coverage}

## Test Types
{Per-repo, human-inspectable test taxonomy — one `### <type>` per discovered test type}
```

TESTING.md MUST include a `## Test Types` section. Seed it from
`${CLAUDE_PLUGIN_ROOT}/hooks/lib/test-types-seed.md` (the shipped `test-types-seed.md`),
then ADAPT each entry to the repo's actually-discovered test types and patterns — rename,
drop, or add types so the taxonomy describes THIS codebase, not the generic seed.

Keep the section structure parse-compatible with `taxonomy.js` (content adaptation only,
do not change the field syntax). For each type emit an H3 `### <type>` followed by:
- `- **boundary:** {what the test drives through}`
- `- **pattern:** {how tests of this type are written}`
- `- **location:** {where they live — globs/paths discovered in the repo}`
- `- **tier:** default|exception|sign-off`
- `- **when-to-use:** {when this type is the right choice}`
- `- **primitives:** {DSL helpers, fixtures, runners}`
- `- **match-paths:** {path globs where these tests live — drives deterministic classification in `/test-audit`}`
- `- **match-markers:** {identifier tokens that signal the type — e.g. the DSL primitives — also used to classify}`
- `- **good-example:** {a representative real test from the repo, as `path::TestName`}`
- `- **bad-example:** {a representative anti-pattern test, as `path::TestName`}`
- `- **anti-patterns:** {common smells for this type, comma-separated}`
- a fenced ```mermaid flowchart harness diagram showing actor → boundary →
  system-under-test → stubbed externals for that type.

For the actor-BDD craft rubric (what makes a *good* test of each type), REFERENCE the
canonical rules in the `testing` skill rather than restating them here — keep the taxonomy
descriptive of THIS repo and let the `testing` skill own the craft rules.

For UI/front-end test types, make the `pattern`/`primitives`/`good-example` fields concrete
about the repo's **page-object fixture + interacts/observes** convention (the UI form of the
actor pattern — see `front-end-testing` → `## Actor-BDD for UI`): where fixtures live, the
interact/observe verbs and API-actor object in use, and the file-location split (e.g. DSL
specs under `test/**/*.spec.tsx` vs ad-hoc `src/**/*.test.tsx`). The executor infers the UI
test shape from this — if it is left generic, agents fall back to inline `render`/`screen`/
`expect` and miss the house DSL.

Tiers: `default` (no friction — the expected choice), `exception` (sanctioned without
per-task approval, e.g. `dao` against a real datastore), `sign-off` (unit/none — needs
explicit user approval at plan time, so the choice is deliberate and human-reviewed).

#### INTEGRATIONS.md
Find external service connections:

```markdown
# Integrations

*Last updated: {YYYY-MM-DD}*

## External Services
| Service | Purpose | How Connected | Config |
|---------|---------|--------------|--------|
| {name}  | {what it does} | {HTTP, gRPC, SDK} | {env var or config key} |

## APIs Exposed
| Endpoint Pattern | Purpose |
|-----------------|---------|
| {pattern}       | {what it serves} |

## Authentication
- {How auth works — JWT, session, API key}
- {Where auth is configured}
```

#### CONCERNS.md
Identify risks and tech debt:

```markdown
# Concerns

*Last updated: {YYYY-MM-DD}*

## Known Tech Debt
- {Description, severity, location}

## Risks
- {Security concerns}
- {Performance concerns}
- {Scalability concerns}

## Missing
- {What should exist but doesn't — monitoring, logging, error tracking}

## Watch Out For
- {Gotchas specific to this codebase}
- {Non-obvious behavior}
- {Areas where bugs tend to appear}
```

### 4. Summary

```
Codebase mapped to .verified/codebase/

  ARCHITECTURE.md  — {N} packages documented
  CONVENTIONS.md   — coding and testing patterns
  STACK.md         — {N} dependencies cataloged
  STRUCTURE.md     — directory layout mapped
  TESTING.md       — test infrastructure documented
  INTEGRATIONS.md  — {N} external services
  CONCERNS.md      — {N} risks and tech debt items

These documents are automatically read during /plan and /implement
to inform implementation decisions.
```

## Important

- Document what EXISTS, not what SHOULD exist
- Be specific — file paths, package names, actual patterns found
- Don't invent structure that isn't there
- For empty/new projects, create minimal docs noting "project is new, no established patterns yet"
- These docs are updated incrementally by the doc-review agent after each feature completes
- Keep each document focused — architecture is not conventions, stack is not structure
