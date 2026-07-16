# Process Retro — finding-injection

## What worked
- **Three different adversarial gates each caught a distinct real defect** — none visible in unit
  tests: the plan-critic (commit-SHA freshness key wrong for a pre-commit review flow), in-vivo
  dogfooding (persist self-invalidates its own fingerprint), and the security review (the suppression
  *keys* carried tool-derived prose, not just `message`). The feature would have shipped broken twice
  over on green unit tests alone.
- Keys-only injection as a design choice *dissolved* the security constraint instead of mitigating
  it — the cleanest kind of security fix. (Though the review then found the keys weren't as clean as
  assumed — see below.)
- The injectable git seam kept the store unit-testable, and pairing it with ONE real-git integration
  test per tree-interaction turned out to be the right balance (the review pushed for the second one).

## What didn't
- **Fake seams gave false confidence, again.** The dogfood bug and both test-review warnings are the
  same class: a fake git runner returning static strings cannot reveal how a real `:(exclude)`
  pathspec behaves. Unit-green meant nothing for the seam's real interactions.
- **`correctness-review` still could not spawn** — the session agent registry is frozen at session
  start (~v1.11.0), independent of the installed plugin version. Applied manually.

## Workflow tuning signals
- Consider a convention: when a `hooks/lib` module has an injectable external-tool seam (git, a
  linter), require at least one **real-tool integration test** for each way the seam touches the tree
  — the fake-only tests are necessary but structurally blind to the real tool's behavior. This is now
  twice (findings-store, and the earlier golangci-lint fixture) that a fake-only seam hid or nearly
  hid a real bug.
- The session-frozen agent registry means a feature that *adds* an agent can never dispatch it in the
  same session even after a plugin update — worth surfacing in `/review` when a to-be-reviewed agent
  isn't in the live registry (currently discovered only by a failed spawn).

## Top process learning
An injectable-seam unit test proves the branch logic but is structurally blind to the real tool's
behavior — every external-tool seam needs at least one real-tool integration test per tree interaction, or a fake-green suite will hide a real bug.
