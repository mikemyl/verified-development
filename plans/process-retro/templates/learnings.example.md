# Process Learnings

> Append-only digest of top process learnings, one line per feature.
> Maintained automatically by `/review` step 8c.
> Scan / grep this file to spot patterns across features.
> Each line ends with a `status`: `unvalidated` (new, not yet measured), `validated`, or `harmful`.

- 2026-04-12 **user-auth** — Spec missed token-revocation edge case; add explicit "session lifecycle" question to challenge categories. _(status: validated)_
- 2026-04-19 **billing-export** — Plan critics flagged 4 warnings, all real; saved a re-plan cycle. _(status: validated)_
- 2026-04-25 **search-v2** — Coverage gate exposed an untested error path the plan didn't anticipate; spec edge-case list was incomplete. _(status: unvalidated)_
- 2026-04-29 **interruptible-workflow** — No notable process surprises. _(status: unvalidated)_
- 2026-04-30 **adversarial-critique** — Severity rubric reuse-by-quote across 5 files needs a drift-detection test (added). _(status: validated)_
