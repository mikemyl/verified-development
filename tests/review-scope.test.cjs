'use strict';

/**
 * Tests for hooks/lib/review-scope.js — the deterministic Stage-2 lens resolver
 * and the correction loop's scope-growth check.
 *
 * Dispatch selection was prose-driven; this moves the mechanical half (which
 * agent's declared `scope:` matches which changed file, in what order, and what
 * a docs-only diff may skip) into a script. It is include-biased by
 * construction: a lens is dropped ONLY when the resolver can prove it has
 * nothing to look at, and every read failure widens the roster instead of
 * narrowing it silently.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.resolve(__dirname, '..');
const rs = require(path.join(REPO, 'hooks', 'lib', 'review-scope.js'));

const AGENTS = [
  { name: 'complexity-review', scope: 'always', context_needs: 'diff-only', model: 'haiku' },
  { name: 'correctness-review', scope: 'always', context_needs: 'full-file', model: 'opus' },
  { name: 'security-review', scope: 'always', context_needs: 'full-file', model: 'opus' },
  { name: 'test-review', scope: 'always', context_needs: 'full-file', model: 'sonnet' },
  { name: 'doc-review', scope: ['**/*.md', '**/README*'], context_needs: 'full-file', model: 'sonnet' },
  { name: 'concurrency-review', scope: ['**/*.go'], context_needs: 'full-file', model: 'sonnet' },
];
const sel = (files, opts = {}) => rs.selectLenses(files, { agents: AGENTS, ...opts });
const names = r => r.selected.map(a => a.name);

module.exports = [
  // --- glob matching --------------------------------------------------------
  {
    name: 'selectLenses: a glob lens runs only when a changed file matches it',
    fn: () => {
      const go = sel(['internal/pay/refund.go']);
      assert.ok(names(go).includes('concurrency-review'));
      assert.ok(!names(go).includes('doc-review'));
    },
  },
  {
    name: 'selectLenses: an always lens runs on any executable diff',
    fn: () => {
      for (const n of ['complexity-review', 'correctness-review', 'security-review', 'test-review']) {
        assert.ok(names(sel(['internal/pay/refund.go'])).includes(n), `${n} must run`);
      }
    },
  },
  {
    name: 'selectLenses: a top-level file matches a **/ glob (globstar means zero-or-more segments)',
    fn: () => {
      assert.ok(names(sel(['README.md'])).includes('doc-review'));
    },
  },
  {
    name: 'selectLenses: an unmatched lens is reported as skipped, never silently dropped',
    fn: () => {
      const r = sel(['internal/pay/refund.go']);
      const skipped = r.skipped.find(s => s.name === 'doc-review');
      assert.ok(skipped, 'doc-review must appear in skipped');
      assert.equal(skipped.reason, 'no-matching-file');
    },
  },

  // --- cheap-first ordering -------------------------------------------------
  {
    name: 'selectLenses: lenses are ordered cheap-first (haiku, sonnet, opus)',
    fn: () => {
      const order = names(sel(['internal/pay/refund.go', 'docs/guide.md']));
      const tier = n => AGENTS.find(a => a.name === n).model;
      const ranks = order.map(n => ({ haiku: 0, sonnet: 1, opus: 2 }[tier(n)]));
      assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b), `not cheap-first: ${order.join(', ')}`);
    },
  },
  {
    name: 'selectLenses: ordering is stable — equal tiers sort by name',
    fn: () => {
      const opus = names(sel(['internal/pay/refund.go'])).filter(n =>
        ['correctness-review', 'security-review'].includes(n),
      );
      assert.deepEqual(opus, ['correctness-review', 'security-review']);
    },
  },

  // --- non-executable-only diffs -------------------------------------------
  {
    name: 'selectLenses: a docs-and-assets-only diff skips the behaviour lenses',
    fn: () => {
      const r = sel(['docs/guide.md', 'docs/img/flow.png']);
      assert.equal(r.non_executable_only, true);
      assert.ok(!names(r).includes('correctness-review'));
      assert.ok(!names(r).includes('complexity-review'));
      assert.ok(!names(r).includes('test-review'));
      assert.equal(
        r.skipped.find(s => s.name === 'correctness-review').reason,
        'non-executable-only-diff',
      );
    },
  },
  {
    name: 'selectLenses: security-review is NEVER skip-eligible — prose is the prompt-injection vector',
    fn: () => {
      assert.ok(names(sel(['docs/guide.md'])).includes('security-review'));
      assert.ok(!rs.NON_EXECUTABLE_SKIP_ELIGIBLE.includes('security-review'));
    },
  },
  {
    name: 'selectLenses: doc-review still runs on a docs-only diff (its glob matches)',
    fn: () => {
      assert.ok(names(sel(['docs/guide.md'])).includes('doc-review'));
    },
  },
  {
    name: 'isNonExecutable: prompts and manifests are NOT docs — a plugin repo ships behaviour as markdown and config',
    fn: () => {
      assert.equal(rs.isNonExecutable('docs/guide.md'), true);
      assert.equal(rs.isNonExecutable('CLAUDE.md'), false);
      assert.equal(rs.isNonExecutable('agents/test-review.md'), false);
      assert.equal(rs.isNonExecutable('skills/review/SKILL.md'), false);
      assert.equal(rs.isNonExecutable('.claude/settings.json'), false);
      assert.equal(rs.isNonExecutable('.verified/codebase/TESTING.md'), false);
    },
  },
  {
    name: 'isNonExecutable: dependency and config surfaces stay executable (a lockfile bump is a security change)',
    fn: () => {
      for (const p of ['package-lock.json', 'go.sum', 'package.json', '.github/workflows/ci.yml', 'Dockerfile']) {
        assert.equal(rs.isNonExecutable(p), false, `${p} must not be treated as a doc`);
      }
    },
  },
  {
    name: 'selectLenses: one executable file among docs keeps the full roster',
    fn: () => {
      const r = sel(['docs/guide.md', 'internal/pay/refund.go']);
      assert.equal(r.non_executable_only, false);
      assert.ok(names(r).includes('correctness-review'));
    },
  },

  // --- fail-open ------------------------------------------------------------
  {
    name: 'selectLenses: an empty changed-file list cannot narrow anything — keep every always lens, and warn',
    fn: () => {
      const r = sel([]);
      assert.ok(names(r).includes('correctness-review'));
      assert.ok(r.warnings.some(w => w.startsWith('empty-changed-file-list')));
    },
  },
  {
    name: 'selectLenses: an excluded agent (spec-compliance ran as Stage 1) is not re-dispatched',
    fn: () => {
      const r = rs.selectLenses(['x.go'], {
        agents: [...AGENTS, { name: 'spec-compliance-review', scope: 'always', model: 'sonnet' }],
        exclude: ['spec-compliance-review'],
      });
      assert.ok(!names(r).includes('spec-compliance-review'));
    },
  },
  {
    name: 'loadAgents: an unreadable agent file stays include-biased and is reported',
    fn: () => {
      const dir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'rs-'));
      fs.writeFileSync(path.join(dir, 'good-review.md'), '---\nname: good-review\nscope: "**/*.go"\nmodel: haiku\ncontext_needs: diff-only\n---\nbody\n');
      fs.writeFileSync(path.join(dir, 'broken-review.md'), 'no frontmatter here\n');
      const { agents, warnings } = rs.loadAgents(dir);
      const broken = agents.find(a => a.name === 'broken-review');
      assert.equal(broken.scope, 'always', 'an undeclarable agent must default to always, not to never');
      assert.ok(warnings.some(w => w.includes('broken-review')));
    },
  },
  {
    name: 'loadAgents: an unreadable directory warns and never throws',
    fn: () => {
      const { agents, warnings } = rs.loadAgents('/nonexistent/agents/dir');
      assert.deepEqual(agents, []);
      assert.ok(warnings.some(w => w.startsWith('unreadable-agents-dir')));
    },
  },
  {
    name: 'loadAgents: parses the real agent roster shipped in this repo',
    fn: () => {
      const { agents, warnings } = rs.loadAgents(path.join(REPO, 'agents'));
      assert.deepEqual(warnings, [], `real roster must parse cleanly: ${warnings.join(', ')}`);
      assert.ok(agents.length >= 10);
      const a11y = agents.find(a => a.name === 'a11y-review');
      assert.ok(Array.isArray(a11y.scope) && a11y.scope.includes('**/*.tsx'));
      assert.equal(agents.find(a => a.name === 'test-review').scope, 'always');
    },
  },
  {
    name: 'selectLenses: emits the contract schema and carries warnings through',
    fn: () => {
      const r = rs.selectLenses(['x.go'], { agents: AGENTS, warnings: ['unreadable-agent-file:z'] });
      assert.equal(r.schema, 'review-scope/v1');
      assert.ok(r.warnings.includes('unreadable-agent-file:z'));
    },
  },

  // --- scope growth (closing-pass escape hatch) -----------------------------
  {
    name: 'scopeGrowth: a fix confined to reviewed files did not grow scope',
    fn: () => {
      const r = rs.scopeGrowth(['a.go', 'b.go'], ['a.go']);
      assert.equal(r.grew, false);
      assert.deepEqual(r.outside, []);
    },
  },
  {
    name: 'scopeGrowth: a fix touching a file the panel never reviewed grew scope',
    fn: () => {
      const r = rs.scopeGrowth(['a.go'], ['a.go', 'c.go']);
      assert.equal(r.grew, true);
      assert.deepEqual(r.outside, ['c.go']);
    },
  },
  {
    name: 'scopeGrowth: missing inputs are treated as growth (fail-safe toward a full re-dispatch)',
    fn: () => {
      assert.equal(rs.scopeGrowth(null, ['a.go']).grew, true);
      assert.equal(rs.scopeGrowth(['a.go'], null).grew, true);
    },
  },

  // --- wiring ---------------------------------------------------------------
  {
    name: '/review dispatches Stage 2 from the resolver and re-panels when scope grows',
    fn: () => {
      const review = fs.readFileSync(path.join(REPO, 'skills', 'review', 'SKILL.md'), 'utf8');
      assert.ok(review.includes('review-scope.js'), '/review must run the resolver');
      assert.ok(/scope grew|scope-growth|scopeGrowth/i.test(review), '/review must state the scope-growth escape hatch');
      assert.ok(
        /include-biased|when in doubt.*include/is.test(review),
        '/review must keep the resolver include-biased',
      );
    },
  },

  // --- CLI seam -------------------------------------------------------------
  {
    name: 'CLI: select over the real roster prints the contract and exits 0',
    fn: () => {
      const cp = require('node:child_process');
      const r = cp.spawnSync(process.execPath, [
        path.join(REPO, 'hooks', 'lib', 'review-scope.js'), 'select', 'internal/pay/refund.go',
      ], { encoding: 'utf8' });
      assert.equal(r.status, 0, r.stderr);
      const out = JSON.parse(r.stdout);
      assert.equal(out.schema, 'review-scope/v1');
      assert.ok(out.selected.some(a => a.name === 'concurrency-review'), 'a .go file must reach the Go lenses');
      assert.ok(!out.selected.some(a => a.name === 'spec-compliance-review'), 'Stage 1 agent must be excluded');
    },
  },
  {
    name: 'CLI: --files-from reads a path list; a bad subcommand or path is exit 1',
    fn: () => {
      const os = require('node:os');
      const cp = require('node:child_process');
      const bin = path.join(REPO, 'hooks', 'lib', 'review-scope.js');
      const list = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rs-')), 'files.txt');
      fs.writeFileSync(list, 'app/ui/Button.tsx\n\n');
      const ok = cp.spawnSync(process.execPath, [bin, 'select', '--files-from', list], { encoding: 'utf8' });
      assert.equal(ok.status, 0, ok.stderr);
      assert.ok(JSON.parse(ok.stdout).selected.some(a => a.name === 'a11y-review'));
      assert.equal(cp.spawnSync(process.execPath, [bin, 'nope'], { encoding: 'utf8' }).status, 1);
      assert.equal(cp.spawnSync(process.execPath, [bin, 'select', '--files-from', '/nope/x'], { encoding: 'utf8' }).status, 1);
    },
  },

  {
    name: 'CLI: scope-growth compares two path lists; an unreadable list fails safe to grew=true',
    fn: () => {
      const os = require('node:os');
      const cp = require('node:child_process');
      const bin = path.join(REPO, 'hooks', 'lib', 'review-scope.js');
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rs-'));
      const panel = path.join(dir, 'panel.txt');
      const fix = path.join(dir, 'fix.txt');
      fs.writeFileSync(panel, 'a.go\nb.go\n');
      fs.writeFileSync(fix, 'a.go\nc.go\n');
      const run = (...args) => cp.spawnSync(process.execPath, [bin, 'scope-growth', ...args], { encoding: 'utf8' });

      const grew = run('--panel', panel, '--fix', fix);
      assert.equal(grew.status, 0, grew.stderr);
      assert.deepEqual(JSON.parse(grew.stdout), { grew: true, outside: ['c.go'] });

      const same = run('--panel', panel, '--fix', panel);
      assert.equal(JSON.parse(same.stdout).grew, false);

      const missing = run('--panel', '/nope/x', '--fix', fix);
      assert.equal(missing.status, 0, 'an unreadable list is an answer, not a usage error');
      assert.equal(JSON.parse(missing.stdout).grew, true);

      assert.equal(run('--panel', panel).status, 1, 'a missing flag is a usage error');
    },
  },
];
