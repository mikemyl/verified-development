---
name: init
description: >-
  Initialize a project with verified development — scaffold configs, Justfile,
  linter settings, and .verified directory. Use when the user invokes /init or
  asks to set up verified development, scaffold a project, or configure quality gates.
version: 0.1.0
---

Set up a project for verified development. Works for both new and existing projects.

## Process

### 1. Detect or Ask Language

If language argument provided, use it. Otherwise:
- Check for `go.mod` -> Go
- Check for `tsconfig.json` or `package.json` with TypeScript -> TypeScript
- Check for `pom.xml` or `build.gradle` -> Java
- Check for `Cargo.toml` -> Rust
- If ambiguous, ask the user

Currently supported: **Go**. For other languages, create `.verified/` structure and config but skip language-specific toolchain scaffolding.

### 2. Check for Existing Assessment

If `.verified/assessment.md` exists (from `/assess`), read it and scaffold only what's missing.

### 3. Create .verified Directory

```bash
mkdir -p .verified/features
mkdir -p .verified/decisions
```

### 4. Create Config

Write `.verified/config.json`:

```json
{
  "language": "{detected}",
  "thresholds": {
    "coverage": 80,
    "mutation": 60,
    "cyclomatic_complexity": 10,
    "cognitive_complexity": 15
  },
  "workflows": {
    "require_spec": true,
    "require_review": true,
    "require_verify": true,
    "require_ui_spec": false
  }
}
```

### 5. Create Project Principles

Write `.verified/project.md`:

```markdown
# Project Principles

## What This Project Does
{Ask the user -- 1-2 sentences}

## Core Constraints
{Ask the user -- what are the non-negotiable rules?}

## Tech Stack
- Language: {detected}
- Framework: {ask or detect}
- Database: {ask}
- UI: {ask if applicable}

## Verification Standards
- Test coverage: >= 80%
- Mutation score: >= 60%
- All linter rules enforced (no warnings)
- Acceptance scenarios before implementation
- Two-stage review before merge
```

### 6. Scaffold Language-Specific Configs (Go)

Load the `go-verified-development` skill and read reference files.

Check which files already exist and only create missing ones:

| File | Source | Skip if exists? |
|------|--------|----------------|
| `Justfile` | `references/justfile-template.md` | Yes |
| `.golangci.yml` | `references/golangci-yml.md` | Yes |
| `revive.toml` | `references/revive-toml.md` | Yes |
| `codecov.yml` | `references/codecov-yml.md` | Yes |

Extract the config content from the reference markdown files (the content is in code blocks).

### 7. Verify Tool Installation

For Go, check that required tools are installed:

```bash
which golangci-lint && echo "golangci-lint: installed" || echo "golangci-lint: MISSING"
which revive && echo "revive: installed" || echo "revive: MISSING"
which gremlins && echo "gremlins: installed" || echo "gremlins: MISSING"
which gosec && echo "gosec: installed" || echo "gosec: MISSING"
which govulncheck && echo "govulncheck: installed" || echo "govulncheck: MISSING"
which deadcode && echo "deadcode: installed" || echo "deadcode: MISSING"
which just && echo "just: installed" || echo "just: MISSING"
```

Report any missing tools with install instructions.

### 8. Create Initial State

Write `.verified/state.md`:

```yaml
---
feature: none
phase: init
status: complete
last_activity: {YYYY-MM-DD} - Project initialized
---
```

### 9. Summary

```
Project initialized for verified development.

  Language:     {language}
  Config:       .verified/config.json
  Principles:   .verified/project.md
  Justfile:     {created / already existed}
  Linter config: {created / already existed}

  Missing tools: {list or "none"}

  Next steps:
    New project:      /specify <feature-name> to start your first feature
    Existing codebase: /map to analyze and document the codebase
                       /assess to check verification gaps
```

## Important

- Never overwrite existing config files without asking
- If Justfile exists with different targets, show the diff and ask before merging
- If linter config exists but is weaker, suggest additions but don't force
- The .verified/ directory should be committed to git (it's project documentation)
- .verified/decisions/ may start empty — that's fine, decisions accumulate over time
