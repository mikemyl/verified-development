# Discussion: language-agnostic-core (was: language-stacks)

Spec-time stress test audit trail.

## PIVOT (supersedes D1/D2 and the whole language-stacks direction)

After D1/D2 were settled, the user challenged the premise: *why bundle anything language-specific at all?* Toolchains churn (mocha→jest→vitest; maven/gradle; ruff replacing flake8), so bundled toolchain/idiom skills are a depreciating asset the plugin would own forever. Claude can infer idioms from the repo; repo-specific mechanics belong per-repo (`.verified/codebase/TESTING.md` + `CONVENTIONS.md` via `/map`, or a user's repo skill).

Key realization that dissolves the apparent need: `/verify` already runs the **repo's own** verify command (Justfile/Makefile/`package.json`/`mvn`) — it never needed to know the runner. `/test-audit` reads source via pluggable adapters. So the mechanical layer is already language-agnostic in mechanism; the only residual privilege is in `executor.md` (hardcodes go.mod/tsconfig and references a non-existent `tdd` skill).

**Decision (chosen): pivot to an agnostic core.** Abandon `language-stacks` (no per-language toolchain skills, no `/init` config generation, no per-language stack docs). Instead: make the executor language-agnostic (load neutral `testing`, infer runner/idioms from the repo + `.verified/codebase/`), fix the dangling `tdd` reference, confirm `/verify` + `/init` are stack-neutral, and document the "teach your stack per-repo" model. Keep the existing Go skills (`tdd-go`, `go-verified-development`) as-is — don't regress Go — but stop privileging a fixed language list.

- **Rejected — build TS/Python/Java stacks (original language-stacks):** bundles depreciating toolchain knowledge; not the plugin's durable value.
- **Rejected — smallest (just `/quick` the bug + reword):** leaves the executor's two-language hardcoding in place; the agnostic intent wouldn't be enforced or tested.
- **Rejected — full agnostic incl. demoting `tdd-go`/`go-verified-development`/Go review agents to opt-in:** correct philosophically but regresses Go-first and is a bigger blast radius; deferred.

D1/D2 below are SUPERSEDED — retained only as the record of the path not taken.

---

## Problem framing
After `test-audit` (v1.8.0), the workflow, test taxonomy, craft rubric, and `/test-audit` are language-neutral/multi-language, but the MECHANICAL layer is Go-only: the `/verify` toolchain (golangci-lint/revive/gosec/govulncheck), `/init` scaffolding, and executor TDD-skill selection privilege Go; there are no Python/Java TDD skills; and `executor.md`/`react-testing` reference a bare `tdd` skill that does not exist. This feature brings TypeScript, Python, Java to Go parity across the whole plugin.

## Decisions

### D1 — Skill structure: ONE toolchain skill per language; NO per-language TDD skills (revised)
- **Initial answer (superseded):** mirror Go with `tdd-<lang>` + `<lang>-verified-development` per stack.
- **Revised after challenge ("TDD is language-agnostic — why per-language TDD files?"):** the TDD *principles* are agnostic and already single-sourced in `skills/testing` (the six craft rules + what-to-test). A per-language TDD skill that restates them buys nothing. What IS language-specific is test *mechanics* (runner, assertion API, fixtures/parametrize idiom, file layout, run-a-single-test) — and that is small enough to live in the toolchain skill.
- **Chosen:** per stack, ONE `<lang>-verified-development` skill = the toolchain (lint/test/coverage/security/dead-code/build + thresholds + verify command) PLUS a short "writing tests in this stack" mechanics section that references the neutral `skills/testing` craft rules (no restatement). The executor loads `skills/testing` (principles) + `<lang>-verified-development` (mechanics + toolchain). The dangling bare `tdd` reference is fixed by repointing the executor/react-testing to `testing` + the toolchain skill — no per-language `tdd` skill is created.
- **Asymmetry accepted:** Go keeps its rich standalone `tdd-go` (don't-regress); new stacks fold mechanics into their toolchain skill. Normalizing Go later is out of scope.
- **Rejected — thin `tdd-<lang>` skills:** +3 files that overlap conceptually with the toolchain skill; structural parity with `tdd-go` isn't worth the redundancy.
- **Rejected — no language mechanics at all:** an executor writing a Python/Java test would get no stack idioms → non-idiomatic tests.

### D2 — `/init` depth: full scaffold (real configs + runnable verify command)
- **Chosen:** true Go parity. `/init` generates the per-stack linter/formatter/type/security configs AND a runnable `verify` command (chaining lint+test+coverage+security) plus `.verified/`. `/verify` detects the stack and runs it.
  - TS: eslint + strict `tsconfig` + vitest (+ coverage).
  - Python: ruff + mypy + pytest(+cov) + bandit, via `pyproject.toml`.
  - Java: spotbugs + OWASP dependency-check + JUnit5, via Maven (`pom.xml`) or Gradle (`build.gradle`).
- **Rejected — scaffold command, document configs:** lighter but not true parity (Go generates configs today).
- **Rejected — document-and-point only:** workflow would recognize the stack but the mechanical gate is user-assembled — not parity.
- **Constraint (carried from the ask):** the plugin can't INSTALL linters; it scaffolds configs + the command and documents the tools (consistent with how `go-verified-development` works). The tools themselves are the user's to install.

## Open / settled in spec
- **Language selection / monorepo:** `/verify` and the executor pick the stack via `config.json` `language` (authority) else manifest presence (`go.mod`/`tsconfig.json`/`pyproject.toml`|`requirements.txt`/`pom.xml`|`build.gradle`). Multiple manifests with no `config.json` language → error asking the user to set it. (Edge case.)
- **Java build systems:** support both Maven and Gradle (detect `pom.xml` vs `build.gradle`).
- **Phasing:** ONE feature, but the plan is expected to phase per-language (shared dispatch generalization first, then TS → Python → Java) and may split if it exceeds the ~20-task guidance. Flagged to the user; revisit at `/plan`.
- **Do not regress** the Go stack or the language-neutral core (the existing 206 tests + Go `/verify` path must stay green).

## Residual / out of scope
- Rust and other stacks (the parity matrix lists Rust as future).
- Installing toolchains (plugin scaffolds + documents only).
