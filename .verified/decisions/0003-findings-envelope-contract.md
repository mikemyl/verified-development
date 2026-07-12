# ADR 0003 — The `findings/v1` structured-finding envelope

**Status:** Accepted
**Date:** 2026-07-12
**Feature:** structured-finding-layer
**Context:** `/verify` today gets a single opaque pass/fail from the repo's verify command — there is no structured, per-finding stream. Two already-scoped follow-up features (a `/review` "don't re-report these" finding-injection, and a bounded static self-heal fix-loop) will both consume such a stream. This ADR fixes the shape of that stream now, since it is a cross-feature durable contract like `plan-waves/v1` (ADR 0001-era) and `test-gate/v1`. Per-decision audit trail: `.verified/features/structured-finding-layer/discussion.md`, `concerns.md`.

## Decision
Emit a versioned envelope `findings/v1`:

```
{
  schema: "findings/v1",
  scope:  "<what was scanned>",
  findings: [ { rule_id, file, line, severity, message, tool, lang } ],
  summary:  [ { severity, count } ],
  skipped:  [ { lang, tool, reason, hint } ],
  status:   "ok" | "skip"
}
```

- **SARIF is the interchange format.** Every adapter produces SARIF (natively or via a thin
  wrapper); `findings.js` `normalize()` maps SARIF `runs[].results[]` → the finding shape. SARIF is
  an OASIS standard most static-analysis tools already emit, so adapters stay thin.
- **`rule_id` is tool-prefixed `<tool>.<lang>.<rule>`.** Findings from different tools/languages
  never collide, and dedup (`file`+`line`+`rule_id`) is therefore **within-adapter** only.
- **`status` has no `fail`.** Findings are *data, not a gate*: an envelope never reports failure and
  the CLI never exits non-zero because "a linter found problems." `ok` = adapters ran; `skip` = no
  adapter/tool applied. Graceful degradation puts a skipped adapter in `skipped` with a `hint`.

## Rationale
The envelope is the substrate two later features depend on, so its shape must be stable before they
are built. SARIF-as-interchange keeps the plugin out of the business of parsing each tool's bespoke
output. Making the envelope non-gating (`status` has no `fail`, CLI never non-zero) preserves the
plugin doctrine that the repo's existing verify command is the *sole* pass/fail gate — the envelope
only informs. Tool-prefixed ids make dedup semantics unambiguous and defer the harder cross-tool
precedence question to when a second adapter actually exists.

## Rejected alternatives
- **(i) Each tool's native JSON, no common envelope.** Pushes per-tool parsing onto every consumer
  (review-injection, self-heal) — the coupling this ADR exists to prevent. Rejected.
- **(ii) Cross-tool dedup now (collapse two tools flagging the same line).** Needs a precedence
  policy (which tool wins) that a single-adapter feature cannot sensibly define; would be guesswork.
  Deferred until a second adapter lands.
- **(iii) Let the envelope carry a `fail` status / gate `/verify`.** Would make a missing or noisy
  linter able to block a green build — the exact failure mode the source's graceful-degradation
  design forbids. Rejected.

## Consequences
- `findings/v1` is a frozen contract; the two follow-up features build against it without touching
  `findings.js`.
- Cross-tool overlap suppression is a known deferred gap, documented in FR-004/EC-006.
- Adapters are drop-in: a new language is a `hooks/lib/findings/<lang>.js` exposing `{lang,
  extensions, tool, run}`; the core, dedup, and envelope are untouched.
