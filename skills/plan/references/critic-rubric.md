# Plan-critic rubric (single source)

The three plan critics (`plan-critic-acceptance`, `plan-critic-design`, `plan-critic-strategic`)
share one severity rubric and one finding schema. The block below is copied verbatim into each
critic file; `tests/review-v2.test.cjs` fails if a copy drifts.

```
severity:
  error       — mechanical, auto-fixable: an acceptance scenario with no task or no
                  test, an undeclared dependency, a type mismatch between tasks.
                  /plan re-drafts the plan to address it. NOT shown to the user.
  warning     — judgment call: a smell, possible scope creep, unclear ordering,
                  an ambiguous task. /plan shows it under the plan.
                  Max 10 visible across all critics, ranked by severity then critic order.
  suggestion  — opinion / nice-to-have. Dropped. Not shown, not recorded.

finding schema:
  { critic, severity, description, tied_to, recommendation? }
  where tied_to is a task id (T### in the plan) or an acceptance scenario
  (its test name, as the plan lists it).
```

Rules every critic follows:

- The plan is in your prompt. There is no `spec.md`: the contract is the plan's **Acceptance
  scenarios** section plus the user's request, both pasted by `/plan`.
- The repo is readable. Use it to check claims (does the file exist, does the convention hold).
- You read, you find, you return. You do not fix, and you do not write files.
- At most 10 findings. Pick the most consequential. `[]` is a valid answer; do not pad.
