---
feature: "{feature-slug}"
phase: "{specify|ui-spec|plan|implement|verify|review|quick}"
timestamp: "{ISO 8601}"
blockers_present: {true|false}
git_head: "{short-sha}"
---

# Resuming `{feature-slug}` ({phase})

> Companion to `handoff.json`. The JSON file is the contract; this file is
> the narrative. If they disagree, trust the JSON.

## What I just did

{1–3 short bullets describing the last completed work in this phase. Reference
plan task IDs when applicable, e.g. "Completed A1, A2; left A3 mid-write."}

## What's next

{The single next concrete action. Should match `next_action` in state.md or
the first remaining_tasks entry in handoff.json.}

## Decisions made (mid-phase)

{Anything decided during this phase that isn't yet captured in spec/plan/code.
Empty if none. Each entry one line.}

## Blockers

{For each blocker in handoff.json, restate severity + description here in
human-readable form. If `severity: blocking` is present, the resuming agent
must address it before proceeding. Empty section if no blockers.}

## Notes for the resuming agent

{Optional. Any context that doesn't fit above — e.g. "tests are failing on
purpose; that was the RED step", "user paused to investigate Y, see thread
.verified/threads/Y.md".}
