---
name: map
description: "Write .verified/codebase/TESTING.md: the repo's test types, boundaries, primitives, examples."
version: 2.0.0
---

Produce the one context document the plugin reads: `.verified/codebase/TESTING.md`, whose
`## Test Types` section is the rubric `test-review` judges tests against and the menu `/plan` picks
scenario types from.

v1 wrote seven codebase docs and appended to two of them after every feature. On a real project
that grew to 580 KB, with a 230 KB gotchas log read 53 times in six sessions. None of it was a
rubric; all of it was context. v2 writes the rubric and nothing else.

## 1. Prerequisites

- The project has source code and tests.
- `.verified/` exists; create it if not, with a minimal `config.json`:

```json
{ "verify": "<the repo's verify command>", "workflows": { "plan_critics": true }, "hooks": { "git_guard": true } }
```

- If `TESTING.md` exists, ask: update the `## Test Types` section, or regenerate the file?

## 2. Write `TESTING.md`

Keep the whole file under ~15 KB. Agents read the `## Test Types` section only (via
`taxonomy.js extract`); the two short sections above it are for humans.

```markdown
# Testing

*Last updated: {YYYY-MM-DD}*

## Test Infrastructure
- **Framework / runner / command:** {≤ 5 lines}

## Test Organization
- {where tests live, naming, the DSL or fixture package} {≤ 5 lines}

## Test Types
{one `### <type>` per discovered test type — see below}
```

### `## Test Types`

Seed it from `${CLAUDE_PLUGIN_ROOT}/hooks/lib/test-types-seed.md`, then ADAPT each entry to the
types this repo actually has — rename, drop, add — so the taxonomy describes THIS codebase.

Draw the `acceptance` / `core` line by the harness, not by the DSL verbs: both use Sends/Receives
and often share fixtures. A test that drives the whole system through its public interfaces with
real infrastructure is `acceptance`. A test that drives ONE component at every edge through stub
actors (an upstream stub sends and receives, a downstream stub receives and sends), in process, on
a controlled clock, is `core` — even when the repo names it something else. Keep the repo's own
name for the type and say which seed type it maps to.
Keep the field syntax parse-compatible with `taxonomy.js`. For each type emit `### <type>` and:

- `- **boundary:** {what the test drives through}`
- `- **pattern:** {how tests of this type are written}`
- `- **location:** {where they live}`
- `- **tier:** default|exception|sign-off`
- `- **when-to-use:** {when this type is the right choice}`
- `- **primitives:** {drivers AND observations — the `Then`/assertion vocabulary, not just `Sends`}`
- `- **match-paths:** {globs that classify a file as this type}`
- `- **match-markers:** {identifier tokens that signal the type}`
- `- **good-example:** {a REAL test, `path::TestName`, showing read-back-through-the-boundary}`
- `- **bad-example:** {a real anti-pattern test, or n/a}`
- `- **anti-patterns:** {mechanical, no-judgment smells, comma-separated}`
- a fenced ```mermaid flowchart: actor → boundary → system-under-test → stubbed externals.

**`anti-patterns:` is a gate.** `test-review` raises a violation of a declared anti-pattern as an
`error` that blocks review — the repo made the call, the reviewer matches a declaration. So:

- list only mechanical smells ("reads state back through the repository instead of the seam"),
  never taste ("poorly named");
- the field is comma-split: no comma inside an entry (a parenthesized list "(CMS, Stripe)" becomes
  two bogus gates — write "CMS / Stripe");
- keep the seed's boundary entries, adapted per type: reading state back *below* the type's own
  boundary, seeding below it when the system's API can drive it, post-construction fixture
  mutation. Drop them only for a type with no boundary (`none`);
- `good-example:` must be a real test that shows the golden path — a reviewer and a test author
  open it before judging or writing a test of that type;
- record genuinely un-exposable state (an audit table, an append-only invariant) as ONE named
  harness observation in prose, not as scattered store access.

Oracle provenance is the repo's call: `test-review` criterion 9 is non-blocking by default — it warns
on circular oracles (snapshots, golden files); add `circular oracles` to a type's `anti-patterns:`
only when the repo's existing tests already meet that bar.

For the craft rubric (what makes a good test of each type) REFERENCE the `testing` skill; do not
restate it. For UI types, make `pattern`/`primitives`/`good-example` concrete about the page-object
fixture and interact/observe verbs (see `front-end-testing` → `## Actor-BDD for UI`).

Tiers: `default` (the expected choice), `exception` (sanctioned without approval, e.g. `dao`
against a real datastore), `sign-off` (`unit`/`none` — the plan says why, the user agrees).

## 3. Offer the project rules

If the repo's `CLAUDE.md` does not already carry them, offer to append
`${CLAUDE_PLUGIN_ROOT}/templates/project-rules.md` (review required, real exit codes, the
test-must-fail rule, no work-discarding git commands). They are what makes `/review` fire without
being asked.

## 4. Summary

```
Mapped: .verified/codebase/TESTING.md — {N} test types, {N} with a good-example
Config: .verified/config.json — verify: {cmd}
Rules:  {appended to CLAUDE.md | already present | declined}
```

## Important

- Document what EXISTS. Do not invent a type the repo has no tests for.
- No gotchas log, no concerns log, no architecture doc. A lesson worth keeping becomes a test or a
  guard; a lesson that stays prose is read by nobody and loaded by everybody.
