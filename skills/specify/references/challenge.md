# Challenge: Spec-Time Stress Test

> Loaded by `/specify` between "Gather Context" and "Propose Approaches".
> Skipped if `--no-challenge` was passed or `.verified/config.json` has
> `workflows.challenge: false`.

The user has described a feature. Before writing `spec.md`, interrogate the
problem framing. Make weak assumptions visible. Surface adjacent surface area.
Force explicit out-of-scope decisions. The output of this step is sharper
input to the spec — and an audit trail of what was considered.

## Style — non-negotiable

- **One question at a time.** Never dump a list. Wait for the user's answer,
  adapt the next question to what they said.
- **Socratic, not scripted.** The categories below are a checklist for *you*,
  not a script to read aloud. Skip categories that are already nailed down
  in the user's description.
- **Hard cap: 8 questions.** Stop when you have enough to disambiguate, or
  when the user signals "enough" / "let's just write it" / similar. Do not
  drag this out — the goal is to find the unknown unknowns, not to grill.
- **Prefer multiple-choice when possible.** "Is X most important: (a) latency,
  (b) cost, (c) developer ergonomics?" is faster than open-ended.
- **No leading questions.** Don't ask "you probably want X, right?". Ask
  "what should happen when…" and let the user answer.

## The six categories (pick what's unclear)

### 1. Ambiguity

Scan the user's description for vague terms. Make the user pick a meaning.

Examples:
- "fast" → for whom? p50 latency? p99? cold-start? compared to what baseline?
- "user" → authenticated? guest? admin? service account?
- "secure" → against which threat? RBAC? secrets? input sanitization?
- "scalable" → to what scale? horizontal vs vertical? at what cost ceiling?

If the description has no vague terms, skip this category.

### 2. Surface area

What other parts of the system does this touch? Force the user to name them.

Examples:
- "Adding rate limiting to login" — does it apply to API endpoints too? OAuth callbacks? Password reset? Account creation?
- "User notifications" — email? push? in-app? SMS? all of the above? same template language?
- "Caching layer" — read-through? write-through? invalidation strategy? per-user or global?

A concise way to ask: "This affects A, B, and C. Are all three in scope, or just A?"

### 3. Alternatives

Surface at least one alternative the user has not mentioned. Each alternative
is 1–2 sentences with the trade-off. The user picks or proposes a third.

Examples:
- For caching: "in-memory LRU vs external Redis vs CDN — the first is fastest but
  doesn't survive restarts; Redis adds infra cost but is shared; CDN only works
  for public reads."
- For auth: "session cookies vs JWT vs opaque tokens — different revocation,
  different size, different dependency story."

If the user named exactly one approach in their description, ask about
alternatives. If they explicitly said "I want approach X because Y", confirm
the rationale and skip.

### 4. Edge cases

Boundary conditions. What's the behaviour at zero? at the maximum? under load?
during failure?

Examples:
- "User has 0 of these" — empty state? error? auto-create?
- "User has 10,000" — pagination? truncation? error? lazy?
- "Two browser tabs at once" — last-write-wins? optimistic concurrency? lock?
- "Network partition" — fail open? fail closed? queue?
- "Underlying service down" — degrade to what?

Pick 2–3 edge cases that genuinely seem ambiguous. Don't ask all five.

### 5. Dependencies

What does this assume that isn't built yet? Often the user assumes a piece
of infrastructure exists when it doesn't.

Examples:
- "Send a notification" — does the notification service exist? what's its API?
  is it sync or async?
- "Authorize this action" — does the permissions model already cover this resource?
- "Store the result" — in what? schema migrations needed?

If the user already mentioned the dependencies, skip. If they didn't, ask once.

### 6. Out-of-scope discipline

Force an explicit list of what this feature does NOT include. This is
the most-skipped category and the highest-value one. Scope creep starts
when "out of scope" is implicit.

Examples:
- "Adding a notifications feature" — out of scope: notification preferences UI,
  delivery analytics, email templates customization. Right?
- "Rate limiting login" — out of scope: rate limiting other endpoints,
  alerting on rate-limit hits, IP allowlists. Right?

Always ask this category last, after the other categories have surfaced
the natural boundaries. Frame as "Anything I should explicitly mark as
out-of-scope so we don't drift into it?"

## Rubric for findings (shared with plan critics)

When the same severity language is used in the plan critics, treat it
identically. Definitions:

```
severity:
  error       — mechanical, auto-fixable: missing task for a spec scenario,
                  undeclared dependency, type mismatch between tasks.
                  /plan re-drafts to address. NOT surfaced to user.
  warning     — judgment call: smell, possible scope creep, unclear ordering,
                  ambiguous task. /plan surfaces to user with the plan.
                  Max 10 visible across all critics, ranked by severity then critic order.
  suggestion  — opinion / nice-to-have. Recorded in concerns.md, NOT shown to user.

finding schema:
  { critic, severity, description, tied_to, recommendation? }
  where tied_to is a task ID (T### from plan.md) or scenario ID (S### from spec.md).
```

This severity rubric does NOT apply to the challenge step itself —
discussion.md is narrative, not findings — but the rubric block lives here
because both gates share the contract and we want a single source of truth.

## Stop conditions

Stop the Q&A and proceed to "Propose Approaches" when ANY of these is true:

- 8 questions have been asked.
- The user said "enough", "let's just write it", "skip the questions",
  "you have enough", or similar.
- All six categories above have been covered (asked or explicitly skipped
  as already-nailed-down).
- The user has answered the same way twice ("I told you, X") — they're
  ready to move on.

## Audit trail — `discussion.md`

Write `.verified/features/{feature}/discussion.md` with the structure below.
Preserve options that were considered and rejected, not just the chosen
direction — future-you needs to know why the spec looks the way it does.

```markdown
---
feature: {feature-slug}
created: {YYYY-MM-DD}
mode: challenge
---

# Discussion: {feature-slug}

## Ambiguities surfaced

- **{vague term}** → resolved as: {chosen meaning}
  - Considered: {options that were on the table}
  - Picked because: {one-line reason}

(Empty section if no ambiguities surfaced.)

## Alternatives considered

- **Approach A (chosen)**: {one-line description}
  - Trade-off: {what we gain vs what we give up}
- **Approach B (rejected)**: {one-line description}
  - Rejected because: {one-line reason}
- **Approach C (rejected)**: {one-line description}
  - Rejected because: {one-line reason}

## Out-of-scope decisions

- {Thing 1} — explicitly NOT in this feature. Reason: {why}.
- {Thing 2} — explicitly NOT in this feature. Reason: {why}.

## Open questions deferred to plan

- {Question that came up but doesn't block the spec — flag for /plan to revisit.}

## Notes

(Optional. Anything that doesn't fit above — e.g. "user mentioned X but
it became out-of-scope after we discussed Y".)
```
