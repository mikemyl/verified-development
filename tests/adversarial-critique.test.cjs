'use strict';

/**
 * Tests for adversarial-critique feature.
 *
 *   1. Each critic agent file contains the rubric block, an Inputs section,
 *      and an Output schema reference.
 *   2. UX critic file documents its conditional spawn rule.
 *   3. /specify SKILL references challenge.md and discussion.md.
 *   4. /plan SKILL references all four critics, concerns.md, and severity policy.
 *   5. Severity-policy contract: a synthetic findings array routes correctly
 *      under the documented policy (error → auto-resolved, warning → surfaced,
 *      suggestion → recorded).
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.resolve(__dirname, '..');

function readSkill(name) {
  return fs.readFileSync(path.join(REPO, 'skills', name, 'SKILL.md'), 'utf8');
}

function readAgent(name) {
  return fs.readFileSync(path.join(REPO, 'agents', `${name}.md`), 'utf8');
}

function caseInsensitiveContains(haystack, needle) {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

const CRITICS = [
  'plan-critic-acceptance',
  'plan-critic-design',
  'plan-critic-ux',
  'plan-critic-strategic',
  'plan-critic-parallelization',
];

const RUBRIC_ANCHORS = [
  'severity:',
  'error',
  'warning',
  'suggestion',
  'finding schema',
  'tied_to',
];

/**
 * Pure-function reimplementation of the severity policy that lives in prompt
 * text. If the LLM correctly follows the prose, the bookkeeping must match
 * what this function returns. Any future divergence between prose and code
 * here means the policy got rewritten — both must change together.
 */
function applySeverityPolicy(findings) {
  const out = { auto_resolved: [], surfaced: [], recorded: [], errors: [] };
  for (const f of findings) {
    if (f.status === 'error') { out.errors.push(f); continue; }
    switch (f.severity) {
      case 'error':
        out.auto_resolved.push(f);
        break;
      case 'warning':
        out.surfaced.push(f);
        break;
      case 'suggestion':
        out.recorded.push(f);
        break;
      default:
        throw new Error(`unknown severity: ${f.severity}`);
    }
  }
  // Surface cap: max 10, ranked by severity (already filtered) then critic order.
  if (out.surfaced.length > 10) {
    out.recorded.push(...out.surfaced.slice(10));
    out.surfaced = out.surfaced.slice(0, 10);
  }
  return out;
}

module.exports = [
  // ----- Critic agent prompt-anchor tests --------------------------------
  ...CRITICS.map(critic => ({
    name: `${critic} agent contains rubric anchors`,
    fn: () => {
      const content = readAgent(critic);
      for (const anchor of RUBRIC_ANCHORS) {
        assert.ok(
          caseInsensitiveContains(content, anchor),
          `${critic}: missing rubric anchor "${anchor}"`,
        );
      }
      assert.ok(
        /## Inputs|## Process|inputs:/i.test(content),
        `${critic}: missing Inputs/Process section`,
      );
      assert.ok(
        /Findings|Output|return/i.test(content),
        `${critic}: missing Findings/Output section`,
      );
      assert.ok(
        caseInsensitiveContains(content, 'parallel'),
        `${critic}: must mention parallel dispatch`,
      );
    },
  })),

  {
    name: 'UX critic documents conditional spawn (only when ui-spec.md exists)',
    fn: () => {
      const content = readAgent('plan-critic-ux');
      assert.ok(
        /only.*spawn.*ui-spec\.md.*exists/is.test(content) ||
          /only.*ui-spec\.md.*exists.*spawn/is.test(content),
        'plan-critic-ux must document the conditional spawn rule',
      );
    },
  },

  {
    name: 'parallelization critic documents conditional spawn (only when waves are parallel)',
    fn: () => {
      const content = readAgent('plan-critic-parallelization');
      assert.ok(
        /spawned only when.*parallel/is.test(content) ||
          /only.*spawn.*parallel/is.test(content),
        'plan-critic-parallelization must document that it only runs on parallel waves',
      );
      assert.ok(
        content.includes('parallel: true'),
        'plan-critic-parallelization must reference the parallel:true signal',
      );
    },
  },

  // ----- /specify skill anchors ------------------------------------------
  {
    name: '/specify references challenge.md and discussion.md',
    fn: () => {
      const content = readSkill('specify');
      assert.ok(
        content.includes('skills/specify/references/challenge.md') ||
          content.includes('references/challenge.md'),
        '/specify must reference challenge.md',
      );
      assert.ok(content.includes('discussion.md'), '/specify must reference discussion.md');
    },
  },
  {
    name: '/specify documents the --no-challenge opt-out',
    fn: () => {
      const content = readSkill('specify');
      assert.ok(content.includes('--no-challenge'), '/specify must document --no-challenge flag');
      assert.ok(
        /workflows.*challenge.*false/is.test(content) ||
          /challenge.*false/i.test(content),
        '/specify must document the workflows.challenge config opt-out',
      );
    },
  },
  {
    name: 'challenge.md covers the six question categories',
    fn: () => {
      const content = fs.readFileSync(
        path.join(REPO, 'skills', 'specify', 'references', 'challenge.md'),
        'utf8',
      );
      const categories = [
        'Ambiguity',
        'Surface area',
        'Alternatives',
        'Edge cases',
        'Dependencies',
        'Out-of-scope',
      ];
      for (const c of categories) {
        assert.ok(
          caseInsensitiveContains(content, c),
          `challenge.md missing category: ${c}`,
        );
      }
      assert.ok(/8 questions|max .* questions/i.test(content), 'challenge.md must cap at 8 questions');
    },
  },

  // ----- /plan skill anchors ---------------------------------------------
  {
    name: '/plan references all five critics by name',
    fn: () => {
      const content = readSkill('plan');
      for (const critic of CRITICS) {
        assert.ok(
          content.includes(critic),
          `/plan must reference ${critic}`,
        );
      }
    },
  },
  {
    name: '/plan documents the severity policy (error/warning/suggestion routing)',
    fn: () => {
      const content = readSkill('plan');
      assert.ok(/auto[- ]?resolve/i.test(content), '/plan must mention auto-resolve for errors');
      assert.ok(/surface/i.test(content), '/plan must mention surface for warnings');
      assert.ok(/record/i.test(content), '/plan must mention record for suggestions');
      assert.ok(content.includes('concerns.md'), '/plan must reference concerns.md');
      assert.ok(content.includes('--no-critics'), '/plan must document --no-critics flag');
    },
  },
  {
    name: '/plan documents the conditional UX spawn rule',
    fn: () => {
      const content = readSkill('plan');
      assert.ok(
        /ui-spec\.md.*exists/i.test(content) || /exists.*ui-spec/i.test(content),
        '/plan must condition UX critic on ui-spec.md',
      );
    },
  },
  {
    name: '/plan documents the conditional parallelization spawn rule',
    fn: () => {
      const content = readSkill('plan');
      assert.ok(
        content.includes('plan-critic-parallelization'),
        '/plan must reference the parallelization critic',
      );
      assert.ok(
        /parallel.*true/i.test(content) && /(only|skip).*parallel/is.test(content),
        '/plan must condition the parallelization critic on parallel waves',
      );
    },
  },
  {
    name: '/plan computes execution waves via the deterministic engine',
    fn: () => {
      const content = readSkill('plan');
      assert.ok(content.includes('hooks/lib/waves.js'), '/plan must call the wave engine');
      assert.ok(/plan-waves\/v1|## Waves/i.test(content), '/plan must render the wave schedule');
    },
  },

  // ----- Severity-policy contract test -----------------------------------
  {
    name: 'severity policy: error → auto-resolved, warning → surfaced, suggestion → recorded',
    fn: () => {
      const findings = [
        { critic: 'acceptance', severity: 'error', description: 'missing task for S3', tied_to: 'S3' },
        { critic: 'design', severity: 'error', description: 'undeclared dep', tied_to: 'T7' },
        { critic: 'strategic', severity: 'warning', description: 'plan size > 25', tied_to: 'plan' },
        { critic: 'design', severity: 'warning', description: 'abstraction smell', tied_to: 'T9' },
        { critic: 'acceptance', severity: 'warning', description: 'missing edge case test', tied_to: 'EC2' },
        { critic: 'design', severity: 'suggestion', description: 'reorder for clarity', tied_to: 'T4' },
        { critic: 'design', severity: 'suggestion', description: 'rename T2 for consistency', tied_to: 'T2' },
        { critic: 'strategic', severity: 'suggestion', description: 'concentration risk', tied_to: 'T1' },
        { critic: 'strategic', severity: 'suggestion', description: 'risk-last ordering', tied_to: 'plan' },
        { critic: 'acceptance', severity: 'suggestion', description: 'add scenario IDs', tied_to: 'plan' },
      ];
      const result = applySeverityPolicy(findings);
      assert.equal(result.auto_resolved.length, 2, 'errors → auto_resolved');
      assert.equal(result.surfaced.length, 3, 'warnings → surfaced');
      assert.equal(result.recorded.length, 5, 'suggestions → recorded');
      assert.equal(result.errors.length, 0, 'no critic errors');
    },
  },
  {
    name: 'severity policy: critic errors are tracked separately',
    fn: () => {
      const findings = [
        { critic: 'ux', status: 'error', error: 'timeout' },
        { critic: 'acceptance', severity: 'error', description: 'missing task', tied_to: 'S1' },
      ];
      const result = applySeverityPolicy(findings);
      assert.equal(result.errors.length, 1);
      assert.equal(result.errors[0].critic, 'ux');
      assert.equal(result.auto_resolved.length, 1);
    },
  },
  {
    name: 'severity policy: surfaced cap at 10 spills over to recorded',
    fn: () => {
      const findings = Array.from({ length: 15 }, (_, i) => ({
        critic: 'design',
        severity: 'warning',
        description: `warn ${i}`,
        tied_to: `T${i}`,
      }));
      const result = applySeverityPolicy(findings);
      assert.equal(result.surfaced.length, 10, 'cap at 10 surfaced');
      assert.equal(result.recorded.length, 5, 'overflow → recorded');
    },
  },

  // ----- concerns.md template anchors ------------------------------------
  {
    name: 'concerns.md template has the expected sections',
    fn: () => {
      const content = fs.readFileSync(
        path.join(REPO, 'plans', 'adversarial-critique', 'templates', 'concerns.template.md'),
        'utf8',
      );
      const sections = [
        'Critics that ran',
        'Findings summary',
        'Auto-resolved',
        'Surfaced to user',
        'Recorded only',
        'Critic errors',
      ];
      for (const s of sections) {
        assert.ok(content.includes(s), `concerns template missing section: ${s}`);
      }
    },
  },
];
