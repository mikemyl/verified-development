'use strict';

/**
 * v2 surface guard.
 *
 * v2.0.0 cut the orchestration layer (specify/plan-files/implement/verify/quick,
 * executors, waves, handoff/state, the spec-compliance gate, doc sync, retro)
 * and kept the review layer. This file pins the shipped surface so a cut piece
 * cannot creep back in by accident, and so no surviving prose points at a file
 * that no longer exists (a dangling pointer in a skill is a runtime error the
 * model hits mid-review).
 *
 * Fails for a reason other than "I changed the code I just wrote": someone adds
 * a skill without declaring it here, re-introduces an executor, or leaves a
 * `/specify` reference in a doc.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.resolve(__dirname, '..');

const SKILLS = [
  'ci-debugging',
  'domain-driven-design',
  'front-end-testing',
  'functional',
  'hexagonal-architecture',
  'install-hooks',
  'map',
  'mutation-testing',
  'plan',
  'react-testing',
  'review',
  'tdd-go',
  'test-audit',
  'test-design-reviewer',
  'testing',
  'typescript-strict',
];

const AGENTS = [
  'a11y-review',
  'complexity-review',
  'concurrency-review',
  'correctness-review',
  'error-handling-review',
  'plan-critic-acceptance',
  'plan-critic-design',
  'plan-critic-strategic',
  'security-review',
  'test-review',
];

const LIBS = [
  'checkpoint.js',
  'finding-signature.js',
  'findings.js',
  'git-guard.js',
  'lang-loader.js',
  'review-ledger.js',
  'review-scope.js',
  'taxonomy.js',
  'test-corpus.js',
  'test-types-seed.md',
  'test-weakening.js',
];

const HOOK_FILES = ['context-monitor.js', 'git-guard.js', 'hooks.json', 'setup-statusline.sh', 'statusline.js'];

/** Names that must not be referenced anywhere in the shipped prose or code. */
const DANGLING = [
  /\bhandoff\.js\b/,
  /\bwaves\.js\b/,
  /\btest-gate\.js\b/,
  /\bstate\.js\b/,
  /\bbdd-convention\.js\b/,
  /\brepair-routing\.js\b/,
  /\bfindings-store\.js\b/,
  /\bsession-start\.sh\b/,
  /(^|[^\w`])\/specify\b/,
  /(^|[^\w`])\/implement\b/,
  /(^|[^\w`])\/verify\b/,
  /(^|[^\w`])\/quick\b/,
  /(^|[^\w`])\/pause\b/,
  /(^|[^\w`])\/continue\b/,
  /(^|[^\w`])\/progress\b/,
  /(^|[^\w`])\/update-plan\b/,
  /(^|[^\w`])\/session-report\b/,
  /(^|[^\w`])\/assess\b/,
  /(^|[^\w`])\/ui-spec\b/,
  /(^|[^\w`])\/init\b/,
  /\bspec-compliance-review\b/,
  /\bdoc-review\b/,
  /\bdomain-review\b/,
  /\brefactoring-review\b/,
  /\bdead-code-review\b/,
  /\binterface-design-review\b/,
  /\bdocs-guardian\b/,
  /\buse-case-data-patterns\b/,
  /\bplan-critic-ux\b/,
  /\bplan-critic-parallelization\b/,
  /verified-development:executor/,
  /\bagents\/executor\.md\b/,
  /\.verified\/features\//,
  /\.verified\/state\.md/,
  /\.verified\/learnings\.md/,
  /\bhandoff\.json\b/,
  /\bretro\.md\b/,
  /\.verified\/decisions\//,
  /\bspec-compliance\b/,
  /Specification-first/i,
  /two-stage review/,
  /feature[:/]phase/,
];

const PROSE_ROOTS = ['skills', 'agents', 'hooks', 'docs', 'templates', '.claude-plugin'];
const PROSE_FILES = ['README.md', 'CLAUDE.md'];

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (/\.(md|js|sh|json)$/.test(entry.name)) out.push(p);
  }
  return out;
}

function listDir(dir, filter) {
  return fs.readdirSync(dir).filter(filter).sort();
}

module.exports = [
  {
    name: 'surface: the shipped skills are exactly the declared v2 set',
    fn: () => {
      const actual = listDir(path.join(REPO, 'skills'), f => fs.statSync(path.join(REPO, 'skills', f)).isDirectory());
      assert.deepEqual(actual, [...SKILLS].sort());
    },
  },
  {
    name: 'surface: the shipped agents are exactly the declared v2 set',
    fn: () => {
      const actual = listDir(path.join(REPO, 'agents'), f => f.endsWith('.md')).map(f => f.replace(/\.md$/, ''));
      assert.deepEqual(actual, [...AGENTS].sort());
    },
  },
  {
    name: 'surface: hooks/lib holds exactly the declared libs (plus the findings/ and lang/ adapter dirs)',
    fn: () => {
      const dir = path.join(REPO, 'hooks', 'lib');
      const files = listDir(dir, f => fs.statSync(path.join(dir, f)).isFile());
      const dirs = listDir(dir, f => fs.statSync(path.join(dir, f)).isDirectory());
      assert.deepEqual(files, [...LIBS].sort());
      assert.deepEqual(dirs, ['findings', 'lang']);
    },
  },
  {
    name: 'surface: hooks/ top level holds exactly the declared hook files (no session-start banner, no schemas)',
    fn: () => {
      const dir = path.join(REPO, 'hooks');
      const files = listDir(dir, f => fs.statSync(path.join(dir, f)).isFile());
      assert.deepEqual(files, [...HOOK_FILES].sort());
      assert.equal(fs.existsSync(path.join(dir, 'schemas')), false);
    },
  },
  {
    name: 'surface: hooks.json registers git-guard, context-monitor and the statusline setup — nothing else',
    fn: () => {
      const hooks = JSON.parse(fs.readFileSync(path.join(REPO, 'hooks', 'hooks.json'), 'utf8')).hooks;
      assert.deepEqual(Object.keys(hooks).sort(), ['PostToolUse', 'PreToolUse', 'Setup']);
      const cmds = Object.values(hooks).flat().flatMap(h => h.hooks.map(x => x.command));
      assert.ok(cmds.some(c => c.includes('git-guard.js')));
      assert.ok(cmds.some(c => c.includes('context-monitor.js')));
      assert.ok(cmds.some(c => c.includes('setup-statusline.sh')));
      assert.equal(cmds.some(c => c.includes('session-start')), false);
    },
  },
  {
    name: 'surface: no plans/ directory and no per-feature artifacts in this repo\'s own .verified/',
    fn: () => {
      assert.equal(fs.existsSync(path.join(REPO, 'plans')), false);
      const v = path.join(REPO, '.verified');
      assert.deepEqual(listDir(v, () => true), ['codebase', 'config.json']);
      assert.deepEqual(listDir(path.join(v, 'codebase'), () => true), ['TESTING.md']);
    },
  },
  {
    name: 'surface: the project-rules template ships the four house rules',
    fn: () => {
      const t = fs.readFileSync(path.join(REPO, 'templates', 'project-rules.md'), 'utf8');
      assert.match(t, /review agents/i, 'review required');
      assert.match(t, /exit code/i, 'real exit codes');
      assert.match(t, /fail for a reason other than/i, 'the test-must-fail rule');
      assert.match(t, /checkout|stash|restore/i, 'no work-discarding git commands');
    },
  },
  {
    name: 'surface: statusline no longer reads .verified/state.md',
    fn: () => {
      const s = fs.readFileSync(path.join(REPO, 'hooks', 'statusline.js'), 'utf8');
      assert.equal(/state\.md/.test(s), false);
    },
  },
  {
    name: 'drift: no shipped prose, code or doc references a cut skill, agent, lib or artifact',
    fn: () => {
      const files = [
        ...PROSE_ROOTS.flatMap(r => (fs.existsSync(path.join(REPO, r)) ? walk(path.join(REPO, r)) : [])),
        ...PROSE_FILES.map(f => path.join(REPO, f)),
      ];
      const offenders = [];
      for (const file of files) {
        const text = fs.readFileSync(file, 'utf8');
        for (const re of DANGLING) {
          const m = text.match(re);
          if (m) offenders.push(`${path.relative(REPO, file)}: ${re}`);
        }
      }
      assert.deepEqual(offenders, [], `dangling references:\n  ${offenders.join('\n  ')}`);
    },
  },
  {
    name: 'manifests: both declare 2.0.0 and the same version',
    fn: () => {
      const plugin = JSON.parse(fs.readFileSync(path.join(REPO, '.claude-plugin', 'plugin.json'), 'utf8'));
      const market = JSON.parse(fs.readFileSync(path.join(REPO, '.claude-plugin', 'marketplace.json'), 'utf8'));
      assert.equal(plugin.version, '2.0.0');
      assert.equal(market.plugins[0].version, plugin.version);
    },
  },
];
