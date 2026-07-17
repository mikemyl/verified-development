# Discussion — test-weakening-detection

Spec-time stress test. Origin: roadmap #6, originally scoped as `tdd-subphase-freeze` (port
dev-team's tests-frozen-during-refactor PreToolUse guard). The challenge pivoted it to a detector.
Reviewed 2026-07-16.

## The premise weakness that drove the pivot

The original design (a PreToolUse hook that blocks test-file edits during a REFACTOR sub-phase)
depends on the **guarded party's honesty**: in the current `/implement`, RED→GREEN→REFACTOR all run
inside one executor invocation, so the executor both *declares* "I'm in REFACTOR" (writes the
marker) and is the thing *blocked*. If it's disciplined enough to write the marker it probably won't
edit the test; if it's undisciplined it may not write the marker either. The hook's real catch is
narrow — honest-entry then mid-refactor slip — bought at the cost of a hook that fires on **every**
Write/Edit/Bash globally (the highest blast radius mechanism in the plugin, able to block the user's
own edits) on **self-reported** state.

## Options

- **A (rejected): executor self-reports the sub-phase marker + PreToolUse block.** Simplest, but
  global blast radius for a narrow, self-reference-weakened catch.
- **B (rejected): restructure `/implement` to dispatch REFACTOR as a distinct step, orchestrator
  sets the marker.** Resolves the self-reference problem (setter ≠ guarded), but a meaningful change
  to `/implement`'s dispatch model + still a global hook.
- **C (CHOSEN): drop the hook + sub-phase machine entirely; detect post-hoc.** A deterministic
  detector flags a test file that **lost assertions during a change** (a possible "weakened the test
  to make a refactor/change pass" — the regression-hiding edit). Detective, not preventive, but: no
  global tool-use blast radius, no state machine, no self-reference problem, and it reuses machinery
  that already exists (`hooks/lib/lang/*` already count assertions; `test-review` already surfaces
  non-blocking signals). Gets most of the value at a fraction of the machinery.

## Design (Option C)

- **Deterministic signal, judgment verdict.** A new `hooks/lib/test-weakening.js` computes, per
  changed test file, the assertion-count delta (before→after) using the lang adapters'
  `countAssertions`. A **net decrease** (including a deleted test file → after 0) is flagged. The
  count is a script's job (on-doctrine); whether the drop is a legitimate test update or a
  regression-hiding weakening is a **judgment**, so it surfaces as a **non-blocking `test-review`
  WARNING**, consistent with the locked non-blocking framing (Farley/oracle/unarmored/reflection).
- **Reuse, don't reinvent:** classify test files via the taxonomy match-paths / lang adapters (same
  as `/test-audit`); count via the same adapters. Injectable git seam (`gitShow(ref, path)`) so the
  before/after diff is unit-testable model-free; the CLI uses real git.
- **No false alarms:** new test files and equal/increased assertions are never flagged (adding tests
  is good). An unsupported-language test file is reported as **not-analyzed** (a note), never a flag.

## Dependencies
- New `hooks/lib/test-weakening.js` (contract `test-weakening/v1`), reusing `hooks/lib/lang/*`.
- A non-blocking `test-review` criterion + `/review` wiring (it already establishes the git range).

## Out of scope
- The PreToolUse refactor-freeze hook and the TDD sub-phase state machine (Options A/B — rejected).
- Detecting *semantic* weakening beyond assertion-count delta (e.g. a `require.Equal`→`require.NotNil`
  swap that keeps the count) — the count is the deterministic proxy; the reviewer judges the rest.
- Mapping a test to its production subject ("changed alongside its subject") — an assertion drop is
  suspicious on its own; pairing adds complexity for little gain in the MVP.
