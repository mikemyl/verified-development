# Discussion — structured-finding-layer

Spec-time stress test. Origin: porting the SARIF unified-finding envelope from `agentic-dev-team`
(#808/#811), reviewed 2026-07-12.

## Surface area — scope decisions

Two forks settled up front:

### Q1 — self-heal fix-loop: OUT (envelope-only)
The bounded static self-heal loop (#811: autofix → verify → hand residue to agent, cap 2) is an
**executor-runtime** concern; the envelope is a **lib + /verify** concern. Different subsystems —
the same split that kept Feature 1 (deterministic-repair-loop) clean. Self-heal becomes a
follow-up that *consumes* the envelope this feature produces. Not in this feature.

### Q2 — /review injection: OUT (producer only, 4a not 4b)
The primary long-term value is handing confirmed mechanical findings to review agents so they stop
re-reporting what a linter already caught. But that adds a `/review` integration + a suppression
contract. **Decision: ship the producer now, defer the consumer.** This feature:
- `hooks/lib/findings.js` (the envelope) + a Go/golangci-lint SARIF adapter, and
- `/verify` surfaces the envelope as a **non-blocking informational section**.
The `/review` "don't re-report these" injection is the NEXT feature (`finding-injection`).

**No review-behavior change** in this feature. `/verify` gains an informational findings section
but its pass/fail gate is untouched (the section is like the Farley score: surfaced, never gating).

### Rejected: unwired primitive
Shipping `findings.js` with no caller would be the vaporware `test-review` flagged in Feature 1.
So `/verify` is wired as the minimal honest producer — that is the consumer that makes this real
without touching review behavior.

## Design decisions (settled, not open)

- **Pure parser + runtime seam.** `findings.js` `normalize()` parses **SARIF text** (from a
  fixture) into the envelope — no tool invoked, unit-testable model-free (mirrors how
  `test-corpus.js` parses source without a toolchain). The adapter's *tool invocation*
  (`golangci-lint --out-format sarif`) is a separate runtime seam that is skipped when the tool is
  absent.
- **Graceful degradation is first-class** (copied verbatim from the source): no configured tool →
  `status: skip`, exit 0, NEVER a pipeline failure; a missing/crashing linter degrades to
  skip-with-hint; a language-conditional tool is only probed when a file of its extension is in the
  changed scope. A broken linter must never block a green build.
- **Non-blocking.** The envelope never flips `/verify`'s pass/fail. The existing `just verify`
  (etc.) command remains the sole gate.

## Dependencies
- New `hooks/lib/findings.js` + a Go SARIF adapter (auto-loaded by extension, like the
  test-corpus lang adapters). No npm deps; Node-only; model-free.
- `/verify` (`skills/verify/SKILL.md`) gains a producer step that surfaces the envelope.

## Out of scope (explicit)
- `/review` finding injection / de-dup-against-agent-findings (→ next feature).
- The static self-heal fix-loop (→ later feature, executor-runtime).
- Non-Go adapters (TS/Python/Java) — the architecture supports them, but only Go/golangci-lint
  ships here; adding a language is a drop-in adapter later.
