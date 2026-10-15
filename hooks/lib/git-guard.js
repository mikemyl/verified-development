#!/usr/bin/env node
'use strict';
/**
 * hooks/lib/git-guard.js — contract `git-guard/v1`
 *
 * Decides whether a Bash command can DISCARD UNCOMMITTED WORK in the working
 * tree, from the literal command text. Model-free, no deps.
 *
 * Why a hook and not prose: in keros-platform an executor was told "no
 * `git stash`" after a near-miss and then ran `git checkout <path>`, which was
 * not on the list, destroying four tasks of uncommitted work. The class is the
 * rule, not the names — see the v1.24.0 design discussion (git history).
 *
 * The class is "the working tree loses content git does not keep": stash,
 * checkout, switch, restore (worktree), reset --hard/--merge/--keep, clean,
 * rebase, worktree remove, and --abort on merge/rebase/cherry-pick/revert/am.
 * History rewrites (branch -D, push --force, commit --amend) are OUTSIDE the
 * class on purpose — the reflog keeps those.
 *
 * Scope: active only when a `.verified/` directory exists at or above cwd
 * (the workflow gate's own "this repo is governed" signal). Opt out per repo
 * with `hooks.git_guard: false` in `.verified/config.json`, or per session with
 * `VERIFIED_GIT_GUARD=0`.
 *
 * Fail-safe direction: a malformed hook input, a non-Bash tool or an empty
 * command → allow (never wedge every Bash call); a malformed config → guard.
 *
 * API:
 *   classify(command)                       -> {schema, blocked, matches:[{segment, subcommand, reason}]}
 *   decide({toolName, command, cwd, env})   -> {schema, decision: 'allow'|'deny', reason, matches}
 *   findGovernedRoot(cwd)                   -> path|null
 */

const fs = require('fs');
const path = require('path');

const SCHEMA = 'git-guard/v1';

const RESTORE_HINT =
  'Recover a file from the last checkpoint instead: ' +
  'node ${CLAUDE_PLUGIN_ROOT}/hooks/lib/checkpoint.js list --feature <feature>, then ' +
  'node ${CLAUDE_PLUGIN_ROOT}/hooks/lib/checkpoint.js restore <ref> <path>. ' +
  'If you genuinely need this git command, ask the user to run it themselves in a terminal.';

// Global git options that consume the NEXT token when given without `=`.
const GLOBAL_OPTS_WITH_ARG = new Set([
  '-C', '-c', '--git-dir', '--work-tree', '--namespace', '--exec-path', '--super-prefix',
  '--config-env', '--list-cmds', '--attr-source',
]);

// Tokens that may precede `git` on a segment without changing what runs.
const PREFIX_WORDS = new Set(['sudo', 'env', 'command', 'exec', 'time', 'nice', 'nohup', 'builtin']);

const ABORTABLE = new Set(['merge', 'rebase', 'cherry-pick', 'revert', 'am']);

// --- tokenizer ---------------------------------------------------------------

/**
 * Drop heredoc bodies: `<<TAG` / `<<-TAG` / `<<'TAG'` / `<<"TAG"` up to a line
 * that is exactly TAG. Prose inside a heredoc is data, not a command.
 */
function stripHeredocs(src) {
  const lines = String(src).split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const m = line.match(/<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1/);
    out.push(line);
    i += 1;
    if (!m) continue;
    const tag = m[2];
    while (i < lines.length && lines[i].replace(/^\t+/, '') !== tag) i += 1;
    i += 1; // skip the terminator line itself
  }
  return out.join('\n');
}

const SEP = Symbol('sep');

/**
 * Split shell text into tokens; quotes group, and command separators
 * (`&&`, `||`, `;`, `|`, newline, `(`, `)`, `$(`, backtick) become SEP markers.
 * A `#` at token start ends the segment (comment).
 */
function tokenize(src) {
  const tokens = [];
  let cur = '';
  let quote = null;
  let i = 0;
  const s = stripHeredocs(src);
  const flush = () => { if (cur !== '') { tokens.push(cur); cur = ''; } };
  const sep = () => { flush(); if (tokens[tokens.length - 1] !== SEP) tokens.push(SEP); };
  while (i < s.length) {
    const ch = s[i];
    if (quote) {
      if (ch === quote) quote = null;
      else if (ch === '\\' && quote === '"' && i + 1 < s.length) { cur += s[i + 1]; i += 1; }
      else cur += ch;
      i += 1;
      continue;
    }
    if (ch === "'" || ch === '"') { quote = ch; i += 1; continue; }
    if (ch === '\\' && i + 1 < s.length) { cur += s[i + 1]; i += 2; continue; }
    if (ch === '#' && cur === '') {
      // comment to end of line
      while (i < s.length && s[i] !== '\n') i += 1;
      continue;
    }
    if (ch === '$' && s[i + 1] === '(') { sep(); i += 2; continue; }
    if (ch === '`' || ch === '(' || ch === ')' || ch === ';' || ch === '\n') { sep(); i += 1; continue; }
    if (ch === '&' || ch === '|') { sep(); while (s[i] === '&' || s[i] === '|') i += 1; continue; }
    if (/\s/.test(ch)) { flush(); i += 1; continue; }
    cur += ch;
    i += 1;
  }
  flush();
  return tokens;
}

function segments(src) {
  const segs = [];
  let cur = [];
  for (const t of tokenize(src)) {
    if (t === SEP) { if (cur.length) segs.push(cur); cur = []; }
    else cur.push(t);
  }
  if (cur.length) segs.push(cur);
  return segs;
}

// --- classification ----------------------------------------------------------

function isGitWord(tok) {
  return tok === 'git' || /(^|\/)git$/.test(tok);
}

/** Locate the `git` invocation in a segment; return {sub, args} or null. */
function parseGitSegment(seg) {
  let i = 0;
  // skip `sudo`, `env FOO=1`, `command`, … and env assignments
  while (i < seg.length && (PREFIX_WORDS.has(seg[i]) || /^[A-Za-z_][A-Za-z0-9_]*=/.test(seg[i]))) i += 1;
  if (i >= seg.length || !isGitWord(seg[i])) return null;
  i += 1;
  // skip global options
  while (i < seg.length && seg[i].startsWith('-')) {
    const opt = seg[i];
    i += 1;
    if (GLOBAL_OPTS_WITH_ARG.has(opt)) i += 1;
  }
  if (i >= seg.length) return null;
  return { sub: seg[i], args: seg.slice(i + 1) };
}

function has(args, ...flags) {
  return args.some(a => flags.includes(a));
}

/** Returns a reason string when the invocation can discard uncommitted work, else null. */
function destructiveReason(sub, args) {
  const positional = args.filter(a => !a.startsWith('-'));
  switch (sub) {
    case 'stash': {
      const verb = positional[0];
      if (verb === 'list' || verb === 'show' || verb === 'create') return null;
      return 'git stash moves uncommitted changes out of the working tree (and pop/apply/drop can lose them)';
    }
    case 'checkout':
      return 'git checkout overwrites working-tree files (paths) or moves the tree to another commit';
    case 'switch':
      return 'git switch moves the working tree to another branch';
    case 'restore': {
      const staged = has(args, '--staged', '-S');
      const worktree = has(args, '--worktree', '-W');
      if (staged && !worktree) return null; // unstage only — index, not tree
      return 'git restore overwrites working-tree files from the index or a commit';
    }
    case 'reset':
      if (has(args, '--hard', '--merge', '--keep')) return 'git reset --hard/--merge/--keep discards working-tree changes';
      return null;
    case 'clean':
      return 'git clean deletes untracked files';
    case 'rebase':
      return 'git rebase rewrites the tree (autostash, --abort) while work is uncommitted';
    case 'worktree':
      if (positional[0] === 'remove') return 'git worktree remove deletes a working tree';
      return null;
    default:
      if (ABORTABLE.has(sub) && has(args, '--abort')) return `git ${sub} --abort resets the working tree`;
      return null;
  }
}

function classify(command) {
  const matches = [];
  for (const seg of segments(command == null ? '' : String(command))) {
    const parsed = parseGitSegment(seg);
    if (!parsed) continue;
    const reason = destructiveReason(parsed.sub, parsed.args);
    if (reason) matches.push({ segment: seg.join(' '), subcommand: parsed.sub, reason });
  }
  return { schema: SCHEMA, blocked: matches.length > 0, matches };
}

// --- scoping -----------------------------------------------------------------

function findGovernedRoot(cwd) {
  let dir = path.resolve(cwd || process.cwd());
  for (;;) {
    try {
      if (fs.statSync(path.join(dir, '.verified')).isDirectory()) return dir;
    } catch { /* keep walking */ }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function configOptsOut(root) {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(root, '.verified', 'config.json'), 'utf8'));
    return cfg && cfg.hooks && cfg.hooks.git_guard === false;
  } catch {
    return false; // malformed/absent config is not an opt-out
  }
}

function decide(input) {
  const { toolName, command, cwd, env } = input || {};
  const allow = reason => ({ schema: SCHEMA, decision: 'allow', reason, matches: [] });
  if (toolName !== 'Bash') return allow('not-bash');
  if (!command || !String(command).trim()) return allow('empty-command');
  const e = env || process.env;
  const flag = String(e.VERIFIED_GIT_GUARD == null ? '' : e.VERIFIED_GIT_GUARD).trim().toLowerCase();
  if (flag === '0' || flag === 'off' || flag === 'false') return allow('env-opt-out');
  const root = findGovernedRoot(cwd);
  if (!root) return allow('not-governed');
  if (configOptsOut(root)) return allow('config-opt-out');
  const c = classify(command);
  if (!c.blocked) return allow('not-destructive');
  const first = c.matches[0];
  const reason =
    `verified-development git-guard: \`${first.segment}\` can discard uncommitted work — ` +
    `${first.reason}. This class of command (stash, checkout, switch, restore, reset --hard, clean, ` +
    `rebase, worktree remove, --abort) is blocked while a .verified/ repo is being worked on. ` +
    RESTORE_HINT;
  return { schema: SCHEMA, decision: 'deny', reason, matches: c.matches };
}

module.exports = { SCHEMA, classify, decide, findGovernedRoot, tokenize: src => tokenize(src).map(t => (t === SEP ? '<SEP>' : t)) };
