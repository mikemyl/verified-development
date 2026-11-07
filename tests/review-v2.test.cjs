'use strict';

/**
 * Prompt anchors for the v2 review layer: /review, the lean /plan, /map, and
 * the three plan critics.
 *
 * What v2 changed and why (measured on keros-platform / keros-web, Sep–Oct 2026):
 *   - the review agents found the would-ship defects (19 of 25 errors in one
 *     session) at 3–8% of session tokens — keep them;
 *   - 2–3 self-initiated re-review rounds per fix, gates re-run after the
 *     fixes, and a11y/complexity on one-line diffs were the review-side waste
 *     — one verification round on the fix delta, size-gated lenses;
 *   - 80 KB TESTING.md read 70× and 230 KB GOTCHAS.md read 53× were the
 *     context sink — test-review gets the `## Test Types` table only, and
 *     /map no longer writes append-only docs;
 *   - spec.md / plan.md were never executed and 32 of 39 features had no test
 *     citing a spec id — the plan lives in chat, scenarios are the tests.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(REPO, rel), 'utf8');
const skill = name => read(`skills/${name}/SKILL.md`);
const agent = name => read(`agents/${name}.md`);

const CRITICS = ['plan-critic-acceptance', 'plan-critic-design', 'plan-critic-strategic'];

module.exports = [
  // --- /review ----------------------------------------------------------------
  {
    name: '/review: single-stage — no spec-compliance gate, no Stage 1',
    fn: () => {
      const t = skill('review');
      assert.equal(/Stage 1/.test(t), false);
      assert.equal(/spec-compliance/.test(t), false);
    },
  },
  {
    name: '/review: resolves the panel with review-scope.js select and passes the changed-line count (size gate)',
    fn: () => {
      const t = skill('review');
      assert.match(t, /review-scope\.js select/);
      assert.match(t, /--changed-lines/);
      assert.match(t, /git diff --numstat|numstat/);
    },
  },
  {
    name: '/review: dispatches the selected lenses in one message (parallel), cheap-first is the reading order',
    fn: () => {
      const t = skill('review');
      assert.match(t, /parallel/i);
      assert.match(t, /cheap-first/);
    },
  },
  {
    name: '/review: test-review receives the extracted `## Test Types` table, never the whole TESTING.md',
    fn: () => {
      const t = skill('review');
      assert.match(t, /taxonomy\.js extract/);
      assert.match(t, /not the whole|never the whole|only the/i);
    },
  },
  {
    name: '/review: linter suppression keys come from an inline findings.js scan (no persisted store)',
    fn: () => {
      const t = skill('review');
      assert.match(t, /findings\.js scan/);
      assert.match(t, /keys only|keys-only/i);
    },
  },
  {
    name: '/review: runs the test-weakening scan and the review-integrity protocol',
    fn: () => {
      const t = skill('review');
      assert.match(t, /test-weakening\.js scan/);
      assert.match(t, /review-integrity/);
    },
  },
  {
    name: '/review: exactly one verification round on the fix delta — --max-rounds 2, narrowed payload',
    fn: () => {
      const t = skill('review');
      assert.match(t, /--max-rounds 2/);
      assert.match(t, /fix delta|fix diff/i);
      assert.match(t, /insufficient-context/);
      assert.equal(/round >= 4|round-cap.*4/i.test(t), false, 'the old four-round loop is gone');
    },
  },
  {
    name: '/review: snapshots the tree before the fix round (checkpoint.js), never a git rewind',
    fn: () => {
      const t = skill('review');
      assert.match(t, /checkpoint\.js create/);
      assert.match(t, /git-guard/);
    },
  },
  {
    name: '/review v2.3: the model writes nothing to the ledger — the Stop hook does, from the agents\' reports',
    fn: () => {
      const t = skill('review');
      assert.match(t, /ledger-writer/);
      assert.match(t, /You write nothing to it/);
      for (const gone of [/review-ledger\.js record/, /--since <that agent/, /Ledger: <n> lines/, /outcome <no-op/]) {
        assert.equal(gone.test(t), false, `must not mention ${gone}`);
      }
    },
  },
  {
    name: '/review v2.3: one restore checkpoint before the first fix, not one per agent',
    fn: () => {
      const t = skill('review');
      assert.match(t, /checkpoint\.js create --feature review --label fixes/);
      assert.equal(/--label <agent>/.test(t), false);
    },
  },
  {
    name: '/map: puts the hook-written review ledger in .gitignore',
    fn: () => {
      assert.match(skill('map'), /review-ledger\.jsonl` to `\.gitignore`/);
    },
  },
  {
    name: 'complexity-review never raises error: complexity is judgment, and judgment does not block',
    fn: () => {
      const t = agent('complexity-review');
      assert.equal(/^\|\s*error\s*\|/m.test(t), false, 'no error row in the output example');
      assert.equal(/^- `error`/m.test(t), false, 'no error rule');
      assert.match(t, /never raises `error`/);
    },
  },
  {
    name: '/review v2.4: the verify gate runs through gate-stamp.js — scoped per file, once per tree',
    fn: () => {
      const t = skill('review');
      assert.match(t, /gate-stamp\.js verify --files-from \/tmp\/changed\.txt --config \.verified\/config\.json/);
      assert.match(t, /\{files:<dir>\}/);
      assert.match(t, /not run again/);
      assert.match(t, /no gate for/);
      assert.match(t, /Verify: <command → exit code \| stamped>/, 'the report names the commands run and the files with no gate');
      assert.equal(/review-scope\.js verify/.test(t), false, 'one way to run the gate');
    },
  },
  {
    name: '/review v2.4: the fix round runs the covering tests per fix and the full gate once, after the last fix',
    fn: () => {
      const t = skill('review');
      assert.match(t, /run only the tests that cover the fix/);
      assert.match(t, /After the\s+last fix, run the step-1 `gate-stamp\.js verify` once more/);
      assert.equal(/verify command\(s\) for the\s+files you touched after each/.test(t), false);
    },
  },
  {
    name: '/review v2.4: a red gate on files the change did not touch is reported, not fixed or retried',
    fn: () => {
      assert.match(skill('review'), /another session's work in the same checkout/);
    },
  },
  {
    name: '/review v2.2: the light tier is the user\'s or the repo\'s choice, never the model\'s',
    fn: () => {
      const t = skill('review');
      assert.match(t, /--light/);
      assert.match(t, /--config \.verified\/config\.json/);
      assert.match(t, /light_max_lines/);
      assert.match(t, /Never pass `--light` on your own/);
      assert.match(t, /Panel: full \| light/);
    },
  },
  {
    name: '/review: runs the repo verify command first, with a real exit code',
    fn: () => {
      const t = skill('review');
      assert.match(t, /Justfile|Makefile|package\.json/);
      assert.match(t, /exit code/i);
    },
  },
  {
    name: '/review: reports to chat — no review.md, no doc sync, no retro, no learnings, no handoff',
    fn: () => {
      const t = skill('review');
      for (const gone of [/review\.md/, /doc sync/i, /retro/i, /learnings/i, /handoff/i, /state\.md/, /CONCERNS\.md/, /GOTCHAS\.md/]) {
        assert.equal(gone.test(t), false, `must not mention ${gone}`);
      }
    },
  },
  {
    name: '/review: a dispatch brief is additive to the agent rubric, never a substitute',
    fn: () => {
      assert.match(skill('review'), /additive, never a substitute/);
    },
  },
  {
    name: '/review: description triggers on "before commit" after a verified change',
    fn: () => {
      const t = skill('review');
      const desc = t.match(/^description:\s*"?(.+?)"?$/m)[1];
      assert.match(desc, /before commit|before committing/i);
      assert.ok(desc.length <= 100, 'description budget');
    },
  },

  // --- /plan (lean) -----------------------------------------------------------
  {
    name: '/plan: the plan lives in chat — no plan.md, no spec.md, no feature directory',
    fn: () => {
      const t = skill('plan');
      assert.match(t, /in chat|in the conversation/i);
      assert.equal(/\.verified\/features/.test(t), false);
      assert.equal(/handoff/i.test(t), false);
      assert.equal(/waves\.js|test-gate\.js/.test(t), false);
    },
  },
  {
    name: '/plan: acceptance scenarios are named as the tests that will exist, in the repo test DSL',
    fn: () => {
      const t = skill('plan');
      assert.match(t, /acceptance scenario/i);
      assert.match(t, /TESTING\.md|Test Types/);
      assert.match(t, /test name|named as the test|test that will/i);
    },
  },
  {
    name: '/plan: dispatches exactly the three critics, in one message, with the plan text in the prompt',
    fn: () => {
      const t = skill('plan');
      for (const c of CRITICS) assert.match(t, new RegExp(c));
      assert.equal(/plan-critic-ux|plan-critic-parallelization/.test(t), false);
      assert.match(t, /in the prompt|inline in the prompt|paste the plan/i);
      assert.match(t, /parallel/i);
    },
  },
  {
    name: '/plan: severity policy — error re-drafts, warning is shown, suggestion is dropped; --no-critics opt-out',
    fn: () => {
      const t = skill('plan');
      assert.match(t, /re-?draft/i);
      assert.match(t, /warning/i);
      assert.match(t, /suggestion/i);
      assert.match(t, /--no-critics/);
      assert.equal(/concerns\.md/.test(t), false);
    },
  },
  {
    name: '/plan: references the single-sourced critic rubric',
    fn: () => {
      assert.match(skill('plan'), /references\/critic-rubric\.md/);
      assert.ok(fs.existsSync(path.join(REPO, 'skills', 'plan', 'references', 'critic-rubric.md')));
    },
  },

  // --- critics ----------------------------------------------------------------
  ...CRITICS.map(c => ({
    name: `${c}: reads the plan from its prompt, carries the shared rubric, bounds output`,
    fn: () => {
      const t = agent(c);
      assert.match(t, /in your prompt|in the prompt/i);
      assert.equal(/\.verified\/features/.test(t), false);
      for (const anchor of ['severity:', 'finding schema', 'tied_to']) {
        assert.ok(t.toLowerCase().includes(anchor), `${c}: missing rubric anchor "${anchor}"`);
      }
      assert.match(t, /≤ 10|at most 10|max(imum)? 10/i);
    },
  })),
  {
    name: 'critic rubric: the three critic files carry the same rubric block as the reference (drift guard)',
    fn: () => {
      const ref = read('skills/plan/references/critic-rubric.md');
      const block = ref.match(/```\n(severity:[\s\S]*?)```/);
      assert.ok(block, 'critic-rubric.md must contain the fenced severity block');
      for (const c of CRITICS) assert.ok(agent(c).includes(block[1].trim()), `${c}: rubric block drifted from critic-rubric.md`);
    },
  },

  // --- /map -------------------------------------------------------------------
  {
    name: '/map: writes .verified/codebase/TESTING.md only — no GOTCHAS/CONCERNS/ARCHITECTURE docs',
    fn: () => {
      const t = skill('map');
      assert.match(t, /TESTING\.md/);
      for (const gone of [/GOTCHAS/, /CONCERNS\.md/, /ARCHITECTURE\.md/, /STACK\.md/, /STRUCTURE\.md/, /INTEGRATIONS\.md/, /CONVENTIONS\.md/]) {
        assert.equal(gone.test(t), false, `must not write ${gone}`);
      }
    },
  },
  {
    name: '/map: offers the project-rules template for CLAUDE.md',
    fn: () => {
      assert.match(skill('map'), /templates\/project-rules\.md/);
    },
  },

  // --- correctness-review no longer points at a spec gate --------------------
  {
    name: 'correctness-review: defines its lens without reference to a spec-compliance agent',
    fn: () => {
      const t = agent('correctness-review');
      assert.equal(/spec-compliance/.test(t), false);
      assert.match(t, /evident intent|evidently intends/i);
    },
  },
];
