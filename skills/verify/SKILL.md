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

1. Check that a `Justfile` exists in the project root. If not, inform the user they need to run `/init` first.

2. Run the full verification pipeline:
   ```bash
   just verify
   ```

3. If any target fails:
   - Show the specific failure output clearly
   - Identify the root cause (which linter rule, which test, which threshold missed)
   - Suggest the specific fix needed
   - Do NOT proceed to the next target — fix failures in order

4. If all targets pass:
   - Report the results summary (coverage %, mutation %, any warnings)
   - Confirm the codebase is verified

## Options

The user may request individual targets:
- `just lint` — linting only
- `just test` — tests only
- `just coverage` — coverage check only
- `just mutation` — mutation testing only
- `just security` — security scan only
- `just deadcode` — dead code detection only
- `just build-check` — compilation and dependency check

If the user says "just run the tests" or similar, run only the relevant target, not the full pipeline.

## Important

- Never skip failing targets or suggest lowering thresholds
- If a linter rule fails and the user asks to ignore it, explain why the rule exists before adding a nolint directive
- Coverage and mutation thresholds are defined in the Justfile — read them from there, don't hardcode
- If `gremlins` is not installed, warn the user but continue with other targets
