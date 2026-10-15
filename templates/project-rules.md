# Project rules (verified-development)

Append this block to the repo's `CLAUDE.md`. These four rules are what measurably caught defects on
real projects; everything else the plugin once did was ceremony around them.

## Review agents are required

Run the plugin's review agents on every non-trivial change — anything beyond a typo or a comment.
Invoke `/review` after the verify command is green and before any commit. Do not ask permission to
spawn the agents; spawning them is a normal part of doing the work. The agents, not the gates, found
the defects that would have shipped.

## Gates are decided by real exit codes

Run the verify command (`just verify`, `make verify`, the `package.json` script) in Bash and read its
exit code. Never decide a gate from an IDE terminal, a `| tail`, a scoped package run, or an agent's
self-report. Run the whole suite, not the package you touched. Editor diagnostics are a prompt to
re-check, never a verdict.

## A test must be able to fail for a reason other than "I changed the code I just wrote"

If the only oracle is the implementation, the test does not go in: no asserting the string you just
typed, no mocking the function under test, no expected value computed by the code under test, no
snapshot recorded from current output. Write the acceptance test first, at the boundary its type
declares in `.verified/codebase/TESTING.md`, assert through the test DSL, and extend the seam instead
of reaching below it.

## Never run a git command that can discard uncommitted work

`git stash`, `git checkout <path>`, `git switch`, `git restore`, `git reset --hard`, `git clean`,
`git rebase`, `git worktree remove`, any `--abort` — the class, not a list. The plugin's git-guard hook
denies them. Undo an edit with an inverse edit. Recover a file by content with
`checkpoint.js restore <ref> <path>`. Commit only when the user says so.
