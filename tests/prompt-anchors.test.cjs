'use strict';

/**
 * Prompt-anchors regression net.
 *
 * Skills that orchestrate the interruptible-workflow feature must contain
 * specific anchors (file paths, helper invocations, refusal language).
 * If a future edit removes one, this test catches it before merge.
 *
 * Pattern lifted from get-shit-done's tests/discuss-checkpoint.test.cjs:
 * read the prompt markdown and assert key strings are present.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILLS = path.resolve(__dirname, '..', 'skills');

function read(skill) {
  return fs.readFileSync(path.join(SKILLS, skill, 'SKILL.md'), 'utf8');
}

function mustContain(content, needles, label) {
  const lower = content.toLowerCase();
  for (const n of needles) {
    assert.ok(
      lower.includes(n.toLowerCase()),
      `${label}: expected to contain ${JSON.stringify(n)} (case-insensitive)`,
    );
  }
}

module.exports = [
  {
    name: 'pause skill exists with required anchors',
    fn: () => {
      const content = read('pause');
      mustContain(
        content,
        [
          'handoff.json',
          'continue-here.md',
          'hooks/lib/handoff.js',
          'git rev-parse',
          'END',
          'do NOT',
        ],
        'skills/pause/SKILL.md',
      );
    },
  },
  {
    name: 'continue skill exists with required anchors',
    fn: () => {
      const content = read('continue');
      mustContain(
        content,
        [
          'handoff.json',
          'continue-here.md',
          'hooks/lib/handoff.js',
          'git_head',
          'severity: blocking',
          '--force',
          'do NOT',
        ],
        'skills/continue/SKILL.md',
      );
    },
  },
  {
    name: 'pause skill ends-the-turn discipline is documented',
    fn: () => {
      const content = read('pause');
      // The whole point of /pause is that it stops working — this language
      // must survive future edits.
      assert.ok(
        /(end[s]? the turn|stop[s]?\b|do not (start|chain))/i.test(content),
        'pause must instruct the agent to end the turn / not continue working',
      );
    },
  },
  {
    name: 'continue skill explicitly does not auto-invoke next phase',
    fn: () => {
      const content = read('continue');
      assert.ok(
        /not auto[- ]?invoke|do not auto[- ]?continue|user .*decision[- ]maker|approve before/i.test(
          content,
        ),
        'continue must brief and stop, not auto-invoke',
      );
    },
  },
  {
    name: 'phase skills reference handoff helper',
    fn: () => {
      // Every phase skill must call the handoff helper at least once so the
      // interruptibility contract is wired.
      const phases = ['specify', 'ui-spec', 'plan', 'implement', 'verify', 'review', 'quick'];
      for (const skill of phases) {
        const content = read(skill);
        assert.ok(
          content.includes('hooks/lib/handoff.js'),
          `skills/${skill}/SKILL.md must reference hooks/lib/handoff.js`,
        );
      }
    },
  },
  {
    name: 'phase skills set next_action on completion',
    fn: () => {
      // Skills that have a successor phase must declare next_action.
      const expected = {
        specify: '/ui-spec',
        'ui-spec': '/plan',
        plan: '/implement',
        implement: '/verify',
        verify: '/review',
      };
      for (const [skill, action] of Object.entries(expected)) {
        const content = read(skill);
        assert.ok(
          content.includes(`next_action: "${action}"`) || content.includes(`next_action: '${action}'`),
          `skills/${skill}/SKILL.md must set next_action: "${action}"`,
        );
      }
    },
  },
  {
    name: 'progress skill detects mid-phase handoff',
    fn: () => {
      const content = read('progress');
      assert.ok(
        /handoff\.json/i.test(content) && /\/continue/.test(content),
        'progress must check for handoff.json and route to /continue',
      );
    },
  },
  {
    name: 'specify skill prompts UI vs non-UI branch at completion',
    fn: () => {
      const content = read('specify');
      assert.ok(
        /\/ui-spec/.test(content) && /\/plan/.test(content),
        'specify must offer /ui-spec or /plan as next action',
      );
      assert.ok(
        /AskUserQuestion|ask.*conversational|one question/i.test(content),
        'specify must explicitly ask the user which branch',
      );
    },
  },
];
