# Plan: Adversarial Critique

**Spec:** [./spec.md](./spec.md)
**Status:** draft
**Created:** 2026-04-30

## Approach

Four layers, ordered:

1. **Reference content** — write the challenge question framework (`skills/specify/references/challenge.md`) and the critic rubric shared across the four agents (severity definitions + output schema). Content first, so the rest of the work can quote stable contracts.
2. **Agents** — four critic agent files. Each is short (system prompt + input/output contract). Same shape as our existing review agents.
3. **Skill edits** — `/specify` gets the challenge step (between Gather Context and Propose Approaches); `/plan` gets the critics step (between Quality Check and Present and Confirm). Both opt-out paths wired.
4. **Tests + wire-up** — prompt-anchor tests for the new agents and skill edits; integration test for the severity policy; `concerns.md` and `discussion.md` artifact assertions; version bump.

No new JS library. The critics are pure prompt files; aggregation happens inside the `/plan` skill instructions (LLM does the bookkeeping the same way it does for `/review` aggregation today).

## File map

```
agents/
  plan-critic-acceptance.md   # NEW — spec coverage
  plan-critic-design.md       # NEW — architecture, ADRs, abstraction
  plan-critic-ux.md           # NEW — only spawned when ui-spec.md exists
  plan-critic-strategic.md    # NEW — scope, priorities, dependency risk

skills/
  specify/
    SKILL.md                  # EDIT — add challenge step + opt-out
    references/
      challenge.md            # NEW — question framework + discussion.md template
  plan/
    SKILL.md                  # EDIT — add critics step + opt-out + severity policy

plans/adversarial-critique/
  templates/
    discussion.template.md    # NEW — spec-time audit trail skeleton
    concerns.template.md      # NEW — plan-time audit trail skeleton

tests/
  adversarial-critique.test.cjs  # NEW — prompt-anchor + severity-policy assertions

CLAUDE.md                     # EDIT — short note on the two gates
.claude-plugin/{plugin,marketplace}.json  # EDIT — bump to 1.3.0
```

## Shared rubric (will live in challenge.md / critic agents)

```
severity:
  error       — mechanical, auto-fixable: missing task for spec scenario,
                  undeclared dependency, type mismatch between tasks.
                  /plan re-drafts to address. NOT surfaced to user.
  warning     — judgment call: smell, possible scope creep, unclear ordering,
                  ambiguous task. /plan surfaces to user with the plan.
                  Max 10 visible across all critics, ranked by severity then critic order.
  suggestion  — opinion / nice-to-have. Recorded in concerns.md, NOT shown.
```

```
finding schema:
  { critic, severity, description, tied_to, recommendation? }
  where tied_to is a task ID (T### from plan.md) or scenario ID (S### from spec.md).
```

## Tasks (ordered, test-first where it makes sense)

### Phase A — Reference content

- [ ] **A1** Write `skills/specify/references/challenge.md`. Sections:
  - The six question categories (ambiguity, surface area, alternatives, edge cases, dependencies, out-of-scope) with 2–3 example questions each.
  - Socratic-mode rules: one question at a time, adapt to answers, max ~8 questions before proposing approaches.
  - Stop conditions: when the user has answered enough to disambiguate, when they say "enough", when 8 questions have been asked.
  - The `discussion.md` template (frontmatter + Ambiguities surfaced / Alternatives considered / Out-of-scope decisions / Open questions).
- [ ] **A2** Write `plans/adversarial-critique/templates/discussion.template.md` and `concerns.template.md`. Concrete skeletons the skills can quote.
- [ ] **A3** Define the rubric (severity definitions + finding schema) in a single block in challenge.md and re-use it verbatim in each critic agent. Avoids drift.

### Phase B — Critic agents

- [ ] **B1** `agents/plan-critic-acceptance.md` — spec coverage. Inputs: spec.md, plan.md (and ui-spec.md if exists). Output: findings list. Specific checks:
  - Every acceptance scenario maps to ≥1 task (else `error`).
  - Every requirement (FR/NFR) has at least one task or is explicitly N/A (else `error`).
  - Every edge case has at least one boundary test task (else `warning`).
  - Tasks reference scenario/requirement IDs (else `suggestion`).
- [ ] **B2** `agents/plan-critic-design.md` — architecture and ADRs. Specific checks:
  - Tasks introduce a new abstraction layer without an ADR (`warning`).
  - Tasks introduce a new dependency without it being declared in spec/plan (`error`).
  - Multiple tasks duplicate logic that should be extracted (`warning`).
  - File-path conventions inconsistent with `.verified/codebase/CONVENTIONS.md` if present (`warning`).
  - Test-first ordering violated (test task after implementation task in same chain) (`error`).
- [ ] **B3** `agents/plan-critic-ux.md` — UX. Conditional: only spawned when `ui-spec.md` exists. Specific checks:
  - Every screen in `ui-spec.md` has component task(s) (`error`).
  - Every defined state (loading/empty/error/success) has at least an implementation reference (`warning`).
  - Accessibility requirements per screen are reflected in tasks (`warning`).
  - Responsive breakpoints mentioned in ui-spec are implemented (`suggestion`).
- [ ] **B4** `agents/plan-critic-strategic.md` — scope and risk. Specific checks:
  - Plan size > 25 tasks (`warning`: feature too big — split?).
  - Plan size < 3 tasks for a non-trivial spec (`warning`: under-specified?).
  - Tasks reference future features that don't exist yet (`error`).
  - Dependency cycles in `(depends on TXX)` notes (`error`).
  - Tasks blocked behind a single contributor / single file (concentration risk, `suggestion`).
  - Phase ordering violates: setup → core → integration → UI (`warning`).
- [ ] **B5** Each critic agent file ends with the rubric block from A3 (verbatim). Lint-checked: descriptions ≤ 100 chars.

### Phase C — Skill edits

- [ ] **C1** `skills/specify/SKILL.md`:
  - Add new step "**4a. Challenge** (default on)" between current "Gather Context" and "Propose Approaches".
  - Step 4a: detect opt-out (`--no-challenge` arg or `workflows.challenge: false`); if not opted out, load `references/challenge.md`, run the Socratic Q&A loop, write `discussion.md` with the audit trail.
  - Update step 9 (Choose Next Phase) only if needed; keep the UI/non-UI prompt as-is.
  - Append: if challenge ran, mention `discussion.md` in the final report so the user knows it exists.
- [ ] **C2** `skills/plan/SKILL.md`:
  - Add new step "**8a. Critics** (default on)" between current "Quality Check" and "Present and Confirm".
  - Step 8a:
    1. Detect opt-out (`--no-critics` or `workflows.plan_critics: false`).
    2. Decide which critics apply: always {acceptance, design, strategic}; UX iff `ui-spec.md` exists.
    3. Spawn applicable critics in parallel via Task (single message, multiple tool uses).
    4. Aggregate findings; apply severity policy:
       - `error` → re-draft plan.md to address; record in `concerns.md` as `auto-resolved` with description of the change.
       - `warning` → record in `concerns.md` as `surfaced`; carry into Present and Confirm.
       - `suggestion` → record in `concerns.md` as `recorded`; do NOT show user.
    5. If a critic errored: record in `concerns.md` with `status: error`; surface to user.
  - Update Present and Confirm: include the surfaced warnings list (max 10, severity-ordered) below the plan; user can address by editing plan, dismissing (records in `concerns.md`), or asking for clarification.
  - On phase completion: do NOT delete `concerns.md`. It is evidence the gate ran.
- [ ] **C3** Re-run `node scripts/lint-descriptions.cjs` after both edits. (Skill descriptions are unchanged but new content can't push them over budget anyway.)

### Phase D — Tests + wire-up

- [ ] **D1** `tests/adversarial-critique.test.cjs` with sub-tests:
  - **Prompt-anchor**: each critic agent file contains: the rubric block, an "Inputs" section, an "Output" section listing required finding fields. UX critic also says "only spawn when ui-spec.md exists".
  - **Specify-skill anchor**: `skills/specify/SKILL.md` references `challenge.md`, mentions `--no-challenge`, mentions `discussion.md`, mentions the six question categories at least by name.
  - **Plan-skill anchor**: `skills/plan/SKILL.md` mentions all four critic agents by name, references `concerns.md`, mentions `--no-critics`, mentions the severity policy.
  - **Severity-policy contract**: parse a synthetic findings array {error×2, warning×3, suggestion×5}, apply the policy as documented in plan/SKILL.md, assert: 2 auto-resolved, 3 surfaced, 5 recorded.
- [ ] **D2** Update `CLAUDE.md` "Workflow features" section: add a short paragraph about the two gates (challenge step + plan critics) with the artifact paths (`discussion.md`, `concerns.md`) and the opt-out flags.
- [ ] **D3** Bump `plugin.json` and `marketplace.json` to **1.3.0** (minor — feature add, no breaking change).
- [ ] **D4** Manual end-to-end (deferred to user): drive a small feature through `/specify` → challenge Q&A → `/plan` → see surfaced concerns in `keros-platform`.

## Risk register

- **R1** Challenge step interrupts the user too aggressively for trivial features. Mitigation: opt-out via flag or global config; max 8 questions; the LLM is told to stop early when the user signals "enough".
- **R2** Critics produce too many findings, overwhelming the user. Mitigation: max-10 surfaced ceiling, severity-ordered; `suggestion` never shown; bounded `≤ 10` findings per critic per NFR2.
- **R3** Auto-resolve on `error` rewrites the plan in ways the user disagrees with. Mitigation: every auto-resolve is logged in `concerns.md` with description; user sees the re-drafted plan in Present and Confirm and can revert by editing.
- **R4** UX critic spawned without `ui-spec.md` produces useless output. Mitigation: conditional spawn — UX critic skipped when `ui-spec.md` is absent; reported in `concerns.md` as "skipped: no ui-spec.md".
- **R5** Critics drift from the rubric over time. Mitigation: rubric is a single block of text in `challenge.md` (A3) reused verbatim by each critic; prompt-anchor test asserts each agent contains the rubric block.
- **R6** Severity policy logic lives in prompt text, not code — could be misapplied by the LLM. Mitigation: the integration test (D1) defines the contract explicitly; if real runs reveal drift, codify the aggregation in `hooks/lib/critic-aggregator.js`. Defer until proven needed.
- **R7** Critic Task spawn syntax brittle. Mitigation: re-use the same Task-fan-out pattern that `/review` already uses — proven path.

## Verification

- `node tests/run.cjs` green on CI (35 + 4 new = ~39 tests).
- `node scripts/lint-descriptions.cjs` zero violations.
- Manual smoke (D4): `discussion.md` and `concerns.md` populated in a real feature, surfaced concerns visible alongside the plan.

## Out of plan

Same as spec out-of-scope: external-model convergence, pre-specify discovery (`/explore`/`/spike`), iterative re-critique, spec-time critic-after-the-fact. Each is a future feature.
