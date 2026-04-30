---
feature: "{feature-slug}"
created: "{YYYY-MM-DD}"
phase: "review"
---

# Process Retro: {feature-slug}

> Process-level reflection only. Code-level findings (gotchas, conventions,
> ADRs, dependencies) belong in `.verified/codebase/` and `.verified/decisions/`,
> not here. This file answers: "what did we learn about HOW we worked?"

## What worked

- {Workflow / gate / pattern that paid off. Empty section is fine.}

## What didn't

- {Friction. Wasted time. Misleading gate output. Empty section is fine.}

## Workflow tuning signals

- {Concrete proposals to change the workflow. e.g. "spec underestimated dep
  on X — run /map before /specify on auth code next time", or "strategic
  critic flagged 6 false-positive scope warnings — tune the rubric".
  Empty section is fine.}

## Top process learning

> Single most-important takeaway, one sentence. This line gets copied
> verbatim to `.verified/learnings.md`. Make it scannable.

{One sentence. If nothing notable: "no notable process surprises".}
