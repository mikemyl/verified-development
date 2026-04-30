# Adversarial Critique

**Status:** draft
**Created:** 2026-04-30
**Authors:** Mike Mylonakis, Claude

## Problem

The plugin's current workflow lets the LLM rubber-stamp the user's framing of both the problem and the solution.

1. **`/specify` doesn't push back.** The user describes a feature; the LLM dutifully writes acceptance scenarios for *the feature as described*, not the feature *that should be built*. Hidden assumptions, missed surface area, and unstated alternatives go unchallenged.
2. **`/plan` is reviewed only by the model that wrote it.** Plan tasks may miss spec scenarios, smuggle in undeclared architectural decisions, or carry scope creep that's invisible to the author. The user is the only stress-test before `/implement`.

Both gaps are validated by independent solutions in `agentic-dev-team` (4 plan-review personas) and `get-shit-done` (`discuss-phase` adversarial Q&A + `plan-review-convergence`). Both tools converged on the same observation: the cheapest place to find a problem is *before* you commit to it.

## Goal

Stress-test the problem framing before `spec.md` is written, and stress-test the plan before the user is asked to approve it. Make weak specs and weak plans visible, not invisible.

## Acceptance Scenarios

### S1 — Challenge mode interrogates the problem before the spec is written

**Given** I run `/specify foo "add a notifications feature"`
**And** challenge mode is on (default)
**When** `/specify` reaches the "Gather Context" step
**Then** before proposing approaches or writing `spec.md`, the agent walks me through an adversarial Q&A covering at minimum:
  - **Ambiguity**: any vague terms in my description ("fast", "user", "secure")
  - **Surface area**: what other parts of the system this touches
  - **Alternatives**: at least two materially different approaches with trade-offs
  - **Edge cases**: zero-state, max-state, concurrent-state behaviour
  - **Dependencies**: what this assumes that isn't built yet
  - **Out of scope**: explicit list of what this feature does NOT include
**And** I am asked questions one at a time, not as a wall of bullets
**And** the questions adapt to my answers (Socratic, not scripted).

### S2 — Discussion is recorded as an audit trail

**Given** challenge mode ran
**When** the spec is written
**Then** `.verified/features/{feature}/discussion.md` exists containing:
  - Frontmatter: `feature`, `created`, `mode: "challenge"`
  - Sections: Ambiguities surfaced, Alternatives considered (each with "rejected because…"), Out-of-scope decisions, Open questions deferred to plan
**And** options that were considered and rejected are preserved (not just the option that was chosen).

### S3 — Challenge mode is opt-out

**Given** I do NOT want to be challenged for a quick spec
**When** I run `/specify foo "..." --no-challenge`
**Then** `/specify` skips the challenge step
**And** writes `spec.md` directly
**And** does NOT write `discussion.md`
**Or** if `.verified/config.json` has `"workflows": { "challenge": false }`, the same opt-out applies globally without the flag.

### S4 — Plan critics run before user approval

**Given** `/plan` has drafted a `plan.md` and is about to call "Present and Confirm"
**When** plan critics are enabled (default)
**Then** the agent spawns four critic agents in parallel, each receiving:
  - The feature's `spec.md`
  - The drafted `plan.md`
  - The feature's `ui-spec.md` (if it exists)
  - Context docs from `.verified/codebase/` (if they exist)
**And** the four critics are: `plan-critic-acceptance`, `plan-critic-design`, `plan-critic-ux`, `plan-critic-strategic`
**And** each returns a structured concerns list (severity + description + tied-to-task-or-scenario).

### S5 — Critics run only when applicable

**Given** the feature has no `ui-spec.md`
**When** plan critics dispatch
**Then** `plan-critic-ux` is skipped (not spawned)
**And** the report explicitly notes "UX critic skipped: no ui-spec.md".

### S6 — High-severity findings are addressed inline

**Given** the critics return concerns with `severity: error` (mechanical findings: missing task for a scenario, undeclared dependency, etc.)
**When** `/plan` aggregates results
**Then** `/plan` re-drafts `plan.md` to address each `error` finding
**And** the re-draft is recorded in `concerns.md` ("auto-resolved: added task TXX for scenario S3")
**And** ONLY judgment-call findings (severity `warning` or `suggestion`) are surfaced to the user.

### S7 — Concerns surface to user with the plan

**Given** the critics found judgment-call concerns that were not auto-resolved
**When** `/plan` reaches "Present and Confirm"
**Then** the user sees the plan PLUS a numbered list of remaining concerns (max ~10, by severity)
**And** each concern lists its critic, severity, and tied-to-task ID
**And** the user can address each by editing the plan, dismissing it, or asking for clarification
**And** dismissed concerns are recorded in `concerns.md` with a one-line rationale.

### S8 — Concerns artifact is preserved

**Given** `/plan` completes (user approves the plan)
**When** the handoff is cleared
**Then** `.verified/features/{feature}/concerns.md` is preserved (not deleted)
**And** contains: critics that ran, total findings by severity, auto-resolved findings, surfaced findings with user disposition (addressed/dismissed/deferred).

### S9 — Critic skipped on no-finding

**Given** a critic completes with zero findings
**When** results are aggregated
**Then** the critic is listed in `concerns.md` with `findings: 0` so the user can see it ran
**And** no entry appears in the user-facing surfaced list.

### S10 — Plan critics are opt-out

**Given** I want to skip plan critics for a small feature
**When** I run `/plan foo --no-critics`
**Then** `/plan` skips critic dispatch
**And** proceeds straight to "Present and Confirm"
**And** `concerns.md` is not written.

### S11 — Failure modes surface, do not block

**Given** a critic agent errors out (timeout, malformed response)
**When** results are aggregated
**Then** the failed critic is reported in `concerns.md` with `status: error` and the error message
**And** `/plan` proceeds — a single critic failure does NOT halt the flow
**And** the user is told which critic(s) didn't run.

## Requirements

### Functional

- **FR1** New step in `/specify` between "Gather Context" and "Propose Approaches": **Challenge**. Default on; `--no-challenge` flag and `workflows.challenge: false` config flag both opt out.
- **FR2** Challenge step writes `.verified/features/{feature}/discussion.md` with the audit-trail structure from S2.
- **FR3** New reference doc `skills/specify/references/challenge.md` containing the question framework (six categories from S1) and the audit-trail template. Loaded by the `/specify` skill when challenge mode runs.
- **FR4** Four new agents under `agents/`:
  - `plan-critic-acceptance.md` — verifies spec coverage (every scenario, requirement, edge case maps to a task)
  - `plan-critic-design.md` — flags hidden architectural decisions, missing ADRs, abstraction smell
  - `plan-critic-ux.md` — checks UI/UX implications (only spawned when `ui-spec.md` exists)
  - `plan-critic-strategic.md` — scope creep, priority order, missing/over-engineered tasks, dependency risk
- **FR5** New step in `/plan` between "Quality Check" and "Present and Confirm": **Critics**. Default on; `--no-critics` flag and `workflows.plan_critics: false` config flag both opt out.
- **FR6** Critics run in parallel (single-message Task spawn). Each returns structured findings: `severity` (error|warning|suggestion), `description`, `tied_to` (task ID or scenario ID), optional `recommendation`.
- **FR7** `/plan` aggregates findings and applies severity policy:
  - `error` → auto-address by re-drafting plan.md, log to concerns.md as auto-resolved
  - `warning` → surface to user with the plan, max 10 visible
  - `suggestion` → record in concerns.md, do NOT block the user with these
- **FR8** `concerns.md` artifact at `.verified/features/{feature}/concerns.md` preserved after plan completion, with sections: Critics run, Findings summary, Auto-resolved, Surfaced (with disposition).
- **FR9** UX critic is conditionally spawned only when `ui-spec.md` exists. Other critics always spawn.
- **FR10** Critic failure (error/timeout) is non-fatal: log status in concerns.md, surface to user, proceed with remaining critics' results.

### Non-functional

- **NFR1** Critics run in parallel — total wall time is max(slowest critic), not sum. Use a single message with multiple Task tool uses.
- **NFR2** Critic outputs are bounded — each critic returns ≤ 10 findings to keep aggregation tractable.
- **NFR3** `concerns.md` is the audit trail; `discussion.md` is the audit trail. Both are preserved after the phase completes — they are evidence the gate ran.
- **NFR4** Backwards-compat: existing features without `discussion.md` or `concerns.md` continue to work; the artifacts only appear for new features specified/planned after this ships.
- **NFR5** No dependency on the feature being interruptible (v1.2.0). Both gates fit inside a single phase invocation.
- **NFR6** Lint clean: agent/skill descriptions stay ≤ 100 chars.
- **NFR7** Tests: prompt-anchor assertions for the four critic agents (each contains the expected input/output contract) + integration test that simulates a critic dispatch end-to-end.

## Out of scope

- External-model convergence loop (GSD's `plan-review-convergence` shelling to ollama/codex/gemini). Stays local to Claude.
- Pre-`/specify` ideation/discovery (GSD's `/explore`, `/spike`, `/sketch`). The challenge step interrogates a *given* feature description; it does not help you find what to build in the first place.
- Iterating critics across multiple plan revisions. One round per `/plan` invocation; user re-runs `/plan` if they want a re-critique.
- Spec critics. Stress-testing the spec is what challenge-mode does at the *problem* level; we deliberately skip a fifth critic role for spec-time, since the spec is itself the contract that downstream critics rely on.
- Replacing the existing `spec-compliance-review` agent (which runs in `/review` after implementation). That gate stays — it's checking code-vs-spec, not plan-vs-spec.

## Resolved decisions

- **D1** Both gates ship in one feature — they share the "stress-test before commit" theme and the spec stays focused.
- **D2** Critics are agents, not skills. They run autonomously, return findings, and exit — same shape as the existing review agents.
- **D3** Both gates default on (opt-out via flag or config). The user wanted to be *forced* to think harder; the cost of an unwanted gate is one extra flag, the cost of a missed gate is wasted implementation work.
- **D4** Severity policy: `error` auto-addressed, `warning` surfaced (max 10), `suggestion` recorded only. Mechanical findings get fixed; judgment calls go to the human.

## Verification approach

- **Prompt-anchor tests** — each new agent file contains its expected contract (input fields, output schema, severity rubric).
- **Integration test** — fake `/plan` flow that aggregates synthetic critic outputs through the severity policy; verify auto-resolve fires on `error`, surfaces fire on `warning`, and `suggestion` is recorded only.
- **Lint** — descriptions ≤ 100 chars on all new agents.
- **Manual end-to-end** — drive a small feature in a target project (`keros-platform`) through `/specify` → challenge Q&A → spec.md → `/plan` → see surfaced concerns. Confirm `discussion.md` and `concerns.md` are populated and useful.
