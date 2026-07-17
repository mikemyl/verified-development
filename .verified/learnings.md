# Process Learnings

Append-only digest, one line per feature.

- 2026-06-28 **enforced-test-taxonomy** — A deterministic gate validated only by unit tests with narrow fixtures can still be systematically wrong on real input; dogfood it end-to-end before shipping.
- 2026-06-28 **test-audit** — A review correction loop that expands scope must re-review the new code; quality findings are only as current as the diff the agents saw.
- 2026-06-28 **language-agnostic-core** — A coverage claim ("every scenario has a test") is only trustworthy if the gate verifies an assertion exists — a `(test:)` label proves intent, not coverage; labels lie.
- 2026-07-12 **structured-finding-layer** — A feature that modifies the plugin's own agents/skills cannot be fully validated by the same session's /review; agent/prompt changes need a plugin-update + fresh-session re-review.
- 2026-07-16 **finding-injection** — An injectable-seam unit test proves branch logic but is structurally blind to the real tool's behavior; every external-tool seam needs a real-tool integration test per tree interaction, or a fake-green suite hides a real bug. _(status: unvalidated)_
- 2026-07-17 **test-weakening-detection** — For the third feature running, a shared or external-tool seam with only trivial/transitive coverage hid a real bug — make "a direct, non-trivial test per external-tool/shared seam" a plan-time rule, not a review-time rediscovery. _(status: unvalidated)_
