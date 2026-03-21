---
name: map
description: >-
  Analyze a codebase and produce structured context documents in .verified/codebase/.
  Use when the user invokes /map or asks to map the codebase, analyze project structure,
  document architecture, or understand an existing project deeply.
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
```

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
