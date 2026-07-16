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

## A working-tree fingerprint must exclude the artifact it stamps

**Symptom:** `findings-store.readFreshEnvelope` always returned `null` (stale) immediately after
`persistEnvelope` wrote the record — every fresh read looked stale, so `/review` would never inject.

**Cause:** `sourceFingerprint` hashed `git ls-files --others` (untracked files). `persistEnvelope`
writes `.verified/features/<f>/findings.json`, which is itself untracked → the act of persisting
changed the fingerprint used to validate freshness. All unit tests passed because they injected a
fake git that returned static strings and could not see the new file.

**Fix:** the fingerprint excludes `.verified/` from both `diff HEAD` and `ls-files` via the
`:(exclude).verified` pathspec — `.verified/` is workflow state, not source under review. Guard:
`tests/finding-injection.test.cjs` has a REAL-git regression test (persisting into `.verified` must
not change the fingerprint). **Lesson:** any fingerprint that stamps an artifact stored inside the
scanned tree must exclude that artifact, and a fake-seam unit test cannot catch this — use a real-git
integration test for the seam's tree interactions.
