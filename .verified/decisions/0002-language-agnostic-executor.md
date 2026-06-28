# ADR 0002 — Language-agnostic executor: inference over branching

**Status:** Accepted
**Date:** 2026-06-28
**Feature:** language-agnostic-core
**Context:** The workflow, taxonomy, craft rubric, `/test-audit`, and `/verify` were already language-agnostic in mechanism, but the executor still hardcoded a two-language detection branch (`go.mod` → `tdd-go`, `tsconfig.json` → a bare `tdd` skill that does not exist) and the docs framed Go as "the supported stack". That residual privilege bundled deprecating toolchain knowledge into the executor and dangled a reference to a non-existent skill. The per-decision audit trail is in `.verified/features/language-agnostic-core/discussion.md` and `concerns.md`.

## Decision
Replace the executor's explicit `go.mod`/`tsconfig` branching with: **load the neutral `testing` skill, then resolve the repo's test runner and idioms via an inference priority ladder** — (1) `.verified/codebase/TESTING.md` is authoritative when present; (2) else infer the dominant framework/assertion style from the repo's existing tests; (3) else fall back to the neutral `testing` skill with no idiom assumptions and proceed (never a missing-skill error). Go is applied additionally for `go.mod` repos as the one bundled example.

## Rationale
Toolchains are deprecating assets — the JS test runner alone has churned mocha → jest → vitest within a few years, and any hardcoded list goes stale. The durable value of this plugin is the *workflow and principles* (ATDD, the taxonomy, the craft rubric), not knowledge of any particular runner. Claude can infer a repo's idioms from the artifacts already in the repo (its `TESTING.md`, its existing tests), so encoding a fixed language list buys nothing and rots.

## Rejected alternatives
- **(i) Extend the explicit branch list to N languages.** Bundles per-language toolchain knowledge that depreciates, grows unboundedly, and still fails on the N+1th language. Rejected — it scales the wrong axis.
- **(ii) Require a per-repo skill to unlock any language support.** Too much friction: a repo with no custom skill (e.g. a fresh Rust or Elixir project) would get nothing instead of a sensible neutral fallback. Rejected — the neutral path must be the default.

## Consequences
- Executor idiom-resolution is now **inference-driven** but reproducible across executors via the deterministic priority ladder (TESTING.md → existing tests → neutral fallback), so two runs over the same repo resolve the same way.
- Go is retained as the one bundled example — `tdd-go` and `go-verified-development` are unchanged, so Go is not regressed (FR-009/AS-002).
- **Zero per-language files added (SC-004):** no new `tdd-<lang>` skill and no new `docs/<lang>-stack.md`; drift-guarded by `tests/language-agnostic-core.test.cjs`.
- `/init`'s Go toolchain scaffold (Justfile/golangci) changes from automatic-for-Go to an explicitly-offered, clearly-labeled example; the capability is kept, only its automatic/privileged status is removed.
