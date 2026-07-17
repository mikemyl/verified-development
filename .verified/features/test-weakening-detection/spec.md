# Feature: test-weakening-detection

## Context

Roadmap #6, reshaped from a refactor-freeze hook to a detector (see `discussion.md`). The failure it
targets: during a refactor or change, a failing test gets "fixed" by **weakening it** — deleting or
loosening assertions — instead of reverting the code, silently defeating the safety net. The
original plan (a PreToolUse hook blocking test edits during a self-reported REFACTOR sub-phase) had
global blast radius and depended on the guarded executor's honesty. This replaces it with a
**post-hoc deterministic detector**: flag a test file that **lost assertions** in a change, and let
`test-review` judge whether that drop was a legitimate test update or a regression-hiding weakening.

The signal is a script's job (reusing the `hooks/lib/lang/*` adapters that already count assertions);
the verdict is a judgment, so it is a **non-blocking** `test-review` warning — consistent with the
locked non-blocking framing of the other test-quality signals (Farley, oracle-provenance, etc.).

Beneficiary: `/review` — a mechanical "this test lost N assertions in this change" flag the reviewer
would otherwise have to spot by eye, at zero risk (never blocks, never a false alarm on added tests).

## Acceptance Scenarios

### AS-1 — A test that lost assertions is flagged
Given a test file that had 5 assertions at the base ref and has 3 in the change,
When `test-weakening.js` analyzes the change,
Then the file is flagged with `before: 5`, `after: 3`, `delta: -2`.

### AS-2 — A test with equal or more assertions is not flagged
Given a test file whose assertion count is unchanged or higher in the change,
When analyzed,
Then it is not flagged.

### AS-3 — A newly added test is not flagged
Given a test file that does not exist at the base ref (new in the change),
When analyzed,
Then it is not flagged (adding tests is not weakening).

### AS-4 — A deleted test is flagged as a removal
Given a test file that existed at the base ref (with assertions) and is deleted in the change,
When analyzed,
Then it is flagged with `after: 0` and a `removed: true` marker.

### AS-5 — Non-test files are ignored
Given the change also modifies production (non-test) files,
When analyzed,
Then only files classified as tests are considered; production files are never flagged.

### AS-6 — An unsupported-language test is reported, not flagged
Given a changed test file in a language with no `hooks/lib/lang` adapter,
When analyzed,
Then it appears in `not_analyzed` (the parser cannot count its assertions), never in `flagged` —
no false alarm from an uncountable file.

### AS-7 — The signal is non-blocking in review
Given `test-weakening` flags a file,
When `/review` runs,
Then `test-review` surfaces it as a `warning` (judgment: legitimate update vs. weakening) and it
NEVER changes the PASS/WARN/FAIL outcome on its own.

## Requirements

- **FR-001** `hooks/lib/test-weakening.js` exposes a PURE `analyze(entries) → contract`, where each
  `entry = {file, before, after}` carries the test file's base and changed content (a string, or
  `null` when the file was absent at that side). It computes each file's assertion-count delta via
  the `hooks/lib/lang/*` adapters' `countAssertions`. All git/fs IO lives in the `scan` CLI
  (FR-006), not in `analyze` — so the core needs no seam and is trivially unit-testable.
- **FR-002** A file is **flagged** when its assertion count net-decreased from base to change,
  including a delete (base > 0, after 0 → `removed: true`).
- **FR-003** A file with an equal/higher count, or absent at the base ref (new), is not flagged.
- **FR-004** Only files classified as test files are analyzed — via the same taxonomy match-paths /
  lang-adapter classification `/test-audit` uses; non-test files are never flagged.
- **FR-005** A changed test file whose language has no adapter is placed in `not_analyzed` with a
  reason, never in `flagged`.
- **FR-006** The delta computation (`analyze`) is model-free and unit-testable with no seam (pure
  over resolved contents). The `scan(baseRef, cwd)` CLI (`test-weakening.js scan <base-ref>`) owns
  all IO: it discovers changed files via git, classifies test files, resolves `before` (`git show`)
  and `after` (fs), and calls `analyze`. It is covered by a real-git integration test (not only
  fake-seam unit tests). Test-file classification reuses the shared adapter loader
  (`hooks/lib/lang-loader.js`, extracted so `test-corpus.js` and this module share one loader).
- **FR-007** The module emits a versioned contract `test-weakening/v1`:
  `{schema, flagged: [{file, lang, before, after, delta, removed}], not_analyzed: [{file, reason}], note?}`.
- **FR-008** `test-review` gains a **non-blocking** criterion that surfaces `flagged` files as
  `warning` — never escalating PASS/WARN/FAIL on its own. `/review` passes the git range so the
  signal reflects the feature's actual change.
- **FR-009** No new npm dependencies; reuses the existing `hooks/lib/lang/*` adapters and taxonomy
  classification.

## Edge Cases

- **EC-001** A test file present at base but with an unreadable/`null` base content from `gitShow` →
  `not_analyzed` (can't establish a baseline), never flagged.
- **EC-002** A test file that changed but whose assertion count is identical (e.g. a rename of an
  assertion, or a comment edit) → not flagged (no net decrease).
- **EC-003** A change with zero test files → empty `flagged`/`not_analyzed`, valid empty result.
- **EC-004** A test file that both lost some assertions and gained others, net zero or positive →
  not flagged (only net decrease flags).
- **EC-005** A deleted test file in an unsupported language (can't count its base) → `not_analyzed`,
  not a `removed` flag (we can't prove it had assertions).

## Success Criteria

- **SC-001** Every acceptance scenario has a corresponding test.
- **SC-002** All verification gates pass (the project's verify command).
- **SC-003** `test-weakening.js` is unit-tested model-free via the injectable `gitShow` seam — no real
  git in unit tests; one real-git integration test exercises the CLI discovery seam.
- **SC-004** No new npm dependencies; assertion counting reuses `hooks/lib/lang/*`.
- **SC-005** A test proves the signal is non-blocking: a `test-review` anchor asserts the criterion
  never escalates PASS/WARN/FAIL (same framing lock as Farley/oracle).
- **SC-006** No PreToolUse hook and no TDD sub-phase state machine are introduced (the Option-A/B
  machinery is explicitly not built).
