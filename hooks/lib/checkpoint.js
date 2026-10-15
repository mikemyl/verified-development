#!/usr/bin/env node
'use strict';
/**
 * hooks/lib/checkpoint.js — contract `checkpoint/v1`
 *
 * Working-tree snapshots that are NOT commits on the branch. Model-free, no deps.
 *
 * Why: in keros-platform a 28-task feature ran with nothing committed (the
 * owner's rule: no commit before the verify command and /review pass). One `git checkout <path>`
 * then cost an hour of reconstruction because nothing had the file. A
 * checkpoint is the restore point that rule leaves out: the whole working tree
 * (tracked + untracked, `.gitignore` respected) written as a commit OBJECT
 * under `refs/verified/checkpoints/<feature>/<seq>-<label>`, built through a
 * TEMPORARY index so HEAD, the branch, the real index and the working tree are
 * untouched. Nothing is published; the refs never leave the repo unless
 * pushed explicitly.
 *
 * API (all take {cwd}):
 *   create({feature, label})  -> {schema, ref, sha, tree, parent, feature, label, seq, files_vs_head}
 *   list({feature})           -> {schema, feature, checkpoints:[{ref, sha, seq, label, date}]}  newest first
 *   diff({ref})               -> {schema, ref, files:[{path, status}]}   checkpoint vs working tree
 *   restore({ref, paths})     -> {schema, ref, restored:[], missing:[]}  by content, only those paths
 *
 * CLI (mirrors the API, JSON on stdout):
 *   checkpoint.js create --feature <f> --label <l>
 *   checkpoint.js list   --feature <f>
 *   checkpoint.js diff    <ref>
 *   checkpoint.js restore <ref> <path> [<path>…]
 * Exit: 0 ok · 1 usage · 2 git/ref failure.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SCHEMA = 'checkpoint/v1';
const NAMESPACE = 'refs/verified/checkpoints';

class GitError extends Error {}

function git(cwd, args, opts = {}) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...(opts.env || {}) }, input: opts.input });
  if (r.error) throw new GitError(`git ${args[0]}: ${r.error.message}`);
  if (r.status !== 0 && !opts.allowFail) throw new GitError(`git ${args.join(' ')}: ${(r.stderr || '').trim()}`);
  return r;
}

function slug(s, what) {
  const out = String(s == null ? '' : s).trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  if (!out || out === '.' || out === '..' || out.includes('..')) throw new Error(`${what}: invalid name ${JSON.stringify(s)}`);
  return out;
}

function assertNamespace(ref) {
  if (typeof ref !== 'string' || !ref.startsWith(NAMESPACE + '/')) {
    throw new Error(`ref must live under ${NAMESPACE}/ (got ${JSON.stringify(ref)})`);
  }
}

function headSha(cwd) {
  const r = git(cwd, ['rev-parse', '--verify', '-q', 'HEAD'], { allowFail: true });
  return r.status === 0 ? r.stdout.trim() : null;
}

/**
 * Write the current working tree (tracked + untracked, honouring .gitignore)
 * as a tree object using a throwaway index. Returns the tree sha.
 */
function writeWorkingTree(cwd) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vd-ckpt-'));
  const index = path.join(tmp, 'index');
  const env = { GIT_INDEX_FILE: index };
  try {
    const head = headSha(cwd);
    if (head) git(cwd, ['read-tree', head], { env });
    git(cwd, ['add', '-A', '--', '.'], { env });
    return git(cwd, ['write-tree'], { env }).stdout.trim();
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function parseRef(ref, feature) {
  const m = ref.match(new RegExp(`^${NAMESPACE}/${feature}/(\\d+)-(.+)$`));
  return m ? { seq: Number(m[1]), label: m[2] } : null;
}

function list({ cwd, feature }) {
  const f = slug(feature, 'feature');
  const r = git(cwd, ['for-each-ref', '--format=%(refname)%09%(objectname)%09%(creatordate:iso-strict)', `${NAMESPACE}/${f}/`]);
  const checkpoints = r.stdout
    .split('\n')
    .filter(Boolean)
    .map(line => {
      const [ref, sha, date] = line.split('\t');
      const p = parseRef(ref, f) || { seq: 0, label: ref.slice(ref.lastIndexOf('/') + 1) };
      return { ref, sha, seq: p.seq, label: p.label, date };
    })
    .sort((a, b) => b.seq - a.seq || (a.ref < b.ref ? 1 : -1));
  return { schema: SCHEMA, feature: f, checkpoints };
}

function create({ cwd, feature, label }) {
  const f = slug(feature, 'feature');
  const l = slug(label || 'checkpoint', 'label');
  const parent = headSha(cwd);
  const tree = writeWorkingTree(cwd);
  const seq = (list({ cwd, feature: f }).checkpoints[0] || { seq: 0 }).seq + 1;
  const ref = `${NAMESPACE}/${f}/${String(seq).padStart(3, '0')}-${l}`;
  const args = ['commit-tree', tree, '-m', `checkpoint(${f}): ${l}`];
  if (parent) args.push('-p', parent);
  const sha = git(cwd, args, {
    env: {
      GIT_AUTHOR_NAME: 'verified-development', GIT_AUTHOR_EMAIL: 'checkpoint@verified-development',
      GIT_COMMITTER_NAME: 'verified-development', GIT_COMMITTER_EMAIL: 'checkpoint@verified-development',
    },
  }).stdout.trim();
  git(cwd, ['update-ref', ref, sha]);
  const files_vs_head = parent
    ? git(cwd, ['diff-tree', '-r', '--name-only', parent, sha]).stdout.split('\n').filter(Boolean)
    : git(cwd, ['ls-tree', '-r', '--name-only', sha]).stdout.split('\n').filter(Boolean);
  return { schema: SCHEMA, ref, sha, tree, parent, feature: f, label: l, seq, files_vs_head };
}

function resolveRef(cwd, ref) {
  assertNamespace(ref);
  const r = git(cwd, ['rev-parse', '--verify', '-q', `${ref}^{commit}`], { allowFail: true });
  if (r.status !== 0) throw new GitError(`unknown checkpoint ref ${ref}`);
  return r.stdout.trim();
}

function diff({ cwd, ref }) {
  const sha = resolveRef(cwd, ref);
  const now = writeWorkingTree(cwd);
  const r = git(cwd, ['diff-tree', '-r', '--name-status', sha, now]);
  const files = r.stdout
    .split('\n')
    .filter(Boolean)
    .map(line => {
      const [status, ...rest] = line.split('\t');
      return { path: rest[rest.length - 1], status: status[0] };
    });
  return { schema: SCHEMA, ref, files };
}

function restore({ cwd, ref, paths }) {
  const sha = resolveRef(cwd, ref);
  const restored = [];
  const missing = [];
  for (const p of paths || []) {
    const rel = path.posix.normalize(String(p).replace(/\\/g, '/'));
    if (rel.startsWith('../') || path.isAbsolute(rel)) throw new Error(`path must be repo-relative: ${p}`);
    const r = git(cwd, ['cat-file', '-p', `${sha}:${rel}`], { allowFail: true });
    if (r.status !== 0) { missing.push(rel); continue; }
    // Re-read as a buffer to keep bytes exact.
    const buf = spawnSync('git', ['cat-file', '-p', `${sha}:${rel}`], { cwd, maxBuffer: 1 << 28 }).stdout;
    const target = path.join(cwd, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, buf);
    restored.push(rel);
  }
  return { schema: SCHEMA, ref, restored, missing };
}

// --- CLI ----------------------------------------------------------------------

function parseArgs(argv) {
  const opts = {};
  const pos = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith('--')) { opts[argv[i].slice(2)] = argv[i + 1]; i += 1; }
    else pos.push(argv[i]);
  }
  return { opts, pos };
}

function usage() {
  process.stderr.write(
    'usage: checkpoint.js create --feature <f> --label <l>\n' +
    '       checkpoint.js list   --feature <f>\n' +
    '       checkpoint.js diff    <ref>\n' +
    '       checkpoint.js restore <ref> <path> [<path>…]\n',
  );
  return 1;
}

function main() {
  const [, , cmd, ...rest] = process.argv;
  const { opts, pos } = parseArgs(rest);
  const cwd = process.cwd();
  let out;
  try {
    switch (cmd) {
      case 'create':
        if (!opts.feature) return usage();
        out = create({ cwd, feature: opts.feature, label: opts.label });
        break;
      case 'list':
        if (!opts.feature) return usage();
        out = list({ cwd, feature: opts.feature });
        break;
      case 'diff':
        if (!pos[0]) return usage();
        out = diff({ cwd, ref: pos[0] });
        break;
      case 'restore':
        if (!pos[0] || pos.length < 2) return usage();
        out = restore({ cwd, ref: pos[0], paths: pos.slice(1) });
        break;
      default:
        return usage();
    }
  } catch (err) {
    process.stderr.write(`checkpoint.js: ${err.message}\n`);
    return err instanceof GitError ? 2 : 1;
  }
  process.stdout.write(JSON.stringify(out, null, 2) + '\n');
  return 0;
}

if (require.main === module) process.exitCode = main();

module.exports = { SCHEMA, NAMESPACE, create, list, diff, restore, writeWorkingTree };
