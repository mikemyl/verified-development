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

// The keros-platform MPTCP step (2026-11-06): Ansible + shell drills + a Justfile recipe.
const MPTCP_STEP = [
  'Justfile',
  'infra/ansible/master-playbook.yml',
  'infra/ansible/5-host-security.yml',
  'infra/drills/lib.sh',
  'infra/drills/mptcp-off.sh',
];

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
    name: 'selectLenses: an agent the caller excludes (already ran) is skipped with a reason, not re-dispatched',
    fn: () => {
      const r = rs.selectLenses(['x.go'], {
        agents: [...AGENTS, { name: 'already-ran-review', scope: 'always', model: 'sonnet' }],
        exclude: ['already-ran-review'],
      });
      assert.ok(!names(r).includes('already-ran-review'));
      assert.ok(r.skipped.some(s => s.name === 'already-ran-review' && s.reason === 'excluded-by-caller'));
    },
  },
  {
    name: 'selectLenses: nothing is excluded by default (no spec-compliance stage exists any more)',
    fn: () => {
      const r = rs.selectLenses(['x.go'], { agents: AGENTS });
      assert.equal(r.skipped.some(s => s.reason === 'excluded-by-caller'), false);
    },
  },

  // --- size gate (min_changed_lines) -----------------------------------------
  {
    name: 'parseAgentFile: min_changed_lines is parsed as a number; absent → null',
    fn: () => {
      const gated = rs.parseAgentFile('complexity-review', '---\nname: complexity-review\nscope: always\nmodel: haiku\nmin_changed_lines: 40\n---\n');
      assert.equal(gated.min_changed_lines, 40);
      const open = rs.parseAgentFile('test-review', '---\nname: test-review\nscope: always\nmodel: sonnet\n---\n');
      assert.equal(open.min_changed_lines, null);
      const junk = rs.parseAgentFile('x-review', '---\nname: x-review\nscope: always\nmin_changed_lines: forty\n---\n');
      assert.equal(junk.min_changed_lines, null, 'an unparseable threshold is no threshold (include-biased)');
    },
  },
  {
    name: 'selectLenses: a lens declaring min_changed_lines is skipped (reason small-diff) below the threshold',
    fn: () => {
      const agents = [...AGENTS, { name: 'gated-review', scope: 'always', model: 'haiku', min_changed_lines: 40 }];
      const r = rs.selectLenses(['x.go'], { agents, changedLines: 12 });
      assert.ok(!names(r).includes('gated-review'));
      assert.ok(r.skipped.some(s => s.name === 'gated-review' && s.reason === 'small-diff'));
      assert.ok(names(r).includes('test-review'), 'ungated lenses are unaffected');
    },
  },
  {
    name: 'selectLenses: at or above the threshold the gated lens runs',
    fn: () => {
      const agents = [...AGENTS, { name: 'gated-review', scope: 'always', model: 'haiku', min_changed_lines: 40 }];
      assert.ok(names(rs.selectLenses(['x.go'], { agents, changedLines: 40 })).includes('gated-review'));
      assert.ok(names(rs.selectLenses(['x.go'], { agents, changedLines: 400 })).includes('gated-review'));
    },
  },
  {
    name: 'selectLenses: an unknown changed-line count keeps every gated lens and warns (include-biased)',
    fn: () => {
      const agents = [...AGENTS, { name: 'gated-review', scope: 'always', model: 'haiku', min_changed_lines: 40 }];
      for (const changedLines of [undefined, null, 'many', NaN]) {
        const r = rs.selectLenses(['x.go'], { agents, changedLines });
        assert.ok(names(r).includes('gated-review'), `changedLines=${changedLines} must not drop a lens`);
        assert.ok(r.warnings.some(w => w.startsWith('changed-lines-unknown')), `changedLines=${changedLines} must warn`);
      }
      const known = rs.selectLenses(['x.go'], { agents, changedLines: 100 });
      assert.equal(known.warnings.some(w => w.startsWith('changed-lines-unknown')), false);
    },
  },
  {
    name: 'selectLenses: the size gate applies to glob-scoped lenses too',
    fn: () => {
      const agents = [...AGENTS, { name: 'ui-gated-review', scope: ['**/*.tsx'], model: 'sonnet', min_changed_lines: 40 }];
      const small = rs.selectLenses(['App.tsx'], { agents, changedLines: 3 });
      assert.ok(small.skipped.some(s => s.name === 'ui-gated-review' && s.reason === 'small-diff'));
      const big = rs.selectLenses(['App.tsx'], { agents, changedLines: 80 });
      assert.ok(names(big).includes('ui-gated-review'));
    },
  },
  {
    name: 'real roster: complexity-review and a11y-review declare a size gate; correctness/test/security do not',
    fn: () => {
      const { agents } = rs.loadAgents(path.join(REPO, 'agents'));
      const by = name => agents.find(a => a.name === name);
      assert.ok(by('complexity-review').min_changed_lines > 0);
      assert.ok(by('a11y-review').min_changed_lines > 0);
      for (const n of ['correctness-review', 'test-review', 'security-review']) {
        assert.equal(by(n).min_changed_lines, null, `${n} must run on every diff size`);
      }
    },
  },
  {
    name: 'CLI: select accepts --changed-lines and reports small-diff skips',
    fn: () => {
      const os = require('node:os');
      const cp = require('node:child_process');
      const bin = path.join(REPO, 'hooks', 'lib', 'review-scope.js');
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rs-'));
      fs.writeFileSync(path.join(dir, 'gated-review.md'), '---\nname: gated-review\nscope: always\nmodel: haiku\nmin_changed_lines: 40\n---\n');
      const list = path.join(dir, 'files.txt');
      fs.writeFileSync(list, 'x.go\n');
      const run = (...args) => cp.spawnSync(process.execPath, [bin, 'select', '--files-from', list, '--agents-dir', dir, ...args], { encoding: 'utf8' });
      const small = run('--changed-lines', '5');
      assert.equal(small.status, 0, small.stderr);
      assert.ok(JSON.parse(small.stdout).skipped.some(s => s.name === 'gated-review' && s.reason === 'small-diff'));
      const big = run('--changed-lines', '90');
      assert.ok(JSON.parse(big.stdout).selected.some(s => s.name === 'gated-review'));
      const none = run();
      assert.ok(JSON.parse(none.stdout).selected.some(s => s.name === 'gated-review'), 'no count → include');
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
      assert.ok(agents.length >= 7);
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

  // --- v2.2: proportional review -------------------------------------------
  // Evidence (keros-platform 2026-11-06, the MPTCP step): an Ansible + shell
  // change waited ~4 min on the Go monorepo's `just lint && just test-all`, and
  // complexity-review returned 8 findings on yaml/sh, none about complexity. The
  // security agent found the defect that mattered (the sysctl did not close the
  // exposure). So: scope the verify gate and the lenses by file kind, and offer
  // a light tier — but never let the authoring model choose to skip review.
  {
    name: 'v2.2 lens fit: complexity-review does not run on an infra-only change (yaml, sh, Justfile)',
    fn: () => {
      const r = rs.selectLenses(MPTCP_STEP, { changedLines: 83 });
      const skip = r.skipped.find(s => s.name === 'complexity-review');
      assert.ok(skip, 'complexity-review must be skipped');
      assert.equal(skip.reason, 'no-matching-file');
      for (const n of ['correctness-review', 'security-review', 'test-review']) {
        assert.ok(names(r).includes(n), `${n} must still run on infra`);
      }
    },
  },
  {
    name: 'v2.2 lens fit: complexity-review still runs on a large source-code change',
    fn: () => {
      for (const f of ['internal/pay/refund.go', 'src/app.ts', 'ui/Button.tsx', 'hooks/lib/x.js', 'svc/a.py', 'A.java']) {
        assert.ok(names(rs.selectLenses([f], { changedLines: 83 })).includes('complexity-review'), f);
      }
    },
  },
  {
    name: 'v2.2 lens fit: complexity-review scope and SOURCE_EXTENSIONS name the same extensions',
    fn: () => {
      const { agents } = rs.loadAgents(path.join(REPO, 'agents'));
      const scope = agents.find(a => a.name === 'complexity-review').scope;
      assert.ok(Array.isArray(scope), 'complexity-review must be glob-scoped');
      const fromScope = new Set(scope.map(g => g.replace(/^\*\*\/\*/, '')));
      assert.deepEqual([...fromScope].sort(), [...rs.SOURCE_EXTENSIONS].sort());
    },
  },
  {
    name: 'v2.2 light tier: --light on an infra change dispatches security-review only',
    fn: () => {
      const r = rs.selectLenses(MPTCP_STEP, { changedLines: 83, light: true });
      assert.deepEqual(names(r), ['security-review']);
      assert.equal(r.tier, 'light');
      assert.equal(r.tier_reason, 'requested');
      for (const n of ['correctness-review', 'test-review']) {
        assert.equal(r.skipped.find(s => s.name === n).reason, 'light-tier');
      }
    },
  },
  {
    name: 'v2.2 light tier: --light on source code dispatches correctness-review; mixed adds security',
    fn: () => {
      assert.deepEqual(names(rs.selectLenses(['internal/pay/refund.go'], { changedLines: 3, light: true })), ['correctness-review']);
      assert.deepEqual(
        names(rs.selectLenses(['internal/pay/refund.go', 'deploy/app.yml'], { changedLines: 3, light: true })),
        ['correctness-review', 'security-review'],
      );
    },
  },
  {
    name: 'v2.2 light tier: a light docs-only diff still gets security-review (prose is the injection vector)',
    fn: () => {
      assert.deepEqual(names(rs.selectLenses(['docs/guide.md'], { changedLines: 4, light: true })), ['security-review']);
    },
  },
  {
    name: 'v2.2 auto-light: opt-in via light_max_lines; only a small diff with no source code qualifies',
    fn: () => {
      const cfg = { lightMaxLines: 10 };
      const small = rs.selectLenses(['infra/ansible/5-host-security.yml'], { changedLines: 6, ...cfg });
      assert.equal(small.tier, 'light');
      assert.equal(small.tier_reason, 'auto:no-source-code<=10-lines');
      assert.deepEqual(names(small), ['security-review']);
      assert.equal(rs.selectLenses(['infra/ansible/5-host-security.yml'], { changedLines: 11, ...cfg }).tier, 'full');
      assert.equal(rs.selectLenses(['internal/pay/refund.go'], { changedLines: 2, ...cfg }).tier, 'full', 'source code never auto-lightens');
      assert.equal(rs.selectLenses(['infra/a.yml'], { changedLines: null, ...cfg }).tier, 'full', 'unknown size never auto-lightens');
      assert.equal(rs.selectLenses([], { changedLines: 1, ...cfg }).tier, 'full', 'an empty list never auto-lightens');
      assert.equal(rs.selectLenses(['infra/a.yml'], { changedLines: 1 }).tier, 'full', 'no opt-in → full');
    },
  },
  {
    name: 'v2.2 auto-light: prompt files (CLAUDE.md, skills/, agents/) are behaviour and never auto-lighten',
    fn: () => {
      for (const f of ['CLAUDE.md', 'skills/review/SKILL.md', 'agents/test-review.md', '.claude/settings.json']) {
        assert.equal(rs.selectLenses([f], { changedLines: 1, lightMaxLines: 10 }).tier, 'full', f);
      }
    },
  },
  {
    name: 'v2.2 scoped verify: a string verify covers every changed file (unchanged behaviour)',
    fn: () => {
      const v = rs.resolveVerify('just verify', MPTCP_STEP);
      assert.equal(v.source, 'string');
      assert.deepEqual(v.commands, [{ command: 'just verify', files: MPTCP_STEP }]);
      assert.deepEqual(v.uncovered, []);
    },
  },
  {
    name: 'v2.2 scoped verify: a glob map routes each file to its first matching command; unmatched files get no gate',
    fn: () => {
      const v = rs.resolveVerify(
        { '**/*.go, go.mod, go.sum': 'just verify', 'infra/**': 'just infra-check' },
        [...MPTCP_STEP, 'str/main.go'],
      );
      assert.equal(v.source, 'map');
      assert.deepEqual(v.commands.map(c => c.command), ['just verify', 'just infra-check']);
      assert.deepEqual(v.commands[0].files, ['str/main.go']);
      assert.equal(v.commands[1].files.length, 4);
      assert.deepEqual(v.uncovered, ['Justfile']);
    },
  },
  {
    name: 'v2.2 scoped verify: the infra-only change does not run the Go gate',
    fn: () => {
      const v = rs.resolveVerify({ '**/*.go, go.mod, go.sum, **/*.templ': 'just verify', 'infra/**, Justfile': 'just infra-check' }, MPTCP_STEP);
      assert.deepEqual(v.commands.map(c => c.command), ['just infra-check']);
      assert.deepEqual(v.uncovered, []);
    },
  },
  {
    name: 'v2.2 scoped verify: a "**" key is the fallback when listed last',
    fn: () => {
      const v = rs.resolveVerify({ 'infra/**': 'just infra-check', '**': 'just verify' }, ['infra/a.yml', 'README.md']);
      assert.deepEqual(v.commands, [
        { command: 'just infra-check', files: ['infra/a.yml'] },
        { command: 'just verify', files: ['README.md'] },
      ]);
    },
  },
  {
    name: 'v2.2 scoped verify: absent or malformed config falls back to discovery, with a warning when malformed',
    fn: () => {
      assert.equal(rs.resolveVerify(undefined, ['a.go']).source, 'none');
      for (const bad of [42, ['just verify'], {}, { 'a/**': 7 }, '  ']) {
        const v = rs.resolveVerify(bad, ['a.go']);
        assert.equal(v.source, 'invalid', JSON.stringify(bad));
        assert.deepEqual(v.commands, []);
        assert.ok(v.warnings.length > 0);
      }
    },
  },
  {
    name: 'v2.2 CLI: verify and select read .verified/config.json (verify map, review.light_max_lines) and --light',
    fn: () => {
      const os = require('node:os');
      const cp = require('node:child_process');
      const bin = path.join(REPO, 'hooks', 'lib', 'review-scope.js');
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rs-'));
      const list = path.join(dir, 'files.txt');
      fs.writeFileSync(list, MPTCP_STEP.join('\n') + '\n');
      const cfg = path.join(dir, 'config.json');
      fs.writeFileSync(cfg, JSON.stringify({ verify: { '**/*.go': 'just verify', 'infra/**, Justfile': 'just infra-check' }, review: { light_max_lines: 100 } }));
      const run = (...a) => cp.spawnSync(process.execPath, [bin, ...a], { encoding: 'utf8' });

      const v = run('verify', '--files-from', list, '--config', cfg);
      assert.equal(v.status, 0, v.stderr);
      assert.deepEqual(JSON.parse(v.stdout).commands.map(c => c.command), ['just infra-check']);

      const auto = JSON.parse(run('select', '--files-from', list, '--changed-lines', '83', '--config', cfg).stdout);
      assert.equal(auto.tier, 'light');
      assert.deepEqual(auto.selected.map(a => a.name), ['security-review']);

      const forced = JSON.parse(run('select', '--files-from', list, '--changed-lines', '83', '--light').stdout);
      assert.equal(forced.tier, 'light');

      const full = JSON.parse(run('select', '--files-from', list, '--changed-lines', '83').stdout);
      assert.equal(full.tier, 'full');

      const missing = run('verify', '--files-from', list, '--config', path.join(dir, 'nope.json'));
      assert.equal(missing.status, 0, 'no config is an answer (discovery), not an error');
      assert.equal(JSON.parse(missing.stdout).source, 'none');
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
    name: '/review resolves its panel from the resolver with the diff size, and keeps it include-biased',
    fn: () => {
      const review = fs.readFileSync(path.join(REPO, 'skills', 'review', 'SKILL.md'), 'utf8');
      assert.ok(review.includes('review-scope.js'), '/review must run the resolver');
      assert.ok(review.includes('--changed-lines'), '/review must pass the diff size to the size gate');
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
      assert.equal(out.skipped.some(s => s.reason === 'excluded-by-caller'), false, 'nothing is excluded by default');
      assert.equal(typeof out.changed_lines, 'object', 'no --changed-lines → null, never a guessed count');
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
