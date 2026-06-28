# Planned feature: test-audit (follow-on to enforced-test-taxonomy)

**Status:** not started. Build AFTER `enforced-test-taxonomy` lands and has been used on at least one real feature.

## One-liner
A retroactive, advisory command that sweeps existing tests in a given path and triages them against the repo's test taxonomy — the corpus-cleanup counterpart to the forward-enforcing gate.

## Why separate from enforced-test-taxonomy
- **Depends on it:** consumes the `## Test Types` taxonomy that feature defines; can't exist before it.
- **Different severity model:** a gate that blocks new plans vs. a report that advises on already-merged code. Everything an audit finds is WARN by definition.
- **Scope:** keeps the gate feature contained.

## Sketch (refine at /specify time)
- **Command:** `/test-audit <path-or-module>` (e.g. `internal/analytics`).
- **Behavior:** read repo taxonomy; walk every test in scope; per test emit inferred type, sanctioned-boundary match, traceability (can it tie to a behavior/scenario?), and a Farley score.
- **Reuse:** delegates to existing `test-review` + `test-design-reviewer` (Farley) agents in *sweep* mode over a directory instead of a diff. New parts: the runner, taxonomy-match classification, report aggregation.
- **Output:** durable triage report, e.g. `.verified/audits/<module>-tests.md` — a ranked worklist of worst offenders. Advisory, never a gate.
- **Not** `/review` (diff-scoped to active feature) and **not** `/assess` (whole-project standards gap). Its own verb.

## First target when built
keros-platform Analytics tests.
