# Process Learnings

Append-only digest, one line per feature.

- 2026-06-28 **enforced-test-taxonomy** — A deterministic gate validated only by unit tests with narrow fixtures can still be systematically wrong on real input; dogfood it end-to-end before shipping.
- 2026-06-28 **test-audit** — A review correction loop that expands scope must re-review the new code; quality findings are only as current as the diff the agents saw.
- 2026-06-28 **language-agnostic-core** — A coverage claim ("every scenario has a test") is only trustworthy if the gate verifies an assertion exists — a `(test:)` label proves intent, not coverage; labels lie.
