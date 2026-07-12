---
name: verify
description: "Run the verification pipeline: lint, test, coverage, security, dead-code, build."
version: 0.1.0
---

Run the project's verification pipeline. This is the single pass/fail gate for code quality.

## Interruptibility

This phase is interruptible. Wire format: see `skills/pause/SKILL.md`. On entry, write a handoff with `phase: "verify"` and `remaining_tasks` listing the verification stages: `lint`, `test`, `coverage`, `security`, `dead-code`, `build` (skip stages that don't apply to this project — read the project's verify command first to find out which exist). After each stage passes, `update` the handoff. On full pass, `clear` the handoff and set state.md `next_action: "/review"`. If a stage fails, leave the handoff with that stage in `remaining_tasks` and add a `severity: blocking` blocker describing the failure — this prevents `/continue` from skipping past it.

## Process

1. Detect the project's verify command. Detection is **language-agnostic** — it runs whatever the repo declares, in priority order: the `.verified/config.json` custom verify command first, else a `Justfile`/`Makefile`/`package.json`/`pom.xml` target (so a repo with multiple manifests resolves via `config.json` and never silently defaults to one language):
   - Read `.verified/config.json` for language and custom verify command — if present, this wins
   - Else if `Justfile` exists with a `verify` target → `just verify`
   - Else if `Makefile` exists with a `verify` target → `make verify`
   - Else if `package.json` has a `verify` script → `npm run verify`
   - Else if `pom.xml` exists → `mvn verify`
   - If none found, guide the user to run `/init` to define a verify command

2. Run the full verification pipeline:
   ```bash
   {detected verify command}
   ```

3. If any target fails:
   - Show the specific failure output clearly
   - Identify the root cause (which linter rule, which test, which threshold missed)
   - Suggest the specific fix needed
   - Do NOT proceed to the next target — fix failures in order

3b. Structured findings (informational, NON-BLOCKING). After the gate targets run, produce a
   structured view of what the static-analysis tools found:
   ```
   node ${CLAUDE_PLUGIN_ROOT}/hooks/lib/findings.js scan <path>
   ```
   This emits a `findings/v1` envelope (normalized, deduped findings across whatever linters the
   repo has, via SARIF). Surface it as a **structured findings** section in the report. It is
   **non-blocking and never flips pass/fail** — the repo's verify command from steps 1–3 remains the
   sole gate (same framing as the Farley score). `findings.js` never exits non-zero for "a linter
   found problems" and degrades gracefully: a missing or broken linter is listed in the envelope's
   `skipped`, never a failure. If `status` is `skip` (no applicable tool), just note that.

4. If all targets pass:
   - Report the results summary (coverage %, any warnings)
   - Confirm the codebase is verified
   - Test-quality signal (non-blocking): the mechanical gate does not score test
     quality. `/review` reports a **Farley Score** (Dave Farley's 8 properties) for
     changed tests — point the user there for a test-quality read. Never gate /verify on it.
   - Clear the handoff: `node ${CLAUDE_PLUGIN_ROOT}/hooks/lib/handoff.js clear .verified/features/<feature>`
   - Check `.verified/state.md` — if a feature is in the implement or verify phase:
     ```
     Verification passed. Next step: /review
     Do NOT commit until review is complete.
     ```
   - Update state.md: `phase: verify`, `status: complete`, `active_phase: ""`, `next_action: "/review"`, `next_phases: ["review"]`, `schema_version: 2`.

## Options

The user may request individual verification layers:
- Linting only
- Tests only
- Coverage check only
- Security scan only

Detect the individual targets from the project's build file (Justfile, Makefile, package.json scripts) and run the appropriate one.

## Important

- Never skip failing targets or suggest lowering thresholds
- If a linter rule fails and the user asks to suppress it, explain why the rule exists first
- Thresholds are defined in the project's build config — read them from there, don't hardcode
- If a verification tool is not installed, warn the user but continue with other targets
