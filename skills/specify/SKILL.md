---
name: specify
description: "Required before feature work in .verified/ projects. Produces acceptance scenarios + requirements."
version: 0.1.0
---

Create a specification for a new feature. This is Phase 1 of the verified development workflow.

## Process

### 1. Parse Arguments

- First argument: feature name (kebab-case, e.g., `user-authentication`)
- Remaining text: optional brief description of the feature
- `--no-challenge` flag: skip the spec-time stress test (default is on)
- If no arguments provided, ask the user what feature they want to specify

### 2. Load Project Context

Read `.verified/state.md` if it exists:
- If a feature is currently in-progress in a later phase (implement, verify, review), warn the user they're starting a new feature while another is incomplete
- This is a warning, not a block — the user may intentionally work on multiple features

Read `.verified/codebase/` docs if they exist — these inform specification:
- `ARCHITECTURE.md` — understand what already exists to avoid re-specifying
- `INTEGRATIONS.md` — know current external services and boundaries
- `CONVENTIONS.md` — use consistent domain language in scenarios
- `CONCERNS.md` — be aware of risks when specifying new features

### 3. Create Feature Directory

```bash
mkdir -p .verified/features/{feature-name}
```

### 3a. Open Handoff

This phase is interruptible. Write an initial handoff:

```bash
echo '{
  "schema_version": 1,
  "feature": "{feature-name}",
  "phase": "specify",
  "completed_tasks": [],
  "remaining_tasks": [
    {"id": "S1", "title": "gather-context"},
    {"id": "S2", "title": "propose-approaches"},
    {"id": "S3", "title": "write-spec"},
    {"id": "S4", "title": "self-review"},
    {"id": "S5", "title": "present-and-confirm"}
  ],
  "git_head": "<short-sha>",
  "timestamp": "<ISO-8601>"
}' | node ${CLAUDE_PLUGIN_ROOT}/hooks/lib/handoff.js write .verified/features/{feature-name}
```

After each numbered step below completes, call `update` with new `completed_tasks`/`remaining_tasks`. Wire format and helper details: see `skills/pause/SKILL.md`. If the user runs `/pause`, defer to that skill.

### 4. Gather Context

If the user provided a description, use it as starting context. Then ask targeted questions to fill gaps.

**HARD GATE: Do NOT write the spec until you understand the feature well enough to propose approaches. No shortcuts for "simple" features — simple features are where unexamined assumptions cause the most wasted work.**

**One question at a time.** Do not dump a list of questions. Ask one, wait for the answer, adapt your next question based on what the user said. Prefer multiple-choice when possible.

Focus areas (adapt order based on what's most unclear):

1. **Who uses this?** (user role, system, scheduled job)
2. **What triggers it?** (user action, API call, event, timer)
3. **What's the happy path?** (main success scenario)
4. **What can go wrong?** (error cases, edge cases, invalid input)
5. **What are the boundaries?** (limits, thresholds, constraints)
6. **How do you know it works?** (observable outcomes, measurable criteria)

Stop when you have enough to propose approaches.

### 4a. Challenge — Spec-Time Stress Test (default on)

Before proposing approaches, interrogate the problem framing. This is non-skippable unless the user opted out via `--no-challenge` or `.verified/config.json` has `"workflows": { "challenge": false }`. Check both before proceeding.

**If opted out**: skip this step entirely (do not write `discussion.md`); jump to step 5.

**If on**: load `skills/specify/references/challenge.md` for the question framework, the Socratic-mode rules, the stop conditions, and the `discussion.md` template. Walk the six categories selectively (skip ones already nailed down in the user's description). One question at a time, max 8 questions, stop early when the user signals enough.

When the Q&A is done, write `.verified/features/{feature-name}/discussion.md` per the template in challenge.md. Preserve options that were considered and rejected, not just the chosen direction. The discussion.md is the audit trail — future-you reads it to understand why the spec looks the way it does.

### 5. Propose Approaches

Before writing the spec, present 2-3 approaches with trade-offs:
- Lead with your recommended option and explain why
- Each approach should be 2-4 sentences covering: what it does, key trade-off, when you'd choose it
- Get user approval on the approach before writing

```
Approach A (recommended): {description}
  Trade-off: {what you gain vs what you give up}

Approach B: {description}
  Trade-off: {what you gain vs what you give up}

Which approach, or something different?
```

### 6. Write Specification

Load the specification skill for guidance on format and quality.

Write `.verified/features/{feature-name}/spec.md` following the template:

```markdown
# Feature: {Feature Name}

## Context
{Why this feature exists and who benefits}

## Acceptance Scenarios
{Given/When/Then for each scenario}

## Requirements
{FR-001, FR-002, ... — numbered, testable}

## Edge Cases
{EC-001, EC-002, ... — boundary conditions}

## Success Criteria
{SC-001, SC-002, ... — measurable outcomes}
```

Always include these standard success criteria:
- Every acceptance scenario has a corresponding test
- Mutation score >= 60% on feature package
- All verification gates pass (the project's verify command)

### 7. Spec Self-Review

Before presenting to the user, review the spec with fresh eyes:

1. **Placeholder scan** — search for "TBD", "TODO", "later", incomplete sections, vague requirements. Fix them.
2. **Internal consistency** — do any sections contradict each other? Does the architecture implied by requirements match the edge cases?
3. **Ambiguity check** — could any requirement be interpreted two different ways? If so, pick one and make it explicit.
4. **Scope check** — is this focused enough for a single implementation plan? If it covers multiple independent subsystems, suggest decomposing.
5. **Completeness checklist:**
   - Every scenario is independent
   - No implementation details
   - Every requirement is testable
   - Edge cases cover boundaries (zero, empty, negative, maximum)
   - Success criteria are measurable
   - Maximum 3 [NEEDS CLARIFICATION] markers

Fix any issues inline before presenting. Don't ask the user to fix what you can fix yourself.

### 8. Present and Confirm

Show the complete spec to the user. Ask:
- "Does this capture what you want to build?"
- "Any scenarios missing?"
- "Any requirements I got wrong?"

Iterate based on feedback until the user approves.

### 9. Choose Next Phase (UI or not)

After the user approves the spec, ask **one question**: does this feature have a user-facing UI?

- "yes / has UI / web / mobile" → `next_action: /ui-spec`, add `next_phases: ["ui-spec"]`
- "no / API / backend / lib" → `next_action: /plan`, add `next_phases: ["plan"]`

Use `AskUserQuestion` if available; otherwise ask conversationally. Record the choice in state.md. The branch is recorded ONCE, here — not on every read.

### 10. Close Handoff and Update State

Clear the handoff (the phase is done):

```bash
node ${CLAUDE_PLUGIN_ROOT}/hooks/lib/handoff.js clear .verified/features/{feature-name}
```

Update `.verified/state.md`. Only set `complete` AFTER the user explicitly approves the spec AND has answered the UI/non-UI question:

```yaml
---
feature: {feature-name}
phase: specify
status: complete
last_activity: {YYYY-MM-DD} - Specification approved
active_phase: ""
next_action: "/ui-spec"   # or "/plan"
next_phases: ["ui-spec"]  # or ["plan"]
schema_version: 2
---
```

While still iterating, use `status: in-progress` and leave the handoff in place.

### 11. Bootstrap Config

If `.verified/config.json` doesn't exist, create it with defaults:

```json
{
  "language": "{detected or asked}",
  "thresholds": {
    "coverage": 80,
    "mutation": 60,
    "cyclomatic_complexity": 10,
    "cognitive_complexity": 15
  },
  "workflows": {
    "require_spec": true,
    "require_review": true,
    "require_verify": true
  }
}
```

### 12. Suggest Next Step

The next action was decided in step 9. Echo it back, mention discussion.md if it was written:

```
Specification complete: .verified/features/{feature-name}/spec.md
{discussion.md was created with the audit trail of options considered.}

Next: {next_action from step 9}
```

## Important

- Never include implementation details in the spec (no database names, no API frameworks, no specific libraries)
- If the user describes implementation ("use Redis for caching"), translate to requirement ("cache with max 5 min staleness")
- Edge cases are critical — they become the boundary tests that kill mutants
- The spec is the source of truth for the spec-compliance review agent in Phase 5
