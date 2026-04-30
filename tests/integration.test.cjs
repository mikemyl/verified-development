'use strict';

/**
 * End-to-end integration test for interruptible-workflow.
 *
 * Drives a fake feature through pause/continue by exercising the helpers
 * exactly as the /pause and /continue skills will. This is the closest we
 * can get without spinning up an LLM session.
 *
 * Steps simulated:
 *   1. Phase entry (skill writes handoff)
 *   2. Mid-phase progress (skill calls update twice)
 *   3. /pause (skill captures handoff + continue-here)
 *   4. /continue (skill reads handoff, validates, briefs)
 *   5. Phase completion (skill clears handoff)
 *   6. State.md transitions: schema_version 2, next_action set
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const handoff = require('../hooks/lib/handoff.js');
const stateLib = require('../hooks/lib/state.js');

function tmpProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vd-e2e-'));
  fs.mkdirSync(path.join(root, '.verified', 'features', 'demo-feature'), { recursive: true });
  return {
    root,
    featureDir: path.join(root, '.verified', 'features', 'demo-feature'),
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}

function nowIso() {
  return new Date().toISOString();
}

module.exports = [
  {
    name: 'full lifecycle: enter phase → progress → pause → resume → complete',
    fn: () => {
      const { root, featureDir, cleanup } = tmpProject();
      try {
        // (1) bootstrap state.md as v1 legacy (no schema_version)
        fs.writeFileSync(
          path.join(root, '.verified', 'state.md'),
          `---
feature: demo-feature
phase: implement
status: in_progress
last_activity: 2020-01-01
---

# State
`,
          'utf8',
        );

        // Reading a legacy v1 file should report v1
        let s = stateLib.read(root);
        assert.equal(s.frontmatter.schema_version, 1, 'legacy v1 read');
        assert.equal(s.frontmatter.active_phase, '', 'defaults applied');
        assert.equal(s.frontmatter.next_action, '');

        // (2) /implement phase entry — skill writes initial handoff
        handoff.write(featureDir, {
          schema_version: 1,
          feature: 'demo-feature',
          phase: 'implement',
          completed_tasks: [],
          remaining_tasks: [
            { id: 'T1', title: 'first' },
            { id: 'T2', title: 'second' },
            { id: 'T3', title: 'third' },
          ],
          git_head: 'abc1234',
          timestamp: nowIso(),
        });

        // Skill also bumps state.md active_phase
        stateLib.update(root, { active_phase: 'implement' });
        s = stateLib.read(root);
        assert.equal(s.frontmatter.schema_version, 2, 'state.md upgraded to v2');
        assert.equal(s.frontmatter.active_phase, 'implement');

        // (3) Wave 1 completes — T1 done, update handoff
        handoff.update(featureDir, {
          completed_tasks: [
            { id: 'T1', title: 'first', completed_at: nowIso() },
          ],
          remaining_tasks: [
            { id: 'T2', title: 'second' },
            { id: 'T3', title: 'third' },
          ],
        });

        // Wave 2 — T2 done
        handoff.update(featureDir, {
          completed_tasks: [
            { id: 'T1', title: 'first', completed_at: '2026-04-30T10:00:00Z' },
            { id: 'T2', title: 'second', completed_at: nowIso() },
          ],
          remaining_tasks: [{ id: 'T3', title: 'third' }],
        });

        // (4) /pause invoked mid-implement — skill writes continue-here.md
        const pauseSnapshot = handoff.read(featureDir);
        fs.writeFileSync(
          path.join(featureDir, 'continue-here.md'),
          `---
feature: demo-feature
phase: implement
timestamp: ${pauseSnapshot.timestamp}
blockers_present: false
git_head: ${pauseSnapshot.git_head}
---

# Resuming
What I just did: completed T1, T2.
What's next: T3 (third).
`,
          'utf8',
        );

        // /pause also clears active_phase (no longer in flight)
        stateLib.update(root, { active_phase: '', next_action: '/continue' });
        s = stateLib.read(root);
        assert.equal(s.frontmatter.active_phase, '');
        assert.equal(s.frontmatter.next_action, '/continue');

        // (5) /continue in fresh session — read state, then handoff, then continue-here
        const resumed = handoff.read(featureDir);
        assert.equal(resumed.completed_tasks.length, 2);
        assert.equal(resumed.remaining_tasks.length, 1);
        assert.equal(resumed.remaining_tasks[0].id, 'T3');
        const continueMd = fs.readFileSync(path.join(featureDir, 'continue-here.md'), 'utf8');
        assert.ok(continueMd.includes('T1, T2'));

        // /continue sets active_phase back
        stateLib.update(root, { active_phase: 'implement', next_action: '' });

        // (6) T3 completes — phase done — skill clears handoff
        handoff.clear(featureDir);
        assert.equal(fs.existsSync(path.join(featureDir, 'handoff.json')), false);
        assert.equal(fs.existsSync(path.join(featureDir, 'continue-here.md')), false);

        // Skill sets next_action to /verify
        stateLib.update(root, {
          status: 'complete',
          active_phase: '',
          next_action: '/verify',
          next_phases: ['verify'],
        });
        s = stateLib.read(root);
        assert.equal(s.frontmatter.next_action, '/verify');
        assert.deepEqual(s.frontmatter.next_phases, ['verify']);
        assert.equal(s.frontmatter.schema_version, 2);
      } finally {
        cleanup();
      }
    },
  },
  {
    name: 'blocking blocker survives pause/continue round-trip',
    fn: () => {
      const { featureDir, cleanup } = tmpProject();
      try {
        handoff.write(featureDir, {
          schema_version: 1,
          feature: 'demo-feature',
          phase: 'implement',
          completed_tasks: [],
          remaining_tasks: [{ id: 'T1', title: 'first' }],
          blockers: [
            {
              severity: 'blocking',
              description: 'database migration needs review',
              raised_at: nowIso(),
            },
          ],
          git_head: 'abc1234',
          timestamp: nowIso(),
        });
        const back = handoff.read(featureDir);
        assert.equal(back.blockers.length, 1);
        assert.equal(back.blockers[0].severity, 'blocking');
      } finally {
        cleanup();
      }
    },
  },
  {
    name: 'session-start hook output is properly enveloped JSON',
    fn: () => {
      const { execSync } = require('node:child_process');
      const { root, featureDir, cleanup } = tmpProject();
      try {
        fs.writeFileSync(
          path.join(root, '.verified', 'state.md'),
          `---
feature: demo-feature
phase: implement
status: in_progress
last_activity: 2026-04-30
next_action: "/verify"
schema_version: 2
---
`,
          'utf8',
        );
        handoff.write(featureDir, {
          schema_version: 1,
          feature: 'demo-feature',
          phase: 'implement',
          completed_tasks: [{ id: 'T1', title: 'first' }],
          remaining_tasks: [{ id: 'T2', title: 'second' }],
          git_head: 'abc1234',
          timestamp: nowIso(),
        });

        const out = execSync(
          `bash ${path.resolve(__dirname, '..', 'hooks', 'session-start.sh')}`,
          { cwd: root, encoding: 'utf8' },
        );
        const parsed = JSON.parse(out);
        assert.ok(parsed.hookSpecificOutput, 'must use hookSpecificOutput envelope');
        assert.equal(parsed.hookSpecificOutput.hookEventName, 'SessionStart');
        assert.ok(
          parsed.hookSpecificOutput.additionalContext.includes('HANDOFF DETECTED'),
          'must include handoff banner',
        );
        assert.ok(
          parsed.hookSpecificOutput.additionalContext.includes('1/2 tasks done'),
          'must report N/M progress',
        );
        assert.ok(
          parsed.hookSpecificOutput.additionalContext.includes('/verify'),
          'must include next_action',
        );
      } finally {
        cleanup();
      }
    },
  },
];
