# verified-development

A Claude Code plugin that adds independent review to work the model does. It is language-agnostic:
it runs the repo's own verify command and judges tests against the repo's own test taxonomy.

## What it is, in one paragraph

You build conversationally — scenario tests first, in the repo's test DSL — and run the verify
command yourself. Before any commit, `/review` dispatches a panel of review agents that did not
write the code: correctness, tests, security, and, on diffs large enough to warrant them,
complexity and accessibility. For a change too big to just build, `/plan` drafts the plan in chat
and three critics stress-test it before you start. That is the whole workflow.

## Workflow

**Once per repo**

1. Install the plugin (below).
2. Run `/map`. It reads the repo's tests and writes `.verified/codebase/TESTING.md`: one entry per
   test type with its boundary, primitives, a real `good-example:` and the mechanical
   `anti-patterns:` the repo bans. It also writes a minimal `.verified/config.json`.
3. Accept the house rules it offers for the repo's `CLAUDE.md`
   ([`templates/project-rules.md`](templates/project-rules.md)). They are what makes the review
   run without being asked: the model reads `CLAUDE.md` every turn and a skill only when invoked.

**Per change**

1. Say what you want. If it touches more than ~3 files, changes a signature or a schema, or needs
   a migration, run `/plan`: the plan appears in chat with every acceptance scenario named as the
   test that will exist, three critics read it in parallel, and you approve or edit. Nothing is
   written to disk.
2. Build. Scenario tests first, at the boundary their type declares in `TESTING.md`, in the repo's
   DSL. Then the code, in small batches, in the main session. There is no executor agent.
3. Run the verify command yourself, in Bash, and read its exit code. The command comes from
   `config.json`, else the `verify` target in a Justfile or Makefile, else `package.json`.
4. `/review`. With the house rules in place the model runs it on every non-trivial change; type it
   to be sure. You get a report in chat: status PASS, WARN or FAIL, one row per finding with its
   disposition, the lenses that were skipped and why. If a finding is fixed, the fixing agents
   verify the fix delta once. There is no round 3.
5. Commit. The plugin never commits; the house rules say the model asks first.

**Now and then**

- `/test-audit <path>` ranks an existing test corpus worst-first against the taxonomy. Advisory.
- `node hooks/lib/review-ledger.js report` shows which review lenses pay for themselves.
- `/install-hooks` adds a lint-on-write hook and a verify-before-commit gate to the project.

What the plugin writes: `TESTING.md`, `config.json`, one line per review dispatch in
`.verified/review-ledger.jsonl`, and an audit report when you ask for one. No spec files, no plan
files, no state, no gotchas log.

## Why v2 is smaller than v1

v1 was a five-phase pipeline (specify → plan → implement → verify → review) with spec files,
executor agents, a wave scheduler and a handoff system. Five months of use on two production repos
measured where the value was:

- The review agents found the defects that would have shipped — in one session 19 of 25 `error`
  findings were real (a redirect loop, a half-applied migration, secrets reachable through a query
  depth) — at 3–8% of session tokens.
- The mechanical gates were green through every one of those bugs. Your own retro log said so,
  24 times.
- The spec files were never executed. 32 of 39 features had no test citing them. The one context
  document the pipeline kept appending to grew to 230 KB and was read 53 times in six sessions.
- Executor sub-agents cost 70–85% of a fix's sub-agent tokens; a single agent writing code and
  test in small batches did the same work faster (also the finding of
  [agentic-dev-team's experiments](https://github.com/bdfinst/agentic-dev-team)).
- In the last five weeks the pipeline was not invoked once. The review agents still ran 168 times,
  because the project `CLAUDE.md` required them.

So v2 keeps the agents, the house rules that make them fire, and the deterministic libs that feed
them. It deletes the rest.

## Commands

| Command | What it does |
|---------|--------------|
| `/review` | Verify gate (real exit code) → resolve the panel from each agent's declared scope and the diff size → dispatch in parallel → one verification round on the fix delta → report in chat, line in the ledger |
| `/plan` | Plan a multi-file change in chat (scenarios named as the tests that will exist), then three critics in parallel: acceptance, design, strategic |
| `/map` | Write `.verified/codebase/TESTING.md`: the repo's test types, boundaries, primitives, good examples. The only context doc the plugin reads |
| `/test-audit <path>` | Rank an existing test corpus worst-first against that taxonomy. Advisory, read-only |
| `/install-hooks` | Project hooks: lint on write, verify before commit |

Knowledge skills load on demand: `testing` (the craft rules and the three must-not-ship
anti-patterns), `tdd-go`, `react-testing`, `front-end-testing`, `test-design-reviewer` (the Farley
rubric), `mutation-testing`, `domain-driven-design`, `hexagonal-architecture`, `functional`,
`typescript-strict`, `ci-debugging`.

Always on in a `.verified/` repo: a PreToolUse **git guard** that denies git commands able to
discard uncommitted work, and `checkpoint.js` snapshots before a fix round.

## House rules

`/review` fires without being asked when the repo's `CLAUDE.md` says it must. `/map` offers to
append [`templates/project-rules.md`](templates/project-rules.md): review required, gates decided
by real exit codes, a test must be able to fail for a reason other than "I changed the code I just
wrote", never a git command that discards work.

## Measuring it

Every dispatch writes one line to `.verified/review-ledger.jsonl` (agent, outcome, counts).
`node hooks/lib/review-ledger.js report` gives yield per agent. A lens with a long run of `no-op`
is a lens to size-gate or drop; that is how v3 gets decided.

## Documentation

| Topic | What's covered |
|-------|----------------|
| **[How it works](docs/how-it-works.md)** | The hooks, the verify command, `config.json`, each workflow step by step with the scripts behind it, checkpoints, the ledger, plugin layout |
| **[Review](docs/reviews.md)** | The panel, each agent, the size gate, the one verification round, blocking vs. non-blocking, the Farley Score |
| **[Test taxonomy](docs/test-taxonomy.md)** | Test types, tiers, the optional craft fields, `/test-audit` (Go · TypeScript · Python · Java) |
| **[Go stack](docs/go-stack.md)** | One example of a stack's verify command and TDD skill |

## Installation

```bash
claude plugin marketplace add https://github.com/mikemyl/verified-development
claude plugin install verified-development
```

Then in a project: `/map`, accept the house rules, build, `/review`.

## Influences

- [agentic-dev-team](https://github.com/bdfinst/agentic-dev-team) — review agents, the workflow
  experiments, cost metering
- [imti.co/go-ai-verified-development](https://imti.co/go-ai-verified-development/) — the Go
  verification pipeline
- [citypaul/.dotfiles](https://github.com/citypaul/.dotfiles) — TDD and testing patterns
