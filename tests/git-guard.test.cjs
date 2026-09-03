'use strict';
/**
 * tests/git-guard.test.cjs — destructive-git-guard AS-001..AS-007
 *
 * The guard's input is literal command text (not self-reported state), so the
 * classifier is a pure function and is tested exhaustively; the hook seam is
 * tested end-to-end through stdin/stdout with the real hooks/git-guard.js.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const guard = require('../hooks/lib/git-guard.js');
const HOOK = path.join(__dirname, '..', 'hooks', 'git-guard.js');

const DENIED = [
  'git checkout -- path/to/file',
  'git checkout main',
  'git checkout -b feature',
  'git switch main',
  'git switch -c x',
  'git restore path/to/file',
  'git restore --staged --worktree f',
  'git restore -W f',
  'git stash',
  'git stash push -u',
  'git stash pop',
  'git stash apply',
  'git stash drop',
  'git stash clear',
  'git reset --hard',
  'git reset --hard HEAD~1',
  'git reset --merge',
  'git reset --keep origin/main',
  'git clean -fd',
  'git clean -n', // dry-run still blocked: the class is the verb, not the flag
  'git rebase main',
  'git rebase --abort',
  'git rebase -i HEAD~3',
  'git merge --abort',
  'git cherry-pick --abort',
  'git revert --abort',
  'git am --abort',
  'git worktree remove ../wt',
  // AS-003 wrapping
  'cd sub && git stash',
  'git -C /p checkout main',
  '/usr/bin/git restore f',
  'git -c x=y reset --hard',
  'git --no-pager -c core.pager=cat stash',
  'git --git-dir=.git --work-tree=. clean -f',
  'echo a; git clean -fd',
  '$(git switch main)',
  'go test ./... || git checkout -- .',
  'sudo git stash',
  'env FOO=1 git checkout x',
  'command git checkout x',
  'git    checkout   x',
  "git checkout 'a b.txt'",
  'git stash\n',
  'ls\ngit stash',
];

const ALLOWED = [
  'git status',
  'git diff --name-only',
  'git log --oneline -5',
  'git stash list',
  'git stash show -p stash@{0}',
  'git stash create',
  'git restore --staged f',
  'git restore -S f',
  'git reset HEAD f',
  'git reset',
  'git reset --soft HEAD~1',
  'git reset --mixed HEAD~1',
  'git merge feature',
  'git cherry-pick abc123',
  'git revert abc123',
  'git worktree list',
  'git worktree add ../wt main',
  'git branch -D old', // history, not working tree — outside the class by design
  'git push --force', // idem
  'git commit --amend --no-edit', // idem
  'git add -A && git commit -m "x"',
  'git show HEAD:path/to/file',
  'git rev-parse HEAD',
  'echo "git checkout is dangerous"', // quoted prose is not a command
  "cat > notes.md <<'EOF'\nnever run git checkout here\nEOF", // AS-004 heredoc
  'cat <<EOF > x\ngit stash\nEOF\ngit status',
  '# git checkout main', // shell comment
  'gitk', // not git
  'digit checkout', // not git
  'echo git stash', // argument to echo, not a git invocation
  'grep -rn "git checkout" docs/',
  'node hooks/lib/checkpoint.js restore refs/verified/checkpoints/f/001-x path', // the recovery path itself
  '',
];

function tmpdirWithVerified(config) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'gg-'));
  fs.mkdirSync(path.join(d, '.verified'));
  if (config !== undefined) fs.writeFileSync(path.join(d, '.verified', 'config.json'), JSON.stringify(config));
  return d;
}

function runHook(input, env) {
  const r = spawnSync(process.execPath, [HOOK], {
    input: typeof input === 'string' ? input : JSON.stringify(input),
    encoding: 'utf8',
    env: { ...process.env, VERIFIED_GIT_GUARD: '', ...(env || {}) },
  });
  return { code: r.status, out: r.stdout.trim(), err: r.stderr };
}

module.exports = [
  {
    name: 'classify: every destructive form is blocked (AS-001, AS-003)',
    fn() {
      for (const cmd of DENIED) {
        const r = guard.classify(cmd);
        assert.equal(r.blocked, true, `expected BLOCK: ${JSON.stringify(cmd)}`);
        assert.ok(r.matches.length >= 1 && r.matches[0].subcommand, `match names the subcommand: ${cmd}`);
        assert.ok(r.matches[0].reason, `match carries a reason: ${cmd}`);
      }
    },
  },
  {
    name: 'classify: read-only, history-only and non-git forms are allowed (AS-002, AS-004)',
    fn() {
      for (const cmd of ALLOWED) {
        const r = guard.classify(cmd);
        assert.equal(r.blocked, false, `expected ALLOW: ${JSON.stringify(cmd)} → ${JSON.stringify(r.matches)}`);
      }
    },
  },
  {
    name: 'classify: a compound with one bad segment reports that segment, not the whole line',
    fn() {
      const r = guard.classify('go test ./... && git status && git stash && echo ok');
      assert.equal(r.blocked, true);
      assert.equal(r.matches.length, 1);
      assert.equal(r.matches[0].subcommand, 'stash');
      assert.match(r.matches[0].segment, /^git stash$/);
    },
  },
  {
    name: 'classify: contract is stamped and stable',
    fn() {
      assert.equal(guard.classify('git status').schema, 'git-guard/v1');
      assert.equal(guard.SCHEMA, 'git-guard/v1');
    },
  },
  {
    name: 'decide: governed cwd → deny with a reason that names the class and the restore path (AS-001)',
    fn() {
      const d = tmpdirWithVerified();
      try {
        const r = guard.decide({ toolName: 'Bash', command: 'git checkout -- f', cwd: d, env: {} });
        assert.equal(r.decision, 'deny');
        assert.match(r.reason, /discard uncommitted work/i);
        assert.match(r.reason, /checkpoint\.js restore/);
        assert.match(r.reason, /git checkout/);
      } finally {
        fs.rmSync(d, { recursive: true, force: true });
      }
    },
  },
  {
    name: 'decide: .verified/ is found walking UP from a subdirectory cwd',
    fn() {
      const d = tmpdirWithVerified();
      const sub = path.join(d, 'a', 'b');
      fs.mkdirSync(sub, { recursive: true });
      try {
        assert.equal(guard.decide({ toolName: 'Bash', command: 'git stash', cwd: sub, env: {} }).decision, 'deny');
      } finally {
        fs.rmSync(d, { recursive: true, force: true });
      }
    },
  },
  {
    name: 'decide: no .verified/ at or above cwd → allow (AS-005)',
    fn() {
      const d = fs.mkdtempSync(path.join(os.tmpdir(), 'gg-plain-'));
      try {
        const r = guard.decide({ toolName: 'Bash', command: 'git checkout main', cwd: d, env: {} });
        assert.equal(r.decision, 'allow');
        assert.equal(r.reason, 'not-governed');
      } finally {
        fs.rmSync(d, { recursive: true, force: true });
      }
    },
  },
  {
    name: 'decide: config hooks.git_guard=false and VERIFIED_GIT_GUARD=0 both opt out (AS-006)',
    fn() {
      const d = tmpdirWithVerified({ hooks: { git_guard: false } });
      const e = tmpdirWithVerified({ hooks: { git_guard: true } });
      try {
        assert.equal(guard.decide({ toolName: 'Bash', command: 'git stash', cwd: d, env: {} }).reason, 'config-opt-out');
        assert.equal(guard.decide({ toolName: 'Bash', command: 'git stash', cwd: e, env: {} }).decision, 'deny');
        for (const v of ['0', 'off', 'false']) {
          assert.equal(
            guard.decide({ toolName: 'Bash', command: 'git stash', cwd: e, env: { VERIFIED_GIT_GUARD: v } }).reason,
            'env-opt-out',
            `env ${v}`,
          );
        }
        // a malformed config is not an opt-out — fail toward guarding
        const m = tmpdirWithVerified();
        fs.writeFileSync(path.join(m, '.verified', 'config.json'), '{not json');
        assert.equal(guard.decide({ toolName: 'Bash', command: 'git stash', cwd: m, env: {} }).decision, 'deny');
        fs.rmSync(m, { recursive: true, force: true });
      } finally {
        fs.rmSync(d, { recursive: true, force: true });
        fs.rmSync(e, { recursive: true, force: true });
      }
    },
  },
  {
    name: 'decide: non-Bash tools and empty commands are allowed (AS-007)',
    fn() {
      const d = tmpdirWithVerified();
      try {
        assert.equal(guard.decide({ toolName: 'Edit', command: 'git stash', cwd: d, env: {} }).reason, 'not-bash');
        assert.equal(guard.decide({ toolName: 'Bash', command: '', cwd: d, env: {} }).decision, 'allow');
        assert.equal(guard.decide({ toolName: 'Bash', cwd: d, env: {} }).decision, 'allow');
      } finally {
        fs.rmSync(d, { recursive: true, force: true });
      }
    },
  },
  {
    name: 'hook seam: real stdin → deny envelope for a governed repo, silence for allow (AS-001, AS-002, FR-003)',
    fn() {
      const d = tmpdirWithVerified();
      try {
        const deny = runHook({ tool_name: 'Bash', tool_input: { command: 'git checkout -- f' }, cwd: d });
        assert.equal(deny.code, 0, deny.err);
        const env = JSON.parse(deny.out);
        assert.equal(env.hookSpecificOutput.hookEventName, 'PreToolUse');
        assert.equal(env.hookSpecificOutput.permissionDecision, 'deny');
        assert.match(env.hookSpecificOutput.permissionDecisionReason, /checkpoint\.js restore/);

        const allow = runHook({ tool_name: 'Bash', tool_input: { command: 'git status' }, cwd: d });
        assert.equal(allow.code, 0);
        assert.equal(allow.out, '', 'an allow emits nothing — no decision means the normal permission flow');
      } finally {
        fs.rmSync(d, { recursive: true, force: true });
      }
    },
  },
  {
    name: 'hook seam: malformed JSON, non-Bash tool and missing command never block (AS-007)',
    fn() {
      const d = tmpdirWithVerified();
      try {
        for (const input of ['{not json', '', JSON.stringify({ tool_name: 'Edit', tool_input: { command: 'git stash' }, cwd: d }), JSON.stringify({ tool_name: 'Bash', tool_input: {}, cwd: d })]) {
          const r = runHook(input);
          assert.equal(r.code, 0, `exit 0 for ${JSON.stringify(input)}: ${r.err}`);
          assert.equal(r.out, '', `no output for ${JSON.stringify(input)}`);
        }
      } finally {
        fs.rmSync(d, { recursive: true, force: true });
      }
    },
  },
  {
    name: 'hook seam: registered in hooks.json as PreToolUse on Bash (FR-002)',
    fn() {
      const h = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'hooks', 'hooks.json'), 'utf8'));
      const pre = h.hooks.PreToolUse || [];
      const entry = pre.find(e => (e.hooks || []).some(x => /git-guard\.js/.test(x.command)));
      assert.ok(entry, 'PreToolUse entry for git-guard.js');
      assert.equal(entry.matcher, 'Bash');
    },
  },
];
