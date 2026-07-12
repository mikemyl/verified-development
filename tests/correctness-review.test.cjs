'use strict';

/**
 * Prompt-anchor tests for the correctness-review agent (agents/correctness-review.md)
 * and its wiring into /review Stage 2. Locks the load-bearing prose so a future
 * edit can't silently drop the five detect categories, the evident-intent
 * discipline that keeps the agent from becoming noise, or the dispatch row.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.resolve(__dirname, '..');
const agent = () => fs.readFileSync(path.join(REPO, 'agents', 'correctness-review.md'), 'utf8');
const reviewSkill = () => fs.readFileSync(path.join(REPO, 'skills', 'review', 'SKILL.md'), 'utf8');

module.exports = [
  {
    name: 'correctness-review: frontmatter declares name, a model, and read-only tools',
    fn: () => {
      const t = agent();
      assert.match(t, /^name:\s*correctness-review$/m);
      assert.match(t, /^model:\s*(opus|sonnet|haiku)$/m);
      assert.match(t, /^tools:\s*Read, Grep, Glob/m);
    },
  },
  {
    name: 'correctness-review: description is present and within the 100-char budget',
    fn: () => {
      const m = agent().match(/^description:\s*"([^"]*)"/m);
      assert.ok(m, 'quoted description present');
      assert.ok(m[1].length <= 100, `description ${m[1].length} chars > 100`);
    },
  },
  {
    name: 'correctness-review: documents all five detect categories',
    fn: () => {
      const t = agent().toLowerCase();
      assert.match(t, /assignment/, 'missing/incomplete assignment');
      assert.match(t, /interpolat/, 'literal-vs-interpolation');
      assert.match(t, /guard/, 'missing guard/validation');
      assert.match(t, /(off-by-one|boundary)/, 'boundary/off-by-one');
      assert.match(t, /(inverted|incomplete conditional)/, 'inverted/incomplete conditional');
    },
  },
  {
    name: 'correctness-review: keeps the evident-intent drop discipline (anti-noise)',
    fn: () => {
      const t = agent();
      assert.match(t, /evident intent/i, 'names the evident-intent concept');
      // The discipline that separates this from a hallucination machine: a
      // finding with no citable evident intent is DROPPED, not downgraded.
      assert.match(t, /drop/i, 'no-articulable-intent findings are dropped');
    },
  },
  {
    name: 'correctness-review: distinguishes itself from spec-compliance-review',
    fn: () => {
      // Intent inferred from the CODE (name/comment/sibling), not a written spec.
      assert.match(agent(), /spec-compliance/i);
    },
  },
  {
    name: 'correctness-review: emits our Markdown Status + Findings format, not raw JSON',
    fn: () => {
      const t = agent();
      assert.match(t, /\*\*Status:\*\*\s*PASS/i);
      assert.match(t, /## Findings/);
    },
  },
  {
    name: 'wiring: correctness-review runs on any source via scope: always',
    fn: () => {
      // Post scope-refactor, dispatch is self-declared — the agent runs on any
      // source because it declares scope: always, not via a hardcoded table row.
      assert.match(agent(), /^scope:\s*always$/m);
    },
  },
  {
    name: 'wiring: /review Stage 2 is declaration-driven, not a hardcoded table',
    fn: () => {
      const t = reviewSkill();
      assert.match(t, /self-declared/i, 'Stage 2 reads agent scope: declarations');
      assert.match(t, /context_needs/, 'Stage 2 honors context_needs');
      // The old per-agent dispatch table must be gone (that was the drift source).
      assert.doesNotMatch(t, /\| Any source code \|/, 'hardcoded dispatch table removed');
    },
  },
];
