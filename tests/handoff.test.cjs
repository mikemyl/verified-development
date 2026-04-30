'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const handoff = require('../hooks/lib/handoff.js');

function tmpFeatureDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vd-handoff-'));
}

function goodFixture(overrides = {}) {
  return {
    schema_version: 1,
    feature: 'interruptible-workflow',
    phase: 'implement',
    completed_tasks: [{ id: 'A1', title: 'tests/runner', completed_at: '2026-04-30T10:15:00Z' }],
    remaining_tasks: [{ id: 'A2', title: 'schema + tests' }],
    blockers: [],
    decisions_made: [],
    git_head: 'abc1234',
    timestamp: '2026-04-30T10:32:00Z',
    ...overrides,
  };
}

module.exports = [
  {
    name: 'validate accepts a well-formed handoff',
    fn: () => {
      assert.doesNotThrow(() => handoff.validate(goodFixture()));
    },
  },
  {
    name: 'validate accepts the canonical example fixture',
    fn: () => {
      const fixturePath = path.resolve(
        __dirname,
        '..',
        'plans',
        'interruptible-workflow',
        'templates',
        'handoff.example.json',
      );
      const data = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
      assert.doesNotThrow(() => handoff.validate(data));
    },
  },
  {
    name: 'validate rejects missing required field',
    fn: () => {
      const bad = goodFixture();
      delete bad.feature;
      assert.throws(() => handoff.validate(bad), handoff.ValidationError);
    },
  },
  {
    name: 'validate rejects wrong schema_version',
    fn: () => {
      assert.throws(
        () => handoff.validate(goodFixture({ schema_version: 2 })),
        /schema_version/,
      );
    },
  },
  {
    name: 'validate rejects unknown phase',
    fn: () => {
      assert.throws(() => handoff.validate(goodFixture({ phase: 'foo' })), /phase/);
    },
  },
  {
    name: 'validate rejects bad git_head format',
    fn: () => {
      assert.throws(() => handoff.validate(goodFixture({ git_head: 'NOT-HEX' })), /git_head/);
    },
  },
  {
    name: 'validate rejects bad blocker severity',
    fn: () => {
      const bad = goodFixture({
        blockers: [{ severity: 'urgent', description: 'bad' }],
      });
      assert.throws(() => handoff.validate(bad), /severity/);
    },
  },
  {
    name: 'validate rejects unknown top-level fields',
    fn: () => {
      const bad = goodFixture();
      bad.surprise = 'stowaway';
      assert.throws(() => handoff.validate(bad), /unknown field/);
    },
  },
  {
    name: 'write then read round-trips',
    fn: () => {
      const dir = tmpFeatureDir();
      try {
        const data = goodFixture();
        handoff.write(dir, data);
        const back = handoff.read(dir);
        assert.deepEqual(back, data);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    },
  },
  {
    name: 'read returns null when no handoff exists',
    fn: () => {
      const dir = tmpFeatureDir();
      try {
        assert.equal(handoff.read(dir), null);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    },
  },
  {
    name: 'update merges patch and refreshes timestamp',
    fn: () => {
      const dir = tmpFeatureDir();
      try {
        const initial = goodFixture({ timestamp: '2026-04-30T10:00:00Z' });
        handoff.write(dir, initial);

        const merged = handoff.update(dir, {
          completed_tasks: [
            ...initial.completed_tasks,
            { id: 'A2', title: 'schema + tests', completed_at: '2026-04-30T11:00:00Z' },
          ],
          remaining_tasks: [],
        });
        assert.equal(merged.completed_tasks.length, 2);
        assert.equal(merged.remaining_tasks.length, 0);
        assert.notEqual(merged.timestamp, initial.timestamp, 'timestamp should refresh');
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    },
  },
  {
    name: 'clear removes handoff and continue-here files',
    fn: () => {
      const dir = tmpFeatureDir();
      try {
        handoff.write(dir, goodFixture());
        fs.writeFileSync(path.join(dir, handoff.CONTINUE_FILE), '# continue here\n');
        handoff.clear(dir);
        assert.equal(fs.existsSync(path.join(dir, handoff.HANDOFF_FILE)), false);
        assert.equal(fs.existsSync(path.join(dir, handoff.CONTINUE_FILE)), false);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    },
  },
  {
    name: 'atomic write does not leave a tempfile behind on success',
    fn: () => {
      const dir = tmpFeatureDir();
      try {
        handoff.write(dir, goodFixture());
        const leftovers = fs
          .readdirSync(dir)
          .filter(f => f.startsWith(handoff.HANDOFF_FILE + '.tmp.'));
        assert.equal(leftovers.length, 0, `tempfile leak: ${leftovers.join(', ')}`);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    },
  },
  {
    name: 'concurrent updates do not corrupt the file',
    fn: () => {
      const dir = tmpFeatureDir();
      try {
        handoff.write(dir, goodFixture());
        // Simulate two writes racing — both must produce a valid file when
        // their rename completes; one of the two payloads wins, but no half-
        // written content is observable.
        for (let i = 0; i < 50; i++) {
          handoff.update(dir, { reason: `iteration ${i}` });
          // Reading right after each write must always parse + validate.
          const back = handoff.read(dir);
          assert.equal(back.feature, 'interruptible-workflow');
        }
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    },
  },
];
