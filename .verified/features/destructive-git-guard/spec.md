# Feature: destructive-git-guard

Stop an agent from discarding uncommitted work with git, and make every wave recoverable.

## Acceptance Scenarios

### AS-001 — A destructive git command is denied in a governed repo
Given a repo with a `.verified/` directory
When any agent runs `git checkout -- path/to/file` through the Bash tool
Then the PreToolUse hook denies the call with a reason naming the class of command and the
checkpoint restore command

### AS-002 — Read-only git stays allowed
Given the same repo
When an agent runs `git stash list`, `git status`, `git diff`, `git restore --staged f`,
`git reset HEAD f`
Then the hook allows the call

### AS-003 — Wrapping does not hide the command
When an agent runs `cd sub && git stash`, `git -C /p checkout main`, `/usr/bin/git restore f`,
`git -c x=y reset --hard`, `echo a; git clean -fd`, `$(git switch main)`
Then every one is denied

### AS-004 — Heredoc prose is not a command
When an agent runs `cat > notes.md <<'EOF'\nnever run git checkout here\nEOF`
Then the hook allows the call

### AS-005 — Outside governance the guard is silent
Given a cwd with no `.verified/` at or above it
When an agent runs `git checkout main`
Then the hook allows the call

### AS-006 — Opt-out
Given `.verified/config.json` has `"hooks": {"git_guard": false}`, or `VERIFIED_GIT_GUARD=0`
When an agent runs `git stash`
Then the hook allows the call

### AS-007 — The hook never blocks on its own failure
When the hook receives a non-Bash tool event, malformed JSON, or no `command`
Then it exits 0 with no decision (allow)

### AS-008 — A checkpoint captures the whole working tree without touching it
Given a repo with HEAD, one modified tracked file, one untracked file, one ignored file
When `checkpoint.js create --feature f --label wave-1-start` runs
Then a ref `refs/verified/checkpoints/f/001-wave-1-start` exists whose tree holds the modified
and the untracked file but not the ignored one, and HEAD, the current branch, the index and the
working tree are byte-identical to before

### AS-009 — A destroyed file is restored by content
Given a checkpoint, then the file is deleted from the working tree
When `checkpoint.js restore <ref> <path>` runs
Then the file is back, byte-identical, and no other file changed

### AS-010 — Diff shows what a checkpoint would give back
Given a checkpoint, then one file changed and one untracked file added
When `checkpoint.js diff <ref>` runs
Then it lists exactly those files with a status, and nothing else

### AS-011 — List is newest-first per feature
Given three checkpoints for feature f and one for g
When `checkpoint.js list --feature f` runs
Then it returns f's three, newest first, each with ref, sha, label

### AS-012 — Unborn HEAD still checkpoints
Given a repo with no commits
When `checkpoint.js create` runs
Then a parentless checkpoint commit exists

### AS-013 — The round cap reports what it would ship
Given round 4 findings containing one new `error` at high confidence
When the ledger classifies the round
Then `decision: escalate`, `reason: round-cap`, `blocking_new_errors: 1`

### AS-014 — Prose anchors
- `agents/executor.md` forbids the class (not a list), names the hook, and no longer says
  "checkpoint-commit"
- `skills/implement/SKILL.md` snapshots at wave boundaries, runs `ListAgents` before dispatch,
  and never redirects a running agent via `SendMessage`
- `skills/review/SKILL.md` snapshots before each correction round and renders FAIL when
  `blocking_new_errors > 0` at the cap
- `agents/test-review.md` criterion 13 (non-blocking): hand-written test doubles that omit a
  field the change added to a serialized contract

## Requirements
- FR-001 `hooks/lib/git-guard.js` exports `classify(command)` and `decide({toolName, command, cwd, env})`; contract `git-guard/v1`
- FR-002 `hooks/git-guard.js` is the PreToolUse entry, registered in `hooks/hooks.json` with matcher `Bash`
- FR-003 Deny output uses the `hookSpecificOutput` envelope with `permissionDecision: "deny"`
- FR-004 `hooks/lib/checkpoint.js` exports `create`, `list`, `restore`, `diff`; contract `checkpoint/v1`; CLI mirrors the exports
- FR-005 Checkpoints use a temporary index (`GIT_INDEX_FILE`) — never the repo index
- FR-006 `classifyRound` output gains `blocking_new_errors`

## Success Criteria
- SC-001 Zero new npm dependencies
- SC-002 Every git interaction has a real-git test (seam rule)
- SC-003 `node tests/run.cjs` and `node scripts/lint-descriptions.cjs` green
