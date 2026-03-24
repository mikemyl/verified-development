---
name: verify
description: >-
  Run the full verification pipeline (lint, test, coverage, mutation, security,
  dead code, build). Use when the user invokes /verify or asks to run verification,
  check quality gates, or run linters/tests/coverage.
version: 0.1.0
---

Run the project's verification pipeline. This is the single pass/fail gate for code quality.

## Process

1. Detect the project's verify command:
   - Read `.verified/config.json` for language and custom verify command
   - If `Justfile` exists with a `verify` target → `just verify`
   - If `Makefile` exists with a `verify` target → `make verify`
   - If `package.json` has a `verify` script → `npm run verify`
   - If `pom.xml` exists → `mvn verify`
   - If none found, inform the user they need to run `/init` first

2. Run the full verification pipeline:
   ```bash
   {detected verify command}
   ```

3. If any target fails:
   - Show the specific failure output clearly
   - Identify the root cause (which linter rule, which test, which threshold missed)
   - Suggest the specific fix needed
   - Do NOT proceed to the next target — fix failures in order

4. If all targets pass:
   - Report the results summary (coverage %, mutation %, any warnings)
   - Confirm the codebase is verified
   - Check `.verified/state.md` — if a feature is in the implement or verify phase:
     ```
     Verification passed. Next step: /review
     Do NOT commit until review is complete.
     ```
   - Update state.md phase to `verify` with status `complete`

## Options

The user may request individual verification layers:
- Linting only
- Tests only
- Coverage check only
- Mutation testing only
- Security scan only

Detect the individual targets from the project's build file (Justfile, Makefile, package.json scripts) and run the appropriate one.

## Important

- Never skip failing targets or suggest lowering thresholds
- If a linter rule fails and the user asks to suppress it, explain why the rule exists first
- Thresholds are defined in the project's build config — read them from there, don't hardcode
- If a verification tool is not installed, warn the user but continue with other targets
