# Process Retro: language-agnostic-core

## What worked
- **The deterministic test out-found the plan author.** T001's repo-wide `tdd` scan found a 7th dangling reference in `skills/quick/SKILL.md` that the hand-enumerated plan (and I) missed. The gate caught the gap a careful read didn't — exactly the point of a model-free scan.
- **Plan critics paid for themselves pre-implement.** The acceptance + design critics caught that AS-004 and AS-005 had *no real test* — T006/T007 were impl tasks mislabeled `(test: prompt-anchor)`, and the plan falsely claimed "all 8 scenarios served." Fixed before a single executor ran.
- **Grouping the 3 inference-ladder files into one executor** (vs. fanning out) guaranteed identical phrasing — the coupling the parallelization critic flagged never materialized.

## What didn't
- **The first plan draft's coverage claim was false.** "All 8 acceptance scenarios are served" was asserted in the Test Boundaries table while two scenarios had no assertion. The test-gate passed it because a task's `(test:)` label is taken at face value — the gate never checks an assertion actually exists.
- **The line-based trailer parser cost a re-gate cycle.** Writing T001 as a multi-line task silently dropped its trailers (see CONCERNS.md). No warning — just a confusing MISSING_TEST_TYPE on a task that looked annotated.

## Workflow tuning signals
- **test-gate trusts the `(test:)` label without proof of a test.** A task can declare `prompt-anchor` and ship zero assertions; the gate reports the scenario "served." Consider having the gate (or a critic) cross-check that a referenced test file actually asserts against the task's scenario. Today only the adversarial critics catch this.
- **waves.js should warn on orphaned trailers.** When a continuation line contains `(test: …)`/`(scenario: …)` but the `- [ ]` line doesn't, emit a warning rather than silently parsing `null`. Cheap lint, would have saved a cycle.

## Top process learning
A coverage claim ("every scenario has a test") is only trustworthy if the gate verifies an assertion exists — a `(test:)` label proves intent, not coverage; labels lie.
