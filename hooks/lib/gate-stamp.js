#!/usr/bin/env node
'use strict';
/**
 * hooks/lib/gate-stamp.js — contract `gate-stamp/v1`
 *
 * Runs a verify command at most once per working-tree state. Model-free, no deps.
 *
 * Why: on 2026-11-07 a keros-platform UI fix waited 16 minutes on gates before
 * /review started. The same vitest suite and Go tests ran three times on a tree
 * that had not changed between runs, because the repo rules, /review step 1 and
 * the fix round each ran the gate again. A stamp records "this exact command
 * exited 0 on this exact tree". A later run of the same command on the same
 * tree prints the stamp and exits 0 without running anything.
 *
 * The tree is checkpoint.js's working-tree hash: tracked + untracked files,
 * `.gitignore` respected, built through a throwaway index. Any edit (a fix, a
 * stray file, another session's change in the same checkout) changes the hash,
 * so the command runs again. A command is stamped only when it exits 0 AND
 * leaves the tree as it found it (a formatter that rewrote files has not
 * checked the tree it ran on). Stamps live in the git dir, outside the tree they
 * describe, one file per worktree.
 *
 * API (all take {cwd}):
 *   tree({cwd})                 -> sha | null          null outside a git repo
 *   check({cwd, command})       -> {schema, fresh, tree, stamp|null}
 *   record({cwd, command, tree})
 *   run({cwd, command, force})  -> exit code           the command's own exit code
 *
 *   verify({cwd, files, verifyConfig, force}) -> exit code   every routed command, stops at the first red
 *
 * CLI:
 *   gate-stamp.js verify --files-from <path> [--config <config.json>] [--force]
 *       resolves the commands with review-scope.js (`{files}` filled in) and runs each through
 *       the stamp. Exit 0 all green · the first red command's code · 3 no `verify` in config.
 *   gate-stamp.js run [--force] -- <command>   one command via /bin/sh unless stamped green
 *   gate-stamp.js check -- <command>           JSON, runs nothing
 * Exit: usage → 64.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { writeWorkingTree } = require('./checkpoint.js');
const { resolveVerify } = require('./review-scope.js');

const SCHEMA = 'gate-stamp/v1';
const FILE = 'verified-gate-stamps.json';
const KEEP = 50;

function stampFile(cwd) {
  const r = spawnSync('git', ['rev-parse', '--git-path', FILE], { cwd, encoding: 'utf8' });
  if (r.status !== 0) return null;
  return path.resolve(cwd, r.stdout.trim());
}

function tree({ cwd }) {
  try {
    return writeWorkingTree(cwd);
  } catch {
    return null;
  }
}

function load(file) {
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(data.stamps) ? data.stamps : [];
  } catch {
    return [];
  }
}

function check({ cwd, command }) {
  const t = tree({ cwd });
  const file = t && stampFile(cwd);
  const stamp = file ? load(file).find(s => s.command === command && s.tree === t) || null : null;
  return { schema: SCHEMA, fresh: Boolean(stamp), tree: t, stamp };
}

function record({ cwd, command, tree: t }) {
  const file = t && stampFile(cwd);
  if (!file) return;
  const others = load(file).filter(s => s.command !== command);
  const stamps = [{ command, tree: t, ts: new Date().toISOString() }, ...others].slice(0, KEEP);
  fs.writeFileSync(file, JSON.stringify({ schema: SCHEMA, stamps }, null, 2) + '\n');
}

// fs.writeSync, not process.stdout.write: the child writes straight to fd 1,
// and an async pipe write would land after its output.
const say = text => fs.writeSync(1, text);

function run({ cwd, command, force = false, out = { write: say } }) {
  const before = check({ cwd, command });
  if (before.fresh && !force) {
    out.write(`gate-stamp: \`${command}\` exited 0 on this tree (${before.tree.slice(0, 12)}) at ${before.stamp.ts}; not re-run.\n`);
    return 0;
  }
  const r = spawnSync(command, { cwd, shell: true, stdio: 'inherit' });
  const code = r.status === null ? 1 : r.status;
  if (code === 0 && before.tree) {
    const after = tree({ cwd });
    if (after === before.tree) record({ cwd, command, tree: before.tree });
    else out.write('gate-stamp: the command changed the tree, so it is not stamped.\n');
  }
  return code;
}

function verify({ cwd, files, verifyConfig, force = false }) {
  const plan = resolveVerify(verifyConfig, files);
  if (plan.source === 'none' || plan.source === 'invalid') {
    say(`gate-stamp: no usable \`verify\` in config.json (${plan.source}${plan.warnings.length ? `: ${plan.warnings.join(', ')}` : ''}); discover the command and use \`run --\`.\n`);
    return 3;
  }
  for (const c of plan.commands) {
    say(`gate-stamp: ${c.run}   (${c.files.length} file${c.files.length === 1 ? '' : 's'})\n`);
    const code = run({ cwd, command: c.run, force });
    say(`gate-stamp: exit ${code}\n`);
    if (code !== 0) return code;
  }
  if (plan.uncovered.length) say(`gate-stamp: no gate for ${plan.uncovered.join(', ')}\n`);
  say('gate-stamp: verify green\n');
  return 0;
}

function readConfig(file) {
  try {
    const cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
    return cfg && typeof cfg === 'object' ? cfg : {};
  } catch {
    return {};
  }
}

function main(argv) {
  const [cmd, ...rest] = argv;
  const sep = rest.indexOf('--');
  const flags = sep === -1 ? rest : rest.slice(0, sep);
  const command = sep === -1 ? '' : rest.slice(sep + 1).join(' ').trim();
  const usage = () => {
    process.stderr.write('usage: gate-stamp.js verify --files-from <path> [--config <config.json>] [--force] | run [--force] -- <command> | check -- <command>\n');
    return 64;
  };
  if (cmd === 'verify') {
    const at = f => (rest.indexOf(f) === -1 ? null : rest[rest.indexOf(f) + 1]);
    const list = at('--files-from');
    if (!list) return usage();
    let files;
    try {
      files = fs.readFileSync(list, 'utf8').split('\n').map(x => x.trim()).filter(Boolean);
    } catch {
      process.stderr.write(`gate-stamp.js: cannot read ${list}\n`);
      return 64;
    }
    const cfg = readConfig(at('--config') || '.verified/config.json');
    return verify({ cwd: process.cwd(), files, verifyConfig: cfg.verify, force: rest.includes('--force') });
  }
  if (!command) return usage();
  if (cmd === 'run') return run({ cwd: process.cwd(), command, force: flags.includes('--force') });
  if (cmd === 'check') {
    process.stdout.write(JSON.stringify(check({ cwd: process.cwd(), command }), null, 2) + '\n');
    return 0;
  }
  return usage();
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));

module.exports = { SCHEMA, FILE, tree, check, record, run, verify };
