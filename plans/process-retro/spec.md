# Process Retro

**Status:** draft
**Created:** 2026-04-30

## Problem

Code-level learnings from a feature are captured (`/review` step 8 → `CONVENTIONS.md`, `CONCERNS.md`, ADRs, etc.). Process-level learnings — what we learned about *how we worked* on the feature — have no home. Cross-feature trend aggregation does not exist; per-feature signals are scattered and unreadable in aggregate.

## Goal

Add the smallest viable surface for process reflection, without spawning a separate `/retro` skill. Extend `/review` step 8 with two new outputs.

## Acceptance Scenarios

### S1 — Process retro is written at end of `/review`

**Given** `/review` step 8 (Capture Learnings) is running
**When** the existing code-level capture completes
**Then** `.verified/features/{feature}/retro.md` is written with frontmatter (`feature`, `created`, `phase: review`) and four sections: **What worked**, **What didn't**, **Workflow tuning signals**, **Top process learning**
**And** the file is short — typically 2–5 bullets per section, frequently empty sections
**And** the file focuses on PROCESS not CODE (workflow signals, plan-vs-reality drift, gate noise/value, time spent vs estimate). Code-level findings stay in `CONVENTIONS.md` / `CONCERNS.md` / ADRs as before.

### S2 — Cross-feature digest is appended

**Given** `retro.md` was written
**When** the same step completes
**Then** `.verified/learnings.md` exists (created if absent) and a single line is appended:
  - format: `- {YYYY-MM-DD} **{feature}** — {top-process-learning verbatim from retro.md}`
**And** existing entries are NOT modified
**And** the file remains greppable / scannable across many features.

### S3 — Empty retro is allowed

**Given** the feature ran smoothly with no surprises
**When** retro is written
**Then** sections may be empty (e.g. "_(none)_" or just elided)
**And** the digest line is still written, with the top learning being something like "no notable process surprises".
**And** this is fine — the absence of signal is itself a signal over time.

### S4 — Retro is process-only, not code

**Given** the user describes a code-level learning during retro
**When** `/review` is generating the retro content
**Then** code-level findings are routed to their existing destinations (`CONCERNS.md`, `CONVENTIONS.md`, ADRs) — NOT into `retro.md`
**And** `retro.md` deliberately stays narrow — workflow / time / gate effectiveness / plan-vs-reality.

## Requirements

### Functional

- **FR1** Extend `skills/review/SKILL.md` step 8 with a new sub-step **8c. Process Retro** (the existing capture is 8a/8b implicitly; this slots after them).
- **FR2** Process retro writes `.verified/features/{feature}/retro.md` per template.
- **FR3** Process retro appends one line to `.verified/learnings.md` per template.
- **FR4** Templates at `plans/process-retro/templates/retro.template.md` and `learnings.example.md`.
- **FR5** Retro section content explicitly distinguishes from code-level capture: prompt instructions list what belongs IN retro (workflow tuning, gate noise/value, plan-vs-reality, time signals) vs what belongs ELSEWHERE (gotchas, conventions, decisions, dependencies).

### Non-functional

- **NFR1** No new skill. No new agent. No new hook. This is a `/review` extension, full stop.
- **NFR2** Retro is best-effort: if `/review` decides there's nothing process-worthy to capture, "no notable process surprises" + an empty body is acceptable.
- **NFR3** Lint clean (descriptions unchanged).
- **NFR4** Tests: prompt-anchor assertions on the new step + template structure assertion.

## Out of scope

- Standalone `/retro` skill. Discussed and rejected — would duplicate `/review` step 8.
- Cross-feature analytics / dashboards / aggregation tooling. The flat `learnings.md` is grep-bait; pattern-spotting stays manual.
- Trend reports across milestones. We don't have milestones.

## Resolved decisions

- **D1** Process-retro is a `/review` step extension, not a new skill. Avoids duplicating capture surfaces.
- **D2** Two artifacts: per-feature `retro.md` (focused, narrow) + cross-feature `learnings.md` (digest, append-only). The first is the audit trail; the second is the trend signal.
- **D3** Retro is process-only; code-level capture stays where it is. The line between them lives explicitly in the prompt.

## Verification

- Prompt-anchor test: `skills/review/SKILL.md` mentions `retro.md`, `learnings.md`, the four section names, and explicitly distinguishes process vs code capture.
- Template structure test: both template files have the documented sections / format.
- Lint clean.
- Manual: drive a feature through `/review` and confirm both artifacts appear.
