# Discussion — finding-injection

Spec-time stress test. The consumer half of `structured-finding-layer` (v1.17.0), deferred there
by design (that feature was scoped producer-only). Reviewed 2026-07-16.

## Alternatives — how /review gets the envelope (Q1)

- **(a rejected): `/review` runs `findings.js scan` itself.** Fresh and self-contained, but re-runs
  the linters (golangci-lint on a large module isn't free) minutes after `/verify` already ran them.
  Wasteful.
- **(b CHOSEN): `/verify` persists the envelope; `/review` reads it.** No linter re-run. Risk is
  staleness (code changed between verify and review) — solved by a **staleness guard**: `/verify`
  stamps the persisted envelope with the git SHA it scanned; `/review` compares to HEAD and, on
  mismatch, **discards it and injects nothing** (degrades to today's behaviour) rather than
  suppressing on stale data. Bonus: gives `findings.js` a real persisted artifact the future
  self-heal loop will also want.

## Alternatives — what gets injected (Q2)

The security review of v1.17.0 flagged: the envelope's `message` is untrusted tool output (a linter
message could carry adversarial reviewer-directed text) and must be fenced before reaching an LLM.

- **(a CHOSEN): keys only.** A suppression list needs only the finding *identity* —
  `file` + `line` + `rule_id` (rule ids are bounded identifiers like `golangci-lint.go.errcheck`,
  not prose). Injecting only keys means **no untrusted prose enters the prompt at all** — the threat
  disappears rather than being mitigated. Strictly safer and simpler.
- **(b rejected): keys + fenced messages.** Richer agent context, but imports linter prose into the
  prompt and needs the fencing machinery + a review-integrity extension. The agent gains little from
  the linter's wording; "errcheck already fired at db.go:42" is enough to not duplicate it.

## Design (stated, not open)

- **Suppression is per finding IDENTITY, not per line.** "errcheck at db.go:42" must NOT mean
  "ignore line 42" — a review agent may still legitimately report a *different* issue at the same
  location (a correctness bug the linter can't see). The injected instruction states this explicitly.
- **Non-gating.** Injection only steers agent attention; it never blocks review or changes
  PASS/WARN/FAIL. `status: skip`, a stale/absent/malformed envelope → zero injection, review
  proceeds exactly as today.

## Dependencies
- `findings.js` gains a pure `suppressionKeys(envelope) → string[]` (keys only, no message).
- `/verify` persists `.verified/features/<feature>/findings.json` (envelope + `git_head`).
- `/review` Stage 2 reads it, applies the staleness guard, injects the keys into each agent.
- Extends `skills/review/references/review-integrity.md` rule 1 (data, not instructions).

## Out of scope
- The static self-heal fix-loop (separate feature; also consumes the envelope).
- Fenced-message injection (rejected — keys-only removes the need).
- Any change to the producer (`findings.js scan`/adapters) beyond adding `suppressionKeys`.
