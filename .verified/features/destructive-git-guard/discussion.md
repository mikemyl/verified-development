# Discussion: destructive-git-guard

Source: keros-platform `manual-reservation-override` retro (2026-09-03). Two incidents in one
session: an executor ran `git stash`/`git stash pop` on the shared tree while a parallel agent
was mid-write (no damage, by luck — `stash` without `-u` skipped the untracked spec file), and a
later executor ran `git checkout <path>` to undo a temporary edit and destroyed four tasks' work
in `sync.go`. The orchestrator had banned `git stash` by name after the first incident; the
second command was not on the list. ~35 lines were never recovered; the file was reconstructed
from its tests.

## Q1 — Prose or hook?

Prose is what failed. The plugin's precedent (`test-weakening-detection`, state.md note) rejected
a global PreToolUse hook for the refactor-freeze because (a) blast radius: every repo with the
plugin, and (b) the state it gated on was self-reported by the model. This guard differs on (b):
the input is the literal command text, not a phase the model claims to be in. (a) is mitigated by
scoping: the guard is active only when a `.verified/` directory is found at or above the cwd —
the same signal the workflow gate uses for "this repo is under governance" — and a repo can opt
out with `hooks.git_guard: false` in `.verified/config.json` (or `VERIFIED_GIT_GUARD=0` per
session). **Decision: hook, scoped, opt-out.**

## Q2 — Which commands?

The class is "can discard uncommitted work in the working tree", not a list of names:
`stash` (except `list`/`show`/`create`), `checkout`, `switch`, `restore` (unless `--staged` only),
`reset --hard|--merge|--keep`, `clean`, `rebase`, `worktree remove`, and `--abort` on
`merge`/`rebase`/`cherry-pick`/`revert`/`am`. Deliberately outside the class: `branch -D`,
`push --force`, `commit --amend` — they rewrite *history*, which the reflog keeps; the guard is
about the one thing git does not keep. Rejected: blocking all of `reset` (an unstage is harmless)
and allow-listing `checkout -b` (trunk-based; an executor never needs a branch).

## Q3 — Why did one bad command cost an hour?

Nothing had been committed for 28 tasks. The owner's "no commit before /verify + /review" rule is
about *publishing*, so a checkpoint must not be a commit on the branch. `git stash create` is the
closest built-in but skips untracked files and needs `-u` to touch the tree. **Decision:** a
model-free `checkpoint.js` that snapshots the working tree (tracked + untracked, `.gitignore`
respected) into a commit object under `refs/verified/checkpoints/<feature>/…` via a temporary
index — HEAD, the branch, the index and the working tree are untouched, and `restore` brings a
file back by content. `/implement` snapshots at every wave boundary, `/review` before every
correction round, `/quick` before GREEN. The guard's deny message names the restore command, so
the recovery path is one step from the failure.

## Q4 — Round cap vs a proven exploit

The keros loop hit round 5 deliberately because the round-4 fix contained a demonstrated escape.
"Stop at 4" must not read as "ship it". **Decision:** the ledger reports `blocking_new_errors` at
the cap; the skill renders the report FAIL when it is non-zero and the user (never the loop)
raises `--max-rounds`.

## Q5 — Out of scope

The `SendMessage` redirect collision and `ListAgents`-before-dispatch are orchestrator prose in
`/implement`. Codegen-freshness CI and the `deadcode` blind spot are keros-specific. Committing at
phase boundaries stays the owner's call; the checkpoint removes the need to decide it now.
