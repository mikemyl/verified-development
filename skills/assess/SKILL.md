---
name: assess
description: >-
  Analyze an existing codebase against verified development standards and produce
  a gap analysis. Use when the user invokes /assess or asks to evaluate their
  project's verification state, audit quality gates, or check readiness.
version: 0.1.0
---

Analyze the current project against verified development standards. Produces a gap analysis showing what verification layers exist, what's missing, and what needs to change.

## Process

### 1. Detect Language and Project Structure

If language is provided as argument, use it. Otherwise detect:
- `.go` files + `go.mod` -> Go
- `tsconfig.json` or `package.json` with TypeScript -> TypeScript
- `pom.xml` or `build.gradle` -> Java
- `Cargo.toml` -> Rust
- If ambiguous, ask the user

Map the project structure:
- Source directories (where code lives)
- Test directories (where tests live, or if tests are co-located)
- Entry points (cmd/, main files)
- Package/module layout

### 2. Assess Current Verification State

Check for each verification layer:

**Build system:**
- [ ] Justfile or Makefile exists
- [ ] Has a `verify` or equivalent meta-target
- [ ] Individual targets for lint, test, coverage, etc.

**Linting:**
- [ ] Linter config exists (`.golangci.yml`, `.eslintrc`, etc.)
- [ ] Number of rules/linters enabled
- [ ] Complexity thresholds configured
- [ ] Warnings treated as errors

**Testing:**
- [ ] Test files exist
- [ ] Test runner configured with race detection (Go: `-race`)
- [ ] Test shuffling enabled (Go: `-shuffle=on`)
- [ ] Test caching disabled (Go: `-count=1`)
- [ ] Table-driven test pattern used
- [ ] Property-based tests present

**Coverage:**
- [ ] Coverage measurement configured
- [ ] Coverage threshold set (target: >=80%)
- [ ] Patch coverage configured
- [ ] CI coverage gates (codecov.yml, etc.)

**Mutation testing:**
- [ ] Mutation tool configured (gremlins, Stryker, pitest)
- [ ] Threshold set (target: >=60%)

**Security:**
- [ ] Security scanner configured (gosec, eslint-plugin-security, etc.)
- [ ] Dependency vulnerability checker (govulncheck, npm audit, etc.)

**Dead code:**
- [ ] Dead code detector configured (deadcode, ts-prune, etc.)

**Specifications:**
- [ ] `.verified/` directory exists
- [ ] Feature specs exist
- [ ] Acceptance scenarios defined

### 3. Analyze Test Quality

Sample existing tests (read up to 5 test files) and assess:
- Are tests behavior-driven (testing outcomes) or implementation-coupled (testing internals)?
- Are tests table-driven with boundary values?
- Do tests use property-based testing?
- Are there tautological tests (reimplementing function logic)?
- Test-to-code ratio (approximate)
- Any test factories / builders?

### 4. Produce Gap Report

Write the report to `.verified/assessment.md`:

```markdown
# Project Assessment

**Project:** {name}
**Language:** {language}
**Date:** {YYYY-MM-DD}

## Current State

| Layer | Status | Details |
|-------|--------|---------|
| Build system | {present/partial/missing} | {what exists} |
| Linting | {present/partial/missing} | {rules count, thresholds} |
| Testing | {present/partial/missing} | {flags, patterns} |
| Coverage | {present/partial/missing} | {threshold, CI gates} |
| Mutation | {present/partial/missing} | {tool, threshold} |
| Security | {present/partial/missing} | {scanners} |
| Dead code | {present/partial/missing} | {detector} |
| Specifications | {present/partial/missing} | {spec format} |

## Gaps

### Critical (blocks verified development)
- {what's missing and why it matters}

### Important (significantly reduces verification quality)
- {what's missing and why it matters}

### Nice-to-have (incremental improvements)
- {what could be better}

## Test Quality Assessment
- Pattern: {behavior-driven / implementation-coupled / mixed}
- Boundary coverage: {good / weak / absent}
- Property tests: {yes / no}
- Tautological tests found: {yes / no -- with examples if yes}
- Estimated test-to-code ratio: {X:Y}

## Recommended Actions
1. {Highest priority action}
2. {Next priority}
3. ...

Run `/init` to scaffold missing configurations.
```

### 5. Present Summary

Show the user:
- Overall readiness score (how close to verified development standards)
- Top 3 gaps to address
- Suggest running `/init` to scaffold missing pieces

## Important

- Do NOT modify any project files — this is read-only analysis
- Be specific about what exists vs. what's missing
- If test quality is poor, give concrete examples (file:line) not vague statements
- If linter config exists but is weak, compare rule count to the recommended config
- The assessment file at `.verified/assessment.md` is the only file written
