# How it works

Three commands, ten agents, eleven scripts, three hooks. The scripts make every mechanical
decision (which lenses run, whether a round converged, which test files lost assertions, what the
taxonomy says); the model makes the judgment calls (is this finding real, is this fix right). Each
script has a versioned JSON contract and a unit test; none of them calls a model.

## The pieces

| Kind | Items |
|------|-------|
| Commands (skills) | `review`, `plan`, `map`, `test-audit`, `install-hooks` |
| Knowledge skills | `testing`, `tdd-go`, `react-testing`, `front-end-testing`, `test-design-reviewer`, `mutation-testing`, `domain-driven-design`, `hexagonal-architecture`, `functional`, `typescript-strict`, `ci-debugging` — loaded on demand by their `description:` |
| Review agents | `correctness-review`, `test-review`, `security-review`, `complexity-review`, `a11y-review`, `error-handling-review`, `concurrency-review` ([reviews.md](reviews.md)) |
| Plan critics | `plan-critic-acceptance`, `plan-critic-design`, `plan-critic-strategic` |
| Hooks | `Setup` statusline, `PreToolUse` git guard, `PostToolUse` context monitor |
| Scripts (`hooks/lib/`) | `review-scope.js`, `findings.js`, `test-weakening.js`, `taxonomy.js`, `finding-signature.js`, `checkpoint.js`, `review-ledger.js`, `test-corpus.js`, `lang-loader.js`, `git-guard.js` |

## Hooks

`hooks/hooks.json` registers three. All run as plain `node`/`bash` commands with a short timeout
and fail open: a malformed input or a crash produces no output, which Claude Code reads as "allow".

### Setup — the statusline

`setup-statusline.sh` runs once when the plugin is enabled. It copies `hooks/statusline.js` to
`~/.claude/hooks/vd-statusline.js` (a stable path, no plugin version in it) and registers that
file as the `statusLine` command in `~/.claude/settings.json` if none is set. The statusline shows
model, directory and a context-usage bar scaled to the usable window (Claude Code keeps ~16.5% as
its auto-compact buffer, so the bar reads 100% at that point).

### PreToolUse on Bash — the git guard

`hooks/git-guard.js` is the stdin/stdout seam; the decision lives in `hooks/lib/git-guard.js`
(contract `git-guard/v1`). It denies any git invocation that can discard uncommitted work:
`stash`, `checkout <path>`, `switch`, `restore`, `reset --hard|--merge|--keep`, `clean`, `rebase`,
`worktree remove`, and `--abort` on merge/rebase/cherry-pick/revert/am. The class is the rule, not
a list: the incident that motivated it was an agent told "no `git stash`" that ran
`git checkout <path>` instead and destroyed four tasks of work. History rewrites (`branch -D`,
`push --force`, `commit --amend`) are outside the class on purpose — the reflog keeps those.

The classifier tokenizes the real command: it sees through `sudo`, `env`, `-C <dir>` and
`-c key=val`, through `&&`, `;` and `|`, and ignores heredoc bodies, comments and quoted prose
(`echo "git stash"` is not a git invocation).

Scope and switches:

- Active only when a `.verified/` directory exists at or above the working directory. A repo
  without one is not governed and the hook allows everything.
- `hooks.git_guard: false` in `.verified/config.json` turns it off for that repo.
- `VERIFIED_GIT_GUARD=0` (or `off`, `false`) turns it off for one session.
- A malformed `config.json` is not an opt-out.

The deny message tells the model what to do instead: undo an edit with an inverse edit, or
recover a file by content from a checkpoint (below). When you genuinely need one of the blocked
commands, run it yourself; the `!` prefix in Claude Code runs a command outside the tool the hook
guards.

### PostToolUse — the context monitor

`context-monitor.js` reads the `context_window.remaining_percentage` Claude Code passes to every
hook and, when usage passes 65% (warning) or 80% (critical) of the usable window, injects one line
of advice: finish the current edit, run the verify command, then `/compact` at a clean boundary.
It is debounced to one message per five tool uses, except that an escalation to critical fires at
once. Advice only — the harness compacts on its own; the hint exists because a deliberate compact
at a phase boundary gives a cleaner summary than an automatic one mid-edit.

Claude Code requires the `hookSpecificOutput` envelope for `additionalContext`; a bare
`{"additionalContext": …}` is silently dropped.

### Optional project hooks — `/install-hooks`

Not part of the plugin's own hooks. `/install-hooks` asks for a lint command and a verify command,
stores them under `hooks.post_write_lint` / `hooks.pre_commit_verify` in `.verified/config.json`,
writes two scripts to `.verified/hooks/` and registers them in the project's
`.claude/settings.local.json`: a lint-after-write hook (advisory, never blocks a write) and a
verify-before-commit gate (blocks `git commit` with exit 2 when the verify command fails).

## The verify command

The one gate the plugin trusts. It is resolved in this order:

1. `"verify"` in `.verified/config.json` (written by `/map`);
2. a `verify` target in a `Justfile` or `Makefile`;
3. the `verify` script in `package.json`;
4. `mvn verify` when there is a `pom.xml`.

And it is decided only by its real exit code, read in Bash (`${PIPESTATUS[0]}` when piped). Never
from an IDE terminal, a `| tail`, a scoped package run, or an agent's self-report. Red stops
`/review` before any agent runs: review of broken code is noise.

The same command is the pre-commit gate `/install-hooks` installs, and the last step `/plan` names
before `/review`.

### Teaching the plugin your stack

The plugin stays language-agnostic by learning each repo's mechanics instead of hardcoding them:

- **`.verified/codebase/` (the usual path)** — `/map` writes `TESTING.md` there. Its
  `## Test Types` section is the taxonomy `test-review` judges against and `/plan` picks scenario
  types from. Data, not code.
- **The verify command** — in `config.json` or a `Justfile`/`Makefile`/`package.json`/`pom.xml`
  target, as above.
- **A per-repo skill** — for richer TDD guidance, add a skill in the repo. The bundled `tdd-go` is
  the example to copy; [go-stack.md](go-stack.md) shows a fully wired stack.

Test idioms resolve by inference: `TESTING.md` is authoritative when present; else the dominant
framework and assertion style of the repo's existing tests; else the neutral `testing` skill with
no idiom assumptions.

## `.verified/` and `config.json`

```json
{
  "verify": "just verify",
  "workflows": { "plan_critics": true },
  "hooks": { "git_guard": true }
}
```

| Key | Default | Effect |
|-----|---------|--------|
| `verify` | detected as above | The command `/review` runs as its gate |
| `workflows.plan_critics` | `true` | `false` skips the three critics in `/plan` (also `--no-critics` per run) |
| `hooks.git_guard` | `true` | `false` disables the git guard for this repo |
| `hooks.post_write_lint`, `hooks.pre_commit_verify`, `hooks.*_timeout` | unset | Written and read by `/install-hooks` only |

What lives in a project:

```
your-project/
├── CLAUDE.md                    # + templates/project-rules.md (offered by /map)
└── .verified/
    ├── config.json              # verify command, toggles
    ├── codebase/TESTING.md      # the test taxonomy — the only doc an agent reads
    ├── review-ledger.jsonl      # one line per review dispatch
    ├── audits/<scope>-tests.md  # only if you ran /test-audit
    └── hooks/                   # only if you ran /install-hooks
```

Nothing else. No spec files, no plan files, no state, no gotchas log. A lesson worth keeping
becomes a test or a guard.

## Workflows

### `/review`

| Step | What happens | Script and contract |
|------|--------------|---------------------|
| 0. Scope | The range: `--since <ref>`, else the working tree against `HEAD` when there is uncommitted work, else `merge-base main HEAD...HEAD`. Changed paths go to a file; changed lines are counted. | `git diff --numstat` |
| 1. Gate | The verify command, run in Bash, real exit code. Red → stop. | — |
| 2. Panel | Each agent declares `scope:` (globs or `always`), `context_needs:` and optionally `min_changed_lines:`. The resolver selects, orders cheap-first (haiku → sonnet → opus), and names a reason for every skip: `no-matching-file`, `non-executable-only-diff`, `small-diff`. Include-biased: a read failure widens the roster and lands in `warnings`. `security-review` never skips a docs-only diff. | `review-scope.js select --files-from <list> --changed-lines <N>` → `review-scope/v1` |
| 3. Briefs | Linter findings become suppression keys (`file:line:rule_id`, never a message) so agents do not re-report what a linter already said. Test files that lost assertions are flagged for `test-review`. The `## Test Types` section is extracted from `TESTING.md` so `test-review` gets the rubric, not the prose. Every agent applies the two review-integrity rules. A brief is additive to the agent's standing rubric, never a substitute. | `findings.js scan <dir>` → `findings/v1` (SARIF-normalized); `test-weakening.js scan <base>`; `taxonomy.js extract TESTING.md` |
| 4. Dispatch | One message, every selected agent, in parallel. Results read cheap-first. | — |
| 5. Triage | Every error and warning verified against the code. Pre-existing problems become follow-ups. Report in chat: status, one row per finding with disposition, skipped lenses, resolver warnings, Farley Score. | — |
| 6. One verification round | Snapshot the tree. Fix one finding at a time; re-run the suite and the verify command after each. Re-dispatch only the agents whose findings were fixed, with the fix hunks ±20 lines, asking for `confirmed`, `not-fixed` or `insufficient-context` plus any new error inside the delta. The round ledger matches findings across rounds by signature (agent, file, category, normalized message, line within ±3) and decides: converged, or FAIL with the new errors named. There is no round 3. | `checkpoint.js create --feature review --label round-2`; `finding-signature.js round --round 2 --current … --previous … --fix-diff … --max-rounds 2` → `finding-signature/v1` |
| 7. Ledger | One line per dispatched agent: outcome `no-op`, `fixed`, `dismissed` or `escalated`, with counts. | `review-ledger.js record --agent … --outcome …` → `review-ledger/v1` |

`/review --agent <name>` runs one agent over the same range with the same briefs. `/review` never
commits and writes no report file; the ledger is its only artifact.

### `/plan`

For a change that is too big to just build: more than ~3 files, more than one acceptance scenario,
a signature or schema change, a migration.

1. Restate the request in three lines (what changes, what must not, what is out of scope). At most
   three questions, one at a time, only where the answer changes the plan.
2. Read the `## Test Types` section (`taxonomy.js extract`), the files the change touches, a sibling
   feature, and every call site of a signature that will change. Stop after ~15 files.
3. Write the plan in chat: scope, acceptance scenarios named `path::TestName` with their type,
   tasks with a done criterion, decisions, risks. Signature and schema changes are additive:
   add alongside, migrate, delete last. No placeholders.
4. Dispatch the three critics in one message with the plan and the request pasted into each
   prompt. They share one rubric (`skills/plan/references/critic-rubric.md`, copied verbatim
   into each critic and drift-guarded by a test): `error` → the plan is re-drafted before you see
   it; `warning` → shown under the plan, max 10; `suggestion` → dropped. Skip them with
   `--no-critics` or `workflows.plan_critics: false`.
5. You approve, edit, or dismiss each warning with a reason. Then build: scenario tests first, the
   verify command, `/review`.

No file is written. If you want the plan kept, paste it into an issue.

### `/map`

Writes `.verified/codebase/TESTING.md` (under ~15 KB) and a minimal `config.json`. The file has
two short sections for humans (infrastructure, organization) and the `## Test Types` section the
scripts parse: one `### <type>` per discovered test type with `boundary`, `pattern`, `location`,
`tier`, `when-to-use`, `primitives`, `match-paths`, `match-markers`, `good-example`,
`bad-example`, `anti-patterns` and a Mermaid harness diagram. It starts from
`hooks/lib/test-types-seed.md` and adapts each entry to the types the repo actually has.

`anti-patterns:` is a gate — `test-review` raises a match as a blocking `error` — so `/map` lists
only mechanical smells there. See [test-taxonomy.md](test-taxonomy.md) for the fields and the
boundary doctrine.

```bash
node hooks/lib/taxonomy.js resolve .verified/codebase/TESTING.md   # parsed types, source, defects
node hooks/lib/taxonomy.js extract .verified/codebase/TESTING.md   # the section text alone
```

Last, `/map` offers to append `templates/project-rules.md` to the repo's `CLAUDE.md`.

### `/test-audit <path>`

Read-only. Requires a repo taxonomy. `test-corpus.js scan <path> --testing TESTING.md`
(`test-corpus/v1`) discovers every test through the language adapters, classifies it by
`match-paths` and `match-markers`, and ranks worst-first by mechanical smell. The worst N
(default 15) go to `test-design-reviewer` for a Farley score and a recommendation. The report
lands at `.verified/audits/<scope>-tests.md`.

Language adapters live in `hooks/lib/lang/` (Go, TypeScript, Python, Java), loaded by extension
through `lang-loader.js`, which also owns the glob matcher the resolver uses. The same adapters'
assertion counters drive `test-weakening.js`.

## Agent frontmatter

Each agent file declares what the resolver needs:

```yaml
model: sonnet            # haiku | sonnet | opus — also the dispatch order (cheap first)
scope: "**/*.go"         # path globs, or `always`
context_needs: full-file # what the brief must carry
min_changed_lines: 40    # optional size gate; skipped below it with reason `small-diff`
```

`correctness-review` and `security-review` run on opus, `complexity-review` on haiku, the rest
on sonnet. Complexity and a11y carry the size gate because on measured sessions they returned
nothing actionable on one-line fixes while costing 30–50K tokens each.

## Checkpoints

`checkpoint.js` (contract `checkpoint/v1`) snapshots the whole working tree — tracked and
untracked, `.gitignore` respected — as a commit object under
`refs/verified/checkpoints/<feature>/<seq>-<label>`, built through a temporary index so HEAD, the
branch, the real index and the working tree are untouched. Nothing is pushed unless you push the
ref yourself.

```bash
node hooks/lib/checkpoint.js create  --feature review --label round-2
node hooks/lib/checkpoint.js list    --feature review
node hooks/lib/checkpoint.js diff    <ref>                 # checkpoint vs working tree
node hooks/lib/checkpoint.js restore <ref> <path> [<path>…] # by content, only those paths
```

`/review` creates one before its verification round. The git guard's deny message points here.

## The ledger

```bash
node hooks/lib/review-ledger.js report            # yield per agent over the whole file
node hooks/lib/review-ledger.js report --last 50  # the recent window
```

`yield` is `fixed / dispatches`. A lens with a long run of `no-op` is a lens to size-gate or drop;
that is how the panel changes.

The outcome on each line is self-reported by the model that triaged and fixed the findings, and
self-reports drift optimistic. The one mechanical check: a `fixed` line must carry `files ≥ 1`,
the number of files changed since the pre-fix checkpoint (`checkpoint.js diff <ref>`), and the
script rejects a `fixed` with none. Under-counted `dismissed` has no such witness. Before acting
on a yield number, spot-check a few lines against the session transcript or the commit diff.

## Blocking is narrow

Only mechanical, no-judgment findings are `error`: falsifiable correctness and security errors,
and the three must-not-ship test anti-patterns in the `testing` skill (asserting that some error
occurred when the code returns a named one; arranging or asserting below the test's declared
boundary; violating an anti-pattern the repo declared). Farley Score, taxonomy fit, oracle
provenance, test weakening and contract doubles stay non-blocking signals. Details in
[reviews.md](reviews.md).

## Plugin layout

```
verified-development/
├── .claude-plugin/           # plugin.json + marketplace.json manifests
├── skills/
│   ├── review/ plan/ map/    # the three commands (+ test-audit, install-hooks)
│   └── testing/ tdd-go/ react-testing/ front-end-testing/ test-design-reviewer/
│       mutation-testing/ domain-driven-design/ hexagonal-architecture/ functional/
│       typescript-strict/ ci-debugging/            # knowledge, loaded on demand
├── agents/                   # 7 review agents + 3 plan critics
├── templates/project-rules.md
├── docs/
├── tests/                    # plain Node runner, one *.test.cjs per concern
└── hooks/
    ├── hooks.json            # Setup statusline, PreToolUse git-guard, PostToolUse context-monitor
    ├── setup-statusline.sh statusline.js
    ├── git-guard.js          # the hook seam; classifier in lib/git-guard.js
    ├── context-monitor.js
    └── lib/
        ├── review-scope.js       # panel resolver: declared scope + size gate
        ├── review-ledger.js      # per-dispatch find/fix/no-op ledger
        ├── finding-signature.js  # round ledger: new vs carried, --max-rounds
        ├── findings.js (+findings/)  # SARIF → suppression keys
        ├── test-weakening.js     # assertion-count delta per changed test file
        ├── taxonomy.js (+test-types-seed.md)  # ## Test Types parser, resolve, extract
        ├── test-corpus.js (+lang/)   # /test-audit discovery + ranking
        ├── lang-loader.js        # adapter loading, glob matching
        ├── checkpoint.js         # working-tree snapshots under refs/verified/checkpoints/
        └── git-guard.js          # the destructive-git classifier
```

## Hacking on the plugin

```bash
node tests/run.cjs                 # run all *.test.cjs
node scripts/lint-descriptions.cjs # enforce the 100-char skill description budget
```

`tests/v2-surface.test.cjs` pins the shipped surface and fails on any reference to a cut piece;
add a skill, agent or lib to its lists when you add the file. `tests/docs.test.cjs` fails on a
broken link, a doc the README does not list, a skill the README does not name, or a hook or lib
this page does not mention. Libs with an external seam (git, a CLI) get a direct subprocess test,
not only a unit test.

After changing skills, agents or hooks, bump the version in **both** `.claude-plugin/plugin.json`
and `.claude-plugin/marketplace.json` (the cache is version-keyed), then
`claude plugin update verified-development@verified-development` and start a new session.
