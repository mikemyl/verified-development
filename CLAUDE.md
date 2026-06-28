# Verified Development Plugin

This is a Claude Code plugin. Changes here affect all projects that install it.

## Workflow features

### Interruptible workflow (v1.2.0+)

Every phase skill is interruptible at any tool-use boundary.

- **`.verified/features/<feature>/handoff.json`** — schema-versioned (v1) machine-readable record of where the phase is. Required fields: `feature`, `phase`, `completed_tasks`, `remaining_tasks`, `git_head`, `timestamp`. Optional: `blockers` (with `severity: blocking|advisory`), `decisions_made`, `reason`. Schema at `hooks/schemas/handoff.schema.json`; helper at `hooks/lib/handoff.js` (atomic writes, validation).
- **`.verified/features/<feature>/continue-here.md`** — narrative companion. If JSON and MD disagree, trust the JSON.
- **`/pause`** captures handoff + continue-here, then ends the turn. Standalone skill — clear trigger.
- **`/continue`** reads handoff + state, briefs the user, recommends the next action. Refuses if any `blockers[].severity == "blocking"`. (Named `continue` rather than `resume` because the latter collides with Claude Code's built-in `--resume`.)
- **`state.md` schema v2** — adds `active_phase` (set while a phase is mid-execution), `next_action` (slash command or recommendation), `next_phases` (branch options). Lazy upgrade: legacy v1 files are read without error and bumped on next write.
- **Statusline** distinguishes scenes: in-flight (magenta `:phase`), idle-with-next-action (`↪/cmd`), legacy idle.

### Adversarial critique (v1.3.0+)

Two stress-test gates inside the workflow.

- **Spec-time challenge (in `/specify`)** — Socratic Q&A interrogating the *problem* before `spec.md` is written. Six categories: ambiguity, surface area, alternatives, edge cases, dependencies, out-of-scope. Max 8 questions, one at a time. Audit trail at `.verified/features/<feature>/discussion.md` (preserves rejected options, not just chosen). Opt out with `--no-challenge` or `.verified/config.json` `workflows.challenge: false`.
- **Plan-time critics (in `/plan`)** — up to five agents (`plan-critic-acceptance`, `plan-critic-design`, `plan-critic-strategic` always; `plan-critic-ux` only when `ui-spec.md` exists; `plan-critic-parallelization` only when the wave engine reports `parallel: true`) dispatched in parallel before user approval. Severity policy: `error` auto-fixes the plan, `warning` surfaces to user (max 10 visible), `suggestion` is recorded only. Audit trail at `.verified/features/<feature>/concerns.md`. Opt out with `--no-critics` or `workflows.plan_critics: false`.

The five critics share a finding schema (`{critic, severity, description, tied_to, recommendation?}`) and the same severity rubric — defined once in `skills/specify/references/challenge.md` and re-used verbatim in each critic agent. If you change the rubric, update all six files (the five critics + `challenge.md`); `tests/adversarial-critique.test.cjs` will catch drift.

### Process retro (v1.3.1+)

`/review` step 8c writes a small **process-level** retro per feature, separate from the existing code-level capture. Two artifacts:

- `.verified/features/<feature>/retro.md` — four sections (What worked / What didn't / Workflow tuning signals / Top process learning). Sections may be empty.
- `.verified/learnings.md` — append-only digest, one line per feature, format `- YYYY-MM-DD **feature** — top learning`. Cross-feature trend signal — grep this to spot patterns.

Process retro is for "what did we learn about HOW we worked on this feature." Code-level findings (gotchas, conventions, ADRs, dependencies) stay in their existing destinations (`.verified/codebase/`, `.verified/decisions/`). The skill explicitly documents the line; the prompt-anchor test enforces it survives future edits.

### Deterministic wave engine (v1.6.0+)

`/implement` no longer eyeballs `[P]` markers to decide what runs in parallel. `hooks/lib/waves.js` (Node, no deps; library + CLI, mirrors `handoff.js`) parses the plan and does ALL the graph math, emitting a versioned JSON contract.

- **Task grammar** — every plan task declares a machine-readable surface: `(files: a, b)` (the files it creates/modifies) plus optional `(depends on T001)` / `(depends on T001-T003)`. The `[P]` marker is now a human hint only; the engine is authoritative.
- **Contract `plan-waves/v1`** — `waves` (each inner array runs concurrently via separate executors), per-task `depends_on`/`files`/`wave`/`status`, `collisions` (same-wave tasks declaring the same file), `undeclared` (parallel-wave tasks with no declared surface), `parallel`. Algorithm: Kahn level-layering + pairwise file-set intersection.
- **Exit codes** — `0` ok, `1` usage, `2` malformed plan (cycle / unknown dep / duplicate id, with the offender named). `/plan` (step 8a) computes + renders a `## Waves` table and refuses to present a plan that exits 2 or has collisions; `/implement` re-runs the same engine and gates each wave on `collisions`/`undeclared` before fanning out.
- **`plan-critic-parallelization`** — the 5th plan critic, fed the engine's `collisions` array. The script proves mechanical file overlap; this critic catches the semantic coupling a script can't (a same-wave task B that consumes an interface task A introduces). Spawned only when `parallel: true`.
- Tests: `tests/waves.test.cjs` (engine unit tests + skill-wiring anchors). The engine is fully unit-tested model-free — that is the point of moving the schedule out of the LLM.

### Farley Score (v1.6.0+)

A non-blocking test-quality signal, filling the gap left by removing mutation testing as a verification requirement.

- **Single source of truth** — the rubric (Dave Farley's 8 properties, weighted `(U×1.5 + M×1.5 + R×1.25 + A×1.0 + N×1.0 + G×1.0 + F×0.75 + T×1.0) / 9`, score bands) lives in `skills/test-design-reviewer/SKILL.md`. Do not duplicate it; reference it.
- **Wiring** — the `test-review` agent computes a Farley Score when a change adds or rewrites tests; `/review` surfaces it in the report and `/verify` points at it. It is **informational only** — PASS/WARN/FAIL comes from error/warning findings, never from the score. "High Farley + weak assertions" is still a warning.
- Tests: `tests/farley-score.test.cjs` locks the formula (a pure-function reimplementation must equal the published formula string — prose and math can't drift) and asserts the non-blocking wiring.

### Enforced test taxonomy (v1.7.0+)

Every plan task now declares the *kind* of test it ships, and a deterministic gate refuses tasks that under-test without sanction. No LLM is in the block decision.

- **Task-grammar trailers** — `(test: <type>)` (the task's sanctioned test type) and `(scenario: <id>)` (the acceptance-scenario ids it serves). Parsed by `hooks/lib/waves.js` (`test_type`/`scenarios` on the task contract); the authoritative gate is `hooks/lib/test-gate.js`. The wave math ignores both — they exist for the gate.
- **Per-repo taxonomy** — a `## Test Types` table in `.verified/codebase/TESTING.md` defines the repo's sanctioned types, seeded from `hooks/lib/test-types-seed.md` (single source of truth: it is both the gate's fallback when a repo has no taxonomy and the scaffold `/map` and `/init` write). Resolution (`hooks/lib/taxonomy.js`): repo taxonomy authoritative, else the seed.
- **Tiers** — `default` (no friction), `exception` (sanctioned narrow types, e.g. `dao`), `sign-off` (e.g. `unit`, `none` — blocked until the user explicitly approves, persisted in `.verified/features/<feature>/test-signoffs.json`).
- **Gate contract `test-gate/v1`** — severity-coded `findings` (`MISSING_TEST_TYPE`, `UNKNOWN_TEST_TYPE`, `UNTRACEABLE_TASK`, `DANGLING_SCENARIO`, `UNSERVED_SCENARIO`, `MIGRATION_NEEDED`, `SIGNOFF_REQUIRED`, `DIAGRAM_MISSING`), per-task `summary`, `blocked`. Exit codes: `0` ok · `1` usage · `2` blocked (error findings) · `3` malformed taxonomy. Wired into `/plan` (step 8a-bis, renders a `## Test Boundaries` table; surfaces warnings non-blocking) and `/implement` (re-gates before dispatching each wave). Deterministic — a script makes the block decision.
- **Coverage reframed** — coverage is a *consequence* of the taxonomy (tdd-go/testing), not a primary gate. A taxonomy/quality mismatch (declared type vs. what the test actually does) is WARN-only, surfaced by `test-review`/`test-design-reviewer`, never blocking.
- ADR: `.verified/decisions/0001-test-taxonomy-design.md`. Tests: `tests/taxonomy.test.cjs`, `tests/test-gate.test.cjs`, grammar in `tests/waves.test.cjs`, wiring anchors in `tests/test-taxonomy*.test.cjs`.

### Test audit (v1.8.0+)

`/test-audit <path>` is the retroactive, advisory counterpart to the forward gate: it triages tests that already exist. Where the gate blocks new under-tested plan tasks, the audit ranks an existing corpus worst-first and deep-reviews the worst — it never blocks and never modifies a file.

- **Optional taxonomy fields** (additive, forward gate ignores them; parsed by `hooks/lib/taxonomy.js`, an `ARRAY_FIELDS` const drives comma-split): `match-paths`/`match-markers` (deterministic classification signals), `good-example`/`bad-example`/`anti-patterns` (the per-type craft rubric). Seeded in `hooks/lib/test-types-seed.md`; populated per-repo by `/map`.
- **Deterministic corpus lib** — `hooks/lib/test-corpus.js` (Node, no deps; mirrors the sibling libs). The classify/rank/summary/scope core is **language-agnostic**; per-language discovery + assertion-counting live in drop-in adapters under `hooks/lib/lang/*.js`, auto-loaded by file extension (no central registry). Adapters: `go`, `typescript` (`.ts/.tsx/.js/.jsx`), `python`, `java` — each exports `{id, extensions, testFileGlobs, discover, countAssertions}`. C-family languages share `lang/cfamily.js` (a configurable brace-balance scanner that ignores braces in strings/comments); Python uses an indentation scanner. No language toolchain required (source is parsed as text). Emits `test-corpus/v1` `{schema, scope, tests, summary, unsupported_files, note?}`. CLI: `test-corpus.js scan <path> --testing <TESTING.md|->`. Model-free, unit-tested per adapter.
- **The command** (`skills/test-audit/SKILL.md`) requires a repo `## Test Types` (refuse → `/map`), runs the lib, deep-dives the worst top-N via `test-design-reviewer` against each test's type rubric (generic craft rules referenced from the `testing` skill + the type's exemplars/anti-patterns), and writes a ranked report to `.verified/audits/<scope>-tests.md` with the count not deep-reviewed (no silent truncation). A scope of only-unsupported languages produces an explicit note, not a misleading empty pass.
- **Craft rules single-sourced** — the six language-neutral actor-BDD rules (fixtures-at-top, immutable fixture chaining, `Sends`/`Receives`-only, sequences, captured data, single-behavior) live once in `skills/testing/SKILL.md`; `tdd-go`, `react-testing`, `front-end-testing`, the audit skill, and `/map` reference them. A drift guard in `tests/test-audit.test.cjs` asserts they aren't restated anywhere else.
- **Adding a language** — drop a `hooks/lib/lang/<id>.js` adapter (+ a `tests/lang-<id>.test.cjs`); the loader picks it up by extension. The core, the gate, and the taxonomy are untouched.
- Tests: `tests/test-corpus.test.cjs` (discovery + classify + analyze), `tests/taxonomy.test.cjs` (optional fields), wiring anchors in `tests/test-audit.test.cjs`.

### Hook output envelopes

Claude Code requires the `hookSpecificOutput` envelope for `additionalContext`. Bare `{"additionalContext": "..."}` is silently dropped. All our hooks (`session-start.sh`, `context-monitor.js`) emit:

```json
{"hookSpecificOutput": {"hookEventName": "PostToolUse|SessionStart", "additionalContext": "..."}}
```

## Development

### Testing Changes

After modifying skills, agents, or hooks:
1. Bump version in `.claude-plugin/plugin.json` AND `.claude-plugin/marketplace.json`
2. Run `claude plugin update verified-development@verified-development` in a target project
3. Start a new Claude Code session to pick up changes

### Reading Conversations from Other Projects

Claude Code stores conversation history as JSONL files. Use this to troubleshoot plugin behavior in other projects:

```bash
# Find recent conversations for a project
ls -lt ~/.claude/projects/-Users-mike-go-src-keros-platform/*.jsonl | head -5

# Parse conversation messages (user + assistant text + tool calls)
python3 -c "
import json
with open('PATH_TO_JSONL') as f:
    lines = f.readlines()
for i, line in enumerate(lines):
    obj = json.loads(line)
    t = obj.get('type', '')
    if t in ('user', 'assistant'):
        msg = obj.get('message', {})
        content = msg.get('content', [])
        if isinstance(content, list):
            for c in content:
                if isinstance(c, dict):
                    if c.get('type') == 'text' and len(c.get('text','')) > 20:
                        print(f'L{i} {t.upper()}: {c[\"text\"][:300]}')
                    elif c.get('type') == 'tool_use':
                        name = c.get('name','')
                        inp = c.get('input', {})
                        if name == 'Skill':
                            print(f'L{i} SKILL: {inp.get(\"skill\",\"?\")}')
                        elif name == 'Agent':
                            print(f'L{i} AGENT: type={inp.get(\"subagent_type\",\"?\")} desc={inp.get(\"description\",\"\")[:80]}')
"
```

**Project path mapping:** Claude Code converts paths to directory names with dashes. `/Users/mike/go/src/keros-platform` becomes `-Users-mike-go-src-keros-platform`.

**What to look for when troubleshooting:**
- Which skills triggered (search for `SKILL:` in output)
- Whether our skills or third-party skills loaded (check the `Base directory` path)
- Whether the workflow was followed (specify → plan → implement → verify → review)
- Whether the LLM prompted to commit before review
- Whether state.md was updated correctly

### Plugin Installation

Plugins from registered marketplaces can auto-load skills even when not in `enabledPlugins`. To fully prevent a plugin's skills from triggering, remove its marketplace:

```bash
# Remove a marketplace (e.g., superpowers)
rm -rf ~/.claude/plugins/marketplaces/superpowers-dev
rm -rf ~/.claude/plugins/cache/claude-plugins-official/superpowers

# Check what marketplaces exist
ls ~/.claude/plugins/marketplaces/
```

### Skill Trigger Behavior

The `description` field in SKILL.md frontmatter controls when Claude auto-loads a skill. Aggressive language ("You MUST use this") triggers more broadly than passive ("Use when the user invokes /command"). Our core skills use aggressive triggers to ensure the workflow is followed.

### Version Bumping

Always bump BOTH files in sync:
- `.claude-plugin/plugin.json`
- `.claude-plugin/marketplace.json`

The plugin cache is version-keyed — same version = no re-install.

### Tests

Plain Node test runner at `tests/run.cjs`. Each `*.test.cjs` exports `[{name, fn}]`. No npm dependencies. Run with `node tests/run.cjs`. CI runs both `node scripts/lint-descriptions.cjs` and the test runner via `.github/workflows/lint.yml`.

### Skill description budget

Hard cap of 100 chars per `description:` field, enforced by `scripts/lint-descriptions.cjs`. Anti-patterns to avoid: "Triggers:" keyword stuffing, flag enumerations (move to `argument-hint`), multi-sentence prose. Aggressive imperative language ("Required before…", "You MUST use this…") still fits within the budget.
