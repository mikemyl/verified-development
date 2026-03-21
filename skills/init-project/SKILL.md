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

Supported stacks: **Go** (full toolchain scaffolding). For other languages, create `.verified/` structure and config, then provide guidance on what verification tools to set up.

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

### 6. Scaffold Language-Specific Configs

Based on the detected language, load the appropriate language skill and scaffold verification toolchain configs.

**Go:** Load `go-verified-development` skill. Scaffold (if not already present):
- `Justfile` — from `references/justfile-template.md`
- `.golangci.yml` — from `references/golangci-yml.md`
- `revive.toml` — from `references/revive-toml.md`
- `codecov.yml` — from `references/codecov-yml.md`
- Check tool installation: just, golangci-lint, revive, gremlins, gosec, govulncheck, deadcode

**Java:** Suggest verification setup:
- Build tool: Maven (`mvn verify`) or Gradle
- Linting: SpotBugs, Checkstyle, PMD
- Mutation: PIT (pitest)
- Security: OWASP dependency-check
- Coverage: JaCoCo (>= 80%)

**TypeScript:** Suggest verification setup:
- Build tool: package.json scripts
- Linting: ESLint with strict config
- Mutation: Stryker
- Security: npm audit, eslint-plugin-security
- Coverage: vitest --coverage (>= 80%)

**Other languages:** Create `.verified/` structure and config. Ask the user what verification tools they use and document them in config.json.

### 7. Verify Tool Installation

Check that required tools for the detected language are installed. Report any missing tools with install instructions.

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
