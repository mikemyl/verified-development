# Configuration & Layout

## `.verified/config.json` toggles

Workflow behavior is controlled by `workflows.*` flags:

| Flag | Default | Effect when `false` |
|------|---------|---------------------|
| `require_spec` | `true` | Allows code work without a spec |
| `require_verify` | `true` | Allows skipping the verification gate |
| `require_review` | `true` | Allows skipping review |
| `challenge` | `true` | Skips the spec-time adversarial challenge ([details](adversarial-critique.md)) |
| `plan_critics` | `true` | Skips the plan-time critic pass ([details](adversarial-critique.md)) |

`challenge` and `plan_critics` can also be turned off per-run with `--no-challenge` / `--no-critics`.

## What `/init` and `/map` create in your project

```
your-project/
├── .verified/
│   ├── project.md            # Vision, constraints, tech stack
│   ├── config.json           # Thresholds, workflow toggles
│   ├── state.md              # Current feature, phase, status (schema v2)
│   ├── learnings.md          # Append-only cross-feature process digest
│   ├── assessment.md         # Gap analysis (from /assess)
│   ├── design-system.md      # Brand tokens (from /ui-spec)
│   ├── codebase/             # Living context (from /map)
│   │   ├── ARCHITECTURE.md  CONVENTIONS.md  STACK.md  STRUCTURE.md
│   │   └── TESTING.md  INTEGRATIONS.md  CONCERNS.md
│   ├── decisions/            # Architecture Decision Records (DEC-001-*.md)
│   └── features/<feature>/
│       ├── spec.md           # Acceptance scenarios, requirements
│       ├── discussion.md     # Spec-challenge audit trail
│       ├── ui-spec.md        # Screen specs (optional)
│       ├── plan.md           # Ordered tasks with file paths + waves
│       ├── concerns.md       # Plan-critic findings
│       ├── handoff.json      # Machine-readable pause/continue state
│       ├── continue-here.md  # Narrative pause companion
│       ├── summary.md        # Implementation outcomes
│       ├── review.md         # Review findings
│       └── retro.md          # Process retro
├── Justfile                  # Verification pipeline targets
├── .golangci.yml             # 43 linters configured
├── revive.toml               # Complexity and idiom rules
└── codecov.yml               # CI coverage gates
```

Codebase docs are created by `/map` and kept current by the doc-review agent after each feature review.

## Plugin layout (this repo)

```
verified-development/
├── .claude-plugin/           # plugin.json + marketplace.json manifests
├── skills/                   # One dir per slash command + shared methodology skills
│   ├── verified-development/ # Universal workflow gate & principles
│   ├── go-verified-development/  # Go toolchain & standards
│   ├── specify/ plan/ implement/ verify/ review/   # The five phases
│   ├── assess/ map/ init-project/ ui-spec/ quick/  # Entry points & variants
│   ├── pause/ continue/ progress/ update-plan/ session-report/
│   └── …                     # TypeScript/frontend arm: typescript-strict,
│                             #   functional, domain-driven-design, hexagonal-architecture,
│                             #   testing, front-end-testing, react-testing,
│                             #   test-design-reviewer, mutation-testing, ci-debugging
├── agents/                   # Review agents + plan critics + executor (see reviews.md)
└── hooks/
    ├── hooks.json            # Setup + PostToolUse hooks
    ├── lib/waves.js          # Deterministic wave engine (see planning.md)
    ├── lib/handoff.js        # Pause/continue handoff helper
    ├── schemas/              # JSON schemas (handoff, …)
    ├── statusline.js         # Feature, phase, context % in the status bar
    └── context-monitor.js    # Warns when the context window fills up
```

## Hacking on the plugin

Tests are a plain Node runner (no npm deps):

```bash
node tests/run.cjs                 # run all *.test.cjs
node scripts/lint-descriptions.cjs # enforce the 100-char skill description budget
```

After changing skills/agents/hooks, bump the version in **both** `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json` (the cache is version-keyed), then `claude plugin update verified-development@verified-development` and start a new session.
