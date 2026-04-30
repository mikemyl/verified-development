---
feature: "{feature-slug}"
created: "{YYYY-MM-DD}"
critics_run: ["acceptance", "design", "ux", "strategic"]
---

# Concerns: {feature-slug}

> Plan-time audit trail. Records what each critic found, what was
> auto-resolved by /plan, what was surfaced to the user, and what was
> recorded for future reference. Preserved after /plan completes —
> evidence the gate ran.

## Critics that ran

| Critic | Status | Findings |
|---|---|---|
| acceptance | ok | {N} |
| design | ok | {N} |
| ux | skipped | n/a (no ui-spec.md) |
| strategic | error | (timed out) |

## Findings summary

- Errors:      {count} (auto-resolved by /plan)
- Warnings:    {count} (surfaced to user)
- Suggestions: {count} (recorded only)

## Auto-resolved (severity: error)

- **[{critic}]** {description}
  - Tied to: {scenario or task ID}
  - Resolution: {what /plan changed in plan.md}

## Surfaced to user (severity: warning)

- **[{critic}]** {description}
  - Tied to: {task ID}
  - Recommendation: {one-line suggested fix}
  - Disposition: {addressed | dismissed: <reason> | deferred}

## Recorded only (severity: suggestion)

- **[{critic}]** {description} — Tied to: {task ID}

## Critic errors

- **{critic}** failed: {error message or "timeout"}
