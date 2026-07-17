# Process Retro — test-weakening-detection

## What worked
- **The spec-time challenge pivoted the whole feature** — from a global PreToolUse refactor-freeze
  hook (self-referential, highest blast radius) to a post-hoc detector (no hook, no state machine).
  That's the challenge gate doing its most valuable job: killing the wrong design before any code.
- **The plan-critic + review gates each caught real defects** unit-green work hid: the plan-critic
  reconciled a spec/plan signature drift and pushed the shared-loader extraction; the review found a
  latent `globToRegExp` `**/` bug (present in the "canonical" `test-corpus.js` copy) once the seam
  was shared and directly tested.
- Reusing `countAssertions` from the existing lang adapters meant the detector was mostly composition.

## What didn't
- **Fake/trivial coverage hid a real bug for the third time this arc.** The single real-git test used
  a flat `foo_test.go` and a trivial glob, so `globToRegExp`'s `**/`-requires-a-dir bug slipped
  through until the review demanded direct `globToRegExp` + delete-through-`scan` + repo-taxonomy
  tests. Same class as finding-injection's fingerprint and the golangci fixture.
- **`correctness-review` still can't spawn** — the session agent registry is frozen at session start,
  independent of the installed plugin version. Applied manually.

## Workflow tuning signals
- This is now the THIRD feature where a fake-seam / trivial-shared-seam test hid a real bug the
  review had to dig out (finding-injection fingerprint, golangci SARIF fixture, this `globToRegExp`).
  Strong signal to make it a rule: **any `hooks/lib` seam that shells out to an external tool OR is
  shared across modules gets a direct, non-trivial test** — bake it into the plan template's
  test-task guidance so the review doesn't have to keep finding it.
- The frozen session-registry limitation for newly-added agents is worth surfacing proactively in
  `/review` (name the agents that can't spawn), rather than discovering it via a failed dispatch.

## Top process learning
For the third feature running, a shared or external-tool seam with only trivial/transitive test
coverage hid a real bug — make "a direct, non-trivial test per external-tool/shared seam" a plan-time rule, not a review-time rediscovery.
