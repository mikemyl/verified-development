# Plan Critics — language-agnostic-core

Audit trail of the plan-time stress test (`/plan` step 8b).

## Critics that ran
- `plan-critic-acceptance` — ran
- `plan-critic-design` — ran
- `plan-critic-strategic` — ran
- `plan-critic-parallelization` — ran (wave engine reported `parallel: true`)
- `plan-critic-ux` — skipped (no ui-spec.md)

## Findings by severity
- error: 2 (both the same root cause; auto-resolved)
- warning: 7 (auto-resolved — all cheap and correct)
- suggestion: 4 (3 auto-applied, 1 recorded)

## Auto-resolved (errors)
1. **AS-004 had no test assertion in T001** (acceptance/design). T006 claimed `prompt-anchor` but ships no test. → Added T001 assertion (g): `skills/verify/SKILL.md` is language-agnostic, states detection priority (EC-005), and routes the no-command case to `/init` (EC-001).
2. **AS-005 had no test assertion in T001** (acceptance/design). T007 claimed `prompt-anchor` but ships no test. → Added T001 assertions (h) init-neutral + (i) init-still-describes-Go-scaffold (AS-002 coverage). Corrected the false "all 8 served" footer.

## Auto-resolved (warnings)
3. **`/init` is a real Go behavioral change, and the Decisions section denied it** (strategic). → Rewrote the Decisions entry: Go auto-scaffold becomes *opt-in/offered*, capability retained, privilege removed. Honest restatement. T001(i) now guards that the Go scaffold is still described.
4. **"infer from the repo" was underspecified** (design×2). → T002 now carries an explicit priority ladder: TESTING.md authoritative → existing tests → neutral fallback (EC-002, e.g. Rust/Elixir). Reproducible across executors.
5. **`skills/implement/SKILL.md` framed detection as a binary two-option list; T005 only fixed line 64** (design/parallelization). → T005 broadened to neutralize the whole block; T001(f) adds the implement-side negation assertion (guards T005's half of AS-001).
6. **T001 "all FAILING now" was wrong for SC-004 + AS-002** (already green) (strategic). → T001 relabels (b) and (i)/(d) as regression guards (green, must stay green); the rest are genuinely RED.
7. **EC-005 (multi-manifest → no silent Go default) had no coverage** (acceptance). → Folded into T006 + T001(g).
8. **T002 + T005 semantic coupling — two parallel tasks define the same "load skills" mechanic with no cross-check** (strategic/parallelization). → Both task descriptions now require *identical phrasing* for the Go case and the inference model.
9. **T009 + T010 both described the per-repo extension point** (strategic/parallelization). → T009 narrowed to reframing Go only; the extension-point model lives solely in T010; T009 links to it.

## Auto-applied (suggestions)
10. **Split T001 into named entries** (strategic). → T001 now specifies one named `{name, fn}` entry per assertion group for per-assertion failure attribution during parallel Wave 2.
11. **No ADR for the agnostic-core pivot; ADR debt recurring** (design×2). → Added T013 writing `.verified/decisions/0002-language-agnostic-executor.md`; the core pivot rationale + rejected alternatives moved into `## Decisions`. T001(l) anchors the ADR's existence (so T013 stays `prompt-anchor`, no extra sign-off).

## Recorded only (suggestion)
12. **T011/T012 version-string contract** (parallelization). Not auto-fixed structurally: both tasks now pin the literal strings (`"1.9.0"` in JSON; heading `(v1.9.0+)` in CLAUDE.md), so there's no ambiguity for the two concurrent executors. Acceptable by construction; no test cross-check added.
