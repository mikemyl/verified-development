# Plan: Interruptible Workflow

**Spec:** [./spec.md](./spec.md)
**Status:** draft
**Created:** 2026-04-30

## Approach

The change has four layers, ordered by dependency:

1. **Schema** — define the contracts (`handoff.json` schema, `state.md` schema delta, `continue-here.md` template).
2. **Library** — a small JS helper (`hooks/lib/handoff.js`) that all skills/hooks call. Atomic writes, schema validation, lazy-upgrade reader. One source of truth for state mutations.
3. **Skills** — `/pause`, `/continue`, plus updates to existing phase skills (`specify`, `ui-spec`, `plan`, `implement`, `verify`, `review`, `progress`, `quick`).
4. **Hooks & UX** — SessionStart inject extension, statusline `next_action` rendering.

Build the library first so the skills have something to call. Skills are markdown — they instruct the LLM to invoke the library via `node ${CLAUDE_PLUGIN_ROOT}/hooks/lib/handoff.js …` rather than the LLM hand-rolling JSON each time. This keeps the prompt content slim and the file-write logic auditable.

## File map

```
hooks/
  lib/
    handoff.js          # NEW — atomic R/W, schema validation, schema versioning
    state.js            # NEW — state.md parser/serializer with lazy upgrade
  schemas/
    handoff.schema.json # NEW — JSON Schema (draft 2020-12) for handoff.json
    state.schema.json   # NEW — frontmatter+body schema for state.md (advisory)
  context-monitor.js    # EDIT — call lib/handoff.js when severity=critical to suggest /pause
  session-start.sh      # EDIT — invoke lib/handoff.js to render resume banner
  statusline.js         # EDIT — render next_action / active_phase

skills/
  pause/                # NEW
    SKILL.md
  resume/               # NEW
    SKILL.md
  progress/SKILL.md     # EDIT — detect handoff, route to /continue UX, detect orphan state
  specify/SKILL.md      # EDIT — write handoff incrementally; on completion prompt for next_phases choice
  ui-spec/SKILL.md      # EDIT — handoff incremental writes; clear on completion
  plan/SKILL.md         # EDIT — handoff incremental writes; clear on completion
  implement/SKILL.md    # EDIT — handoff updates per plan-task completion
  verify/SKILL.md       # EDIT — handoff incremental; clear on completion
  review/SKILL.md       # EDIT — handoff incremental; clear on completion
  quick/SKILL.md        # EDIT — compressed handoff (one record covering all sub-phases)

plans/interruptible-workflow/
  templates/
    handoff.example.json   # NEW — canonical example
    continue-here.template.md  # NEW — frontmatter + body skeleton

tests/                 # NEW directory — first time the plugin has tests
  handoff.schema.test.cjs
  state.upgrade.test.cjs
  prompt-anchors.test.cjs   # asserts each updated SKILL.md mentions handoff at the right anchor

.github/workflows/lint.yml  # EDIT — add `node tests/run.cjs`
```

## Schemas

### `handoff.schema.json` (draft 2020-12, abbreviated)

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "required": ["schema_version", "feature", "phase", "completed_tasks", "remaining_tasks", "git_head", "timestamp"],
  "properties": {
    "schema_version": { "const": 1 },
    "feature": { "type": "string", "minLength": 1 },
    "phase": { "enum": ["specify", "ui-spec", "plan", "implement", "verify", "review", "quick"] },
    "completed_tasks": {
      "type": "array",
      "items": { "type": "object", "required": ["id", "title"], "properties": {
        "id": { "type": "string" },
        "title": { "type": "string" },
        "completed_at": { "type": "string", "format": "date-time" }
      }}
    },
    "remaining_tasks": {
      "type": "array",
      "items": { "type": "object", "required": ["id", "title"], "properties": {
        "id": { "type": "string" },
        "title": { "type": "string" }
      }}
    },
    "blockers": {
      "type": "array",
      "items": { "type": "object", "required": ["severity", "description"], "properties": {
        "severity": { "enum": ["blocking", "advisory"] },
        "description": { "type": "string" },
        "raised_at": { "type": "string", "format": "date-time" }
      }}
    },
    "decisions_made": { "type": "array", "items": { "type": "string" } },
    "git_head": { "type": "string", "pattern": "^[0-9a-f]{7,40}$" },
    "timestamp": { "type": "string", "format": "date-time" },
    "reason": { "type": "string" }
  }
}
```

### `state.md` schema delta

Existing fields stay. New frontmatter fields:

```yaml
active_phase: ""        # populated only while a phase skill is mid-execution; empty otherwise
next_action: ""         # slash-command or free-form recommendation
next_phases: []         # array, populated when transition is ambiguous (e.g. ["ui-spec","plan"]); empty otherwise
schema_version: 2       # bumped from implicit v1
```

Lazy upgrade rule: a reader sees a state.md with no `schema_version` → treat as v1, return defaults for new fields. The next *writer* (any phase skill) bumps to v2 and persists.

## Tasks (ordered, test-first where it makes sense)

### Phase A — Foundation (build before any skill changes)

- [x] **A1** Add `tests/` directory + `tests/run.cjs` runner that walks `*.test.cjs` and reports. Wire into `.github/workflows/lint.yml`.
- [x] **A2** Write `hooks/schemas/handoff.schema.json`. (Validation enforced in `handoff.js`; AJV avoided to keep zero install footprint.)
- [x] **A3** Write `hooks/lib/handoff.js` with `read`/`write`/`update`/`clear`/`validate`. CLI shim included for skill invocation. Atomic writes via temp+rename. 14 tests passing.
- [x] **A4** Write `hooks/lib/state.js` with frontmatter parser + lazy v1→v2 upgrade. 9 tests passing.
- [x] **A5** Templates at `plans/interruptible-workflow/templates/handoff.example.json` and `continue-here.template.md`.

### Phase B — New skills

- [x] **B1** `skills/pause/SKILL.md` — standalone skill, optional reason arg, ends the turn.
- [x] **B2** `skills/continue/SKILL.md` — reads handoff/state/continue-here, refuses on `severity: blocking`, `--force` bypasses orphan detection (not blocking blockers).
- [x] **B3** `tests/prompt-anchors.test.cjs` — case-insensitive anchor assertions, 4 cases passing.

### Phase C — Existing skill updates

- [x] **C1** `progress/SKILL.md` — detects handoff.json and routes to `/continue`; detects orphan state.
- [x] **C2** `specify/SKILL.md` — handoff on entry; UI/non-UI prompt at completion records `next_action`; clears handoff.
- [x] **C3** `ui-spec/SKILL.md` — handoff on entry; clear + `next_action: /plan` on completion.
- [x] **C4** `plan/SKILL.md` — handoff on entry; clear + `next_action: /implement` on completion.
- [x] **C5** `implement/SKILL.md` — handoff per-wave updates; reads existing handoff to resume mid-implement; clear + `next_action: /verify` on completion.
- [x] **C6** `verify/SKILL.md` — handoff per stage; failed stage adds blocking blocker; clear + `next_action: /review` on full pass.
- [x] **C7** `review/SKILL.md` — handoff per review step; clear + `next_action: ""` (terminal) on completion.
- [x] **C8** `quick/SKILL.md` — compressed handoff at `.verified/quick/`; clear at end.
- [x] **C9** Lint clean (21 files, 0 violations); 32 tests passing — 4 new prompt-anchor assertions covering handoff wiring, next_action declaration, progress routing, specify UI/non-UI prompt.

### Phase D — Hooks & UX

- [x] **D1** `hooks/session-start.sh` — fixed bare-`additionalContext` envelope bug (same one we found in context-monitor); detects handoff.json and prepends a banner with N/M tasks done + paused-at timestamp + blocking-blocker count; renders next_action.
- [x] **D2** `hooks/statusline.js` — three-scene rendering: in-flight (active_phase, magenta), idle-with-next-action (`↪/cmd` dim), legacy idle. Smoke-tested both scenes via raw bytes.
- [x] **D3** `hooks/context-monitor.js` — context-aware hint: `/pause` when a feature is in flight, falls back to `/session-report` otherwise. Reads .verified/state.md from cwd.

### Phase E — Wire-up & verification

- [x] **E1** Shell-level integration test in `tests/integration.test.cjs` exercises full lifecycle: phase entry → mid-phase progress → /pause → /continue → completion. Includes a sub-test for the session-start hook output envelope. Real LLM-driven E2E in `keros-platform` is the user's call (next session).
- [x] **E2** Bumped to **1.2.0** in plugin.json + marketplace.json.
- [x] **E3** Updated CLAUDE.md with sections on the interruptible-workflow contract, hook envelope rule, test runner, description budget.

## Risk register

- **R1** Atomic write race: two skills updating handoff simultaneously. Mitigation: `lib/handoff.js` writes via `fs.renameSync` after a temp file write; the kernel guarantees atomicity on same-filesystem rename. No locks needed at our concurrency level.
- **R2** Orphaned handoff after manual file deletion / git revert. Mitigation: `/continue` validates `git_head` against current `git rev-parse HEAD`; if mismatched warns the user and offers `--force`.
- **R3** Schema drift. Mitigation: schema is checked-in JSON; tests validate fixtures; `schema_version` bump path is documented in handoff.js.
- **R4** Skills regressing each other when edited in parallel. Mitigation: `prompt-anchors.test.cjs` catches deletion of key anchors; CI runs on every PR.
- **R5** State.md size creeping over 100 lines. Mitigation: serializer in `lib/state.js` enforces a hard cap; raises an error if exceeded so the violation is visible immediately.
- **R6** AskUserQuestion path not actually available inside skills. Mitigation: confirm during C2; fall back to plain conversational question if needed.

## Verification

- `tests/run.cjs` green on CI.
- Manual smoke (E1) produces a clean resume narrative.
- `node scripts/lint-descriptions.cjs` reports zero violations.
- A target project with an old `state.md` (no `schema_version`) loads via the plugin without errors and gets upgraded on next phase action.

## Out of plan

Same as spec out-of-scope: retro, forensics, plan critics, ideation/`/explore`, trigger-words, multi-feature concurrency. Each is its own future feature.
