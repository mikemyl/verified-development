---
name: test-audit
description: "Triage an existing test corpus against the repo taxonomy: classify, rank, deep-review the worst."
argument-hint: "<path-to-tests>"
version: 0.1.0
---

Retroactively triage an existing test corpus against the repository's own test taxonomy. The command classifies every test, ranks them worst-first by mechanical smell, deep-reviews the worst handful for craft, and writes a single ranked report. It is **read-only** and **advisory**: it never modifies test or source files and never blocks any gate.

## Precondition — a repo taxonomy must exist

Classification is taxonomy-driven. Require `.verified/codebase/TESTING.md` with a `## Test Types` section.

- If the file or the `## Test Types` section is absent, **REFUSE**: write no report, perform no scan, and tell the user to run `/map` first to generate the repo taxonomy. The generic seed is not a substitute — it carries no repo-specific `match-paths`/`match-markers`, so it cannot classify this repo's tests.

## Process

### 1. Deterministic pass

Run the corpus library; it does all the mechanical work (discovery, classification, smell-ranking, summary, scope derivation) and emits a versioned `test-corpus/v1` JSON contract. The model never re-derives the corpus from raw source.

```bash
node ${CLAUDE_PLUGIN_ROOT}/hooks/lib/test-corpus.js scan <path> --testing .verified/codebase/TESTING.md
```

Parse the JSON: `tests` is already ranked worst-first; `summary` carries counts by type, share sanctioned and classification coverage; `scope` is the report's filename stem; `unsupported_files` lists tests in languages the parser does not read (report them as not-audited, never drop them silently).

### 2. Deep-dive the worst (top-N)

Take the top-N worst tests from the ranked list. **N is configurable; default 15.** For each selected test, invoke the `test-design-reviewer` skill to judge it against its type's rubric:

- the generic actor-BDD craft rules, **referenced from the `testing` skill** (the single source — do not restate them here), PLUS
- the test's inferred type's `good-example` / `bad-example` / `anti-patterns` from the taxonomy.

For each deep-reviewed test produce: one **Farley score**, which craft patterns hold and which `anti-patterns` are present, and a concrete recommendation.

- If a type declares no exemplars, fall back to the generic actor-BDD craft rules from the `testing` skill alone.
- If a `good-example` reference points at a test that no longer exists, note it as stale in the report rather than failing.

### 3. Report

Write `.verified/audits/<scope>-tests.md` (the `<scope>` from the JSON). Re-running overwrites the previous report for that scope.

The report contains, ranked worst-first:

- **Per test**: location (file:line), inferred type, sanctioned (yes/no), smell signals (unclassified, assertion dispersion, length, weak match), and — for deep-reviewed tests — the Farley score, the craft verdict, and the recommendation.
- **Summary stats** from the JSON `summary` (totals, counts by type, share sanctioned, classification coverage), plus the list of unsupported (not-audited) files.
- **The count of tests ranked but not deep-reviewed** (total ranked minus N). Never truncate silently — the reader must see how much of the tail went un-reviewed.

## Read-only / advisory

This command NEVER modifies any test or source file, and NEVER blocks any verification gate. Its only write is the report under `.verified/audits/`. Every output — the smell rank, the Farley scores, the taxonomy-mismatch flags — is an **advisory** quality signal, never a pass/fail verdict.
