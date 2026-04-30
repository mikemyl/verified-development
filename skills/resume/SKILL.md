---
name: resume
description: "Resume a paused feature: read handoff.json + continue-here.md, brief the user, route to next action."
argument-hint: "[--force]"
version: 0.1.0
---

You MUST use this when the user types `/resume`, asks to "resume", "continue where we left off", "pick up where we stopped", or when SessionStart detects a fresh handoff.json. Read state, brief the user in ONE message, then route to the next action.

## Process

### 1. Read state.md

Read `.verified/state.md` for `feature` and `phase`. If no feature is set, tell the user there is nothing to resume — they should run `/progress` for current status or `/specify` to start something new — and stop.

### 2. Look for handoff.json

```
node ${CLAUDE_PLUGIN_ROOT}/hooks/lib/handoff.js read .verified/features/<feature>
```

#### If a handoff exists (happy path)

Parse it. Validate via the helper (`validate` command on stdin) — if validation fails the file is corrupt; offer to delete it and run `/progress` to rebuild.

#### If no handoff exists

This is one of three cases:
- **Orphan state**: plan.md exists, summary.md does not, no handoff. Likely a crash or unrecorded stop. Tell the user; offer `/resume --force` (proceed without handoff context) or future `/forensics`. Stop unless `--force` was passed.
- **Phase boundary**: state.md `next_action` is set (`/plan`, `/implement`, etc.) and no in-flight artifacts exist. This is a clean handoff between phases — just report the next action and prompt the user to invoke it. Do not invoke it yourself.
- **Nothing in flight**: `feature: none`. Same as no-feature case above.

### 3. Validate git_head

Run `git rev-parse --short HEAD`. Compare with `git_head` in handoff.

If they differ, the working tree has moved since the pause. Warn the user, list what changed (`git log --oneline <handoff-head>..HEAD`), and offer: "(a) resume anyway, (b) rewind to handoff sha, (c) `/resume --force`". Do not pick for them. Stop unless they answer.

### 4. Refuse if blocking blockers exist

If `blockers` contains any with `severity: blocking`, list them. Do NOT proceed past the brief. The resuming agent must show it understood by either:
- explaining how each blocker has now been resolved, or
- asking the user how to address it.

`--force` does NOT override blocking blockers — they are intentional safety gates.

### 5. Read continue-here.md

Read `.verified/features/<feature>/continue-here.md`. Treat it as the narrative companion to the JSON. If they disagree, trust the JSON.

### 6. Brief the user (one message)

Format:

```
Resuming `<feature>` (`<phase>`).
Completed N/M tasks: <list of completed task IDs>.
Next: <single concrete next action — task title or slash command>.
Blockers: <list, or "none">.

Decisions made mid-phase:
- <decision 1>
- <decision 2>
(or "none")

<one-line summary of "what I just did" from continue-here.md>
```

Keep it tight — 6–10 lines. The user wants situational awareness in one glance.

### 7. Recommend the next action

Tell the user the next concrete command to run (`/implement` to continue, or the specific task if mid-`/implement`). Do NOT auto-invoke it. The user should approve before resuming work — they may have stopped for a reason that's still relevant.

### 8. Update state.md

Set `active_phase` to the current phase (we're now in flight again). Update `last_activity` to today. Leave `next_action` as-is until the user actually proceeds.

## Important

- One brief, one recommendation, then stop. Do not auto-resume. Treat the user as the decision-maker.
- `--force` skips orphan-state detection and git_head mismatch warning, but NEVER skips `severity: blocking` blockers.
- If handoff and continue-here disagree, trust the JSON and note the discrepancy in the brief.
- This skill is read-mostly. The only writes are the state.md `active_phase` + `last_activity` update at the end. Do NOT clear the handoff — that happens when the phase completes.
