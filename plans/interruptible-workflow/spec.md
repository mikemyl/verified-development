# Interruptible Workflow

**Status:** draft
**Created:** 2026-04-30
**Authors:** Mike Mylonakis, Claude

## Problem

The plugin's `state.md` records *which feature and which phase* you're in, but nothing about *where you are inside that phase*. When a session ends mid-phase — context exhausted, browser closed, machine slept, day ended — restarting requires reconstructing intent from the conversation history (often gone) or by re-reading artifacts and guessing. In practice this means:

1. Users avoid stopping mid-phase, padding sessions until phase boundaries even when context is degraded.
2. When interruption is forced, the next session starts with `/progress` followed by a string of "what was I doing?" exchanges.
3. Sub-tasks completed mid-phase are silently re-done because nothing recorded them.
4. The status line shows `feature:phase` but says nothing about what's *next*, forcing the user to remember the phase order.

This costs context budget, time, and trust in the workflow.

Both `agentic-dev-team` (`memory/<phase>-progress-<slug>.md` + `/continue`) and `get-shit-done` (`HANDOFF.json` + `.continue-here.md` + `pause-work`/`resume-work`) independently solved the same gap. We have neither.

## Goal

Make every workflow phase interruptible at any tool-use boundary, with enough state captured that a fresh session can resume in the right place without conversation replay.

## Acceptance Scenarios

### S1 — Mid-phase pause produces machine-readable state

**Given** I am in `phase: implement` partway through executing a plan
**And** I have completed plan tasks 1, 2, 3 of 7
**When** I run `/pause` (or context monitor hits critical and the agent volunteers)
**Then** `.verified/features/<feature>/handoff.json` is written containing:
  - the feature name and phase
  - the list of completed plan tasks (with task IDs from plan.md)
  - the list of remaining plan tasks
  - any in-flight blockers, each marked `severity: blocking` or `advisory`
  - the git HEAD at pause time
  - a timestamp
**And** `.verified/features/<feature>/continue-here.md` is written containing a human-readable narrative: what was last done, what's next, any decisions made mid-phase.

### S2 — Resume in fresh session lands in the right place

**Given** `handoff.json` and `continue-here.md` exist for the current feature
**And** I start a fresh session
**When** the SessionStart hook fires
**Then** the agent reads `state.md`, then `handoff.json`, then `continue-here.md` *before* responding
**And** the agent's first message tells me: which feature, which phase, which task I was on, and what the next concrete action is
**And** if `severity: blocking` items are present, they are listed and the agent does not proceed until they are addressed.

### S3 — State.md surfaces next action

**Given** any feature is in flight
**When** the status line renders
**Then** it shows the feature, current phase, and `next_action` from `state.md`
**And** `next_action` is one of: a slash command (`/plan`, `/implement` etc.) or a free-form recommendation ("address blocker: X")
**And** when the orchestrator is mid-phase, `state.md` carries `active_phase: <name>` and the status line distinguishes "in flight" from "next up".

### S4 — Phase completion clears handoff state

**Given** I have a `handoff.json` for `phase: plan`
**When** the `plan` skill writes `plan.md` and updates `state.md` to `phase: implement`
**Then** the stale `handoff.json` is deleted
**And** `next_action` is updated to the next phase's command
**And** `last_activity` is updated.

### S5 — Mid-phase progress is captured automatically

**Given** I am in `phase: implement`
**And** the plan has 7 tasks
**When** I complete a plan task (the orchestrator marks it done)
**Then** `handoff.json` is updated to reflect the new completed/remaining lists
**And** the update is atomic (writes to a temp file then renames).

### S6 — Manual pause works mid-tool-use

**Given** I am in any phase
**When** I type `/pause` with optional reason text
**Then** the current skill captures whatever progress is reconstructable (from plan.md task checkboxes, git, recent edits) and writes `handoff.json` + `continue-here.md`
**And** the agent does not start any new work — it ends the turn.

### S7 — Resume detects orphan state

**Given** a feature has `plan.md` but no `handoff.json` and no `summary.md`
**When** I run `/progress`
**Then** the agent flags this as an orphan state (likely a crash) and offers `/forensics` or `/continue --force`.

### S8 — State.md stays under size limit

**Given** any state-update operation
**When** `state.md` is rewritten
**Then** the file is ≤100 lines (it is a digest, not an archive)
**And** historical fields go to per-feature artifacts, not state.md.

## Requirements

### Functional

- **FR1** Schema for `state.md` extended with: `active_phase` (current orchestrator, or empty), `next_action` (string), `next_phases` (list, for branching transitions like `specify → ui-spec | plan`).
- **FR2** New artifact `.verified/features/<feature>/handoff.json` with versioned schema (`schema_version: 1`).
- **FR3** New artifact `.verified/features/<feature>/continue-here.md` with frontmatter + narrative body.
- **FR4** New skill `/pause` (optional reason arg) that captures handoff and ends the turn.
- **FR5** New skill `/continue` that reads handoff + state, summarises position, lists blockers, recommends next action. `--force` flag bypasses orphan detection.
- **FR6** Existing `/progress` skill detects handoff presence and routes to `/continue` UX when found.
- **FR7** Each phase skill (`specify`, `ui-spec`, `plan`, `implement`, `verify`, `review`) updates handoff incrementally on task/sub-task completion, atomically.
- **FR8** Phase completion deletes the stale handoff and updates `next_action`.
- **FR9** SessionStart hook reads handoff (if present) and injects a one-line "resuming X" status alongside state injection.
- **FR10** Statusline reads `next_action` and `active_phase`; renders "in flight" stage differently from idle "next up".

### Non-functional

- **NFR1** All file writes are atomic (temp + rename). State files must never be observed half-written by a hook on a parallel tool call.
- **NFR2** Handoff schema is versioned. A future v2 must be readable by v1 consumers (warn + best-effort) or fail with a clear error.
- **NFR3** No new daemons, no background processes. State is file-based.
- **NFR4** Backwards-compatible: an existing `state.md` without `next_action`/`active_phase` is read without error; new fields are populated lazily on next phase action.
- **NFR5** Cost: handoff writes happen inside skills the user already invoked; no extra round trips.
- **NFR6** Resume happiness path completes in a single agent turn (no clarifying questions if handoff is well-formed).

## Out of scope

- Multi-feature concurrency (one in-flight feature at a time, as today).
- Workspaces / parallel terminals.
- Cross-machine sync.
- Forensics/post-mortem tooling (separate feature).
- Retrospective extraction (separate feature).
- Adversarial plan critics (separate feature).
- Trigger-word preference capture (separate feature).
- Migrating existing in-flight features in user projects — they will continue to work with the legacy state.md schema until the next phase boundary.

## Resolved decisions

- **D1** `/pause` is a standalone skill — clearer trigger boundary than overloading `/progress`. The companion command was originally `/resume`; renamed to `/continue` in v1.3.2 to avoid collision with Claude Code's built-in `--resume`.
- **D2** `handoff.json` captures only orchestrator plan-task position. Executor agents are stateless and re-spawnable; their progress is reflected in plan-task completion plus git state.
- **D3** SessionStart auto-summarises on every start when a handoff is present. Staleness is signal, not noise — the user sees the age and decides.
- **D4** Branching from `specify` (to `ui-spec` or `plan`) is resolved by prompting the user at phase boundary. No spec.md frontmatter flag — too easy to forget. The prompt happens once, at completion of `specify`, and the choice is recorded in `state.md` `next_action`.
- **D5** Backwards compatibility is lazy. Existing `state.md` files without new fields are read without error; missing fields are populated the first time a phase skill runs after the upgrade. No migration script.

## Verification approach

This change is mostly markdown prompts + a JSON schema + JS hook updates. The verification surface:

- **Schema tests** — assert `handoff.json` writes conform to schema (use a JS validator in `tests/`).
- **Prompt-content tests** — each updated phase skill mentions handoff write/read at the right place (regex-on-SKILL.md, GSD pattern).
- **Hook smoke tests** — pipe a fake input to `context-monitor` / SessionStart hook and assert envelope output.
- **Manual end-to-end** — drive a sample feature in a target project (e.g. `keros-platform`) through specify → pause → resume → plan → pause → resume → implement, validate transitions.

No automated coverage gate applies — this is plugin-config, not application code.
