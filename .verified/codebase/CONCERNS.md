# Concerns & Gotchas

Non-obvious behavior any contributor should know. Grep before debugging.

## Plan task-trailer parsing is single-line only

`hooks/lib/waves.js` (and therefore `test-gate.js`, which consumes its parse) reads the
`(files: …)`, `(depends on …)`, `(test: …)`, and `(scenario: …)` trailers **only from the
`- [ ] T### …` line itself** (`parseTasks` matches `TASK_RE` per line, then runs the trailer
regexes against that one line's `rest`). If a plan task is authored across multiple markdown
lines (e.g. a `- [ ] T001 …:` intro followed by sub-bullets, with the trailers on a trailing
continuation line), the trailers are **silently dropped** — `test_type` comes back `null` and
`scenarios` `[]`, and the gate then fires `MISSING_TEST_TYPE` / `UNSERVED_SCENARIO` for a task
that looks correctly annotated to a human reader.

**Symptom:** a task with visible `(test: …) (scenario: …)` trailers still trips the gate.
**Fix:** keep all four trailers on the single `- [ ]` task line. Detail/assertion lists can
follow as sub-bullets (the parser ignores them). Hit during the language-agnostic-core plan
(T001 written multiline → gate reported MISSING_TEST_TYPE until the trailers were moved up).
