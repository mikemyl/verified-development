---
name: pause
description: "Capture mid-phase progress to handoff.json + continue-here.md so the next session can resume."
argument-hint: "[reason]"
version: 0.1.0
---

You MUST use this when the user types `/pause`, asks to "pause", "save progress", "stop here", "wrap up for now", or when context-monitor flags a critical context window mid-phase. Capture state, end the turn, do NOT continue work.

## Process

### 1. Read state.md

Read `.verified/state.md` via `node ${CLAUDE_PLUGIN_ROOT}/hooks/lib/state.js` (or by hand — frontmatter parsing is straightforward). Get `feature` and `phase`. If no `feature` is set or phase is empty, tell the user there's nothing in flight to pause and stop.

### 2. Inventory plan-task progress

Read `.verified/features/<feature>/plan.md` if it exists. Parse markdown checkboxes:
- `[x]` or `[X]` → completed task
- `[ ]` → remaining task
- `[~]` → in-progress (treat as remaining)

Each task should have a stable identifier — typically the bold prefix (`**A1**`, `**T3**`, etc.) or the leading list-item position. Use whatever the plan uses.

If there is no plan.md (e.g. mid-`specify` or mid-`ui-spec`), use the phase's expected sub-task list:
- **specify**: `["draft-problem", "draft-scenarios", "draft-requirements", "review-with-user"]`
- **ui-spec**: `["brand", "design-system", "screens", "competitive-research"]`
- **plan**: `["task-decomposition", "ordering", "test-first-sequencing"]`
- **verify**: `["lint", "test", "coverage", "mutation", "security", "dead-code", "build"]`
- **review**: `["spec-compliance", "quality-agents", "fix-loop"]`

Mark each as completed/remaining based on what artifacts exist and what the user has actually done so far.

### 3. Capture decisions and blockers

From the recent conversation, identify:
- **Decisions made mid-phase** that are NOT yet captured in spec.md/plan.md/code (e.g. "decided to skip mutation testing for this feature"). One line each.
- **Blockers** — anything preventing the next task. For each: `severity: blocking` (must be addressed before resuming) or `severity: advisory` (FYI for the resuming agent).

Be honest — if there are no blockers, say so. Do not invent them.

### 4. Get git HEAD

```
git rev-parse --short HEAD
```

### 5. Write handoff.json

Build the JSON payload (see `plans/interruptible-workflow/templates/handoff.example.json` for the canonical shape, and `hooks/schemas/handoff.schema.json` for the contract). Required fields: `schema_version: 1`, `feature`, `phase`, `completed_tasks`, `remaining_tasks`, `git_head`, `timestamp` (ISO 8601, UTC).

Write via the helper:

```
echo '<json-payload>' | node ${CLAUDE_PLUGIN_ROOT}/hooks/lib/handoff.js write .verified/features/<feature>
```

The helper validates the payload and writes atomically. If validation fails, fix the JSON; do NOT bypass.

### 6. Write continue-here.md

Use `plans/interruptible-workflow/templates/continue-here.template.md` as the skeleton. Fill in:
- Frontmatter: `feature`, `phase`, `timestamp`, `blockers_present`, `git_head`.
- "What I just did": 1–3 bullets, reference task IDs.
- "What's next": single concrete next action, must match `next_action` or first `remaining_tasks` entry.
- "Decisions made": from step 3.
- "Blockers": from step 3 (restate severity + description in human-readable form).
- "Notes for the resuming agent": any context not in the JSON.

Write to `.verified/features/<feature>/continue-here.md`.

### 7. Update state.md

Set `active_phase: ""` (no longer in flight). Set `next_action: "/resume"`. Update `last_activity` to today.

### 8. End the turn

Tell the user one paragraph: "Paused `<feature>` at `<phase>`. N/M tasks done. <count> blockers. Resume with `/resume`." Then stop. Do NOT start any new work. Do NOT run any tools beyond what was needed for steps 1–7.

## Important

- This skill ENDS THE TURN. The whole point is to make stopping safe — do not chain into another action.
- If the user provides an optional `[reason]` arg, include it as `reason` in the JSON.
- If the project has no `.verified/` dir at all, tell the user this is not a verified-development project and stop.
- Atomic writes are guaranteed by the helper — do NOT hand-roll file writes that bypass it.
- If `/pause` is invoked with no in-flight feature, do nothing destructive: just report status and stop.
