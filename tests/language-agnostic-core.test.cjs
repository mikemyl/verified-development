'use strict';

/**
 * language-agnostic-core feature — RED guard + prompt-anchor net (T001).
 *
 * One named entry per assertion group so each failure is attributed
 * individually during the parallel Wave 2 impl tasks (style lifted from
 * tests/test-audit.test.cjs). Tolerant read() returns '' on ENOENT so a
 * missing file fails on the meaningful substring assertion, not a crash.
 *
 * v2 keeps the guards that still have a subject: the dangling-`tdd` check, the
 * no-new-per-language-file invariant, resolvable skill references, and the
 * agnostic framing in the docs.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

// Tolerant read: a not-yet-edited/created file yields '' so includes()-style
// assertions fail with a meaningful message rather than crashing on ENOENT.
function read(...parts) {
  try {
    return fs.readFileSync(path.join(ROOT, ...parts), 'utf8');
  } catch {
    return '';
  }
}

// Recursively collect *.md files under a repo-relative directory.
function mdFiles(...parts) {
  const dir = path.join(ROOT, ...parts);
  const out = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      out.push(...mdFiles(path.relative(ROOT, full)));
    } else if (e.isFile() && e.name.endsWith('.md')) {
      out.push(full);
    }
  }
  return out;
}

function isSkillDir(name) {
  try {
    return fs.statSync(path.join(ROOT, 'skills', name)).isDirectory();
  } catch {
    return false;
  }
}

module.exports = [
  {
    // (a) SC-003 — the backtick-exact bare `tdd` skill reference must not exist
    // anywhere under agents/ or skills/. Must NOT trip on `tdd-go`, `tdd-cycle`,
    // or prose "TDD" — the regex matches only the literal backtick-tdd-backtick.
    name: 'SC-003 no dangling tdd ref',
    fn: () => {
      const files = [...mdFiles('agents'), ...mdFiles('skills')];
      const offenders = files.filter(f => /`tdd`/.test(fs.readFileSync(f, 'utf8')));
      const rel = offenders.map(f => path.relative(ROOT, f));
      assert.deepEqual(
        rel,
        [],
        `bare \`tdd\` skill reference found in: ${rel.join(', ')}`,
      );
    },
  },
  {
    // (b) SC-004 — regression guard: no new per-language file is introduced.
    // PASSES now and must stay green.
    name: 'SC-004 no new per-language files [regression guard]',
    fn: () => {
      const skillDirs = fs
        .readdirSync(path.join(ROOT, 'skills'), { withFileTypes: true })
        .filter(e => e.isDirectory())
        .map(e => e.name);
      const strayTdd = skillDirs.filter(n => /^tdd-/.test(n) && n !== 'tdd-go');
      assert.deepEqual(strayTdd, [], `unexpected per-language tdd-* skill dir(s): ${strayTdd.join(', ')}`);

      const strayVd = skillDirs.filter(n => /-verified-development$/.test(n) && n !== 'go-verified-development');
      assert.deepEqual(strayVd, [], `unexpected per-language *-verified-development skill dir(s): ${strayVd.join(', ')}`);

      const stackDocs = fs
        .readdirSync(path.join(ROOT, 'docs'))
        .filter(n => /-stack\.md$/.test(n) && n !== 'go-stack.md');
      assert.deepEqual(stackDocs, [], `unexpected *-stack.md doc(s): ${stackDocs.join(', ')}`);
    },
  },
  {
    // (e) AS-003 — every `<name>` skill reference resolves to a skills/ dir.
    // Guards that no reference points at a non-existent skill (e.g. bare `tdd`).
    name: 'AS-003 referenced skills exist',
    fn: () => {
      const files = [
        ['agents', 'test-review.md'],
        ['skills', 'react-testing', 'SKILL.md'],
        ['skills', 'front-end-testing', 'SKILL.md'],
        ['skills', 'review', 'SKILL.md'],
        ['skills', 'plan', 'SKILL.md'],
        ['skills', 'map', 'SKILL.md'],
        ['skills', 'testing', 'SKILL.md'],
      ];
      const dangling = [];
      for (const parts of files) {
        const c = read(...parts);
        const rel = parts.join('/');
        for (const m of c.matchAll(/`([a-z][a-z0-9-]*)` skill/g)) {
          const name = m[1];
          if (!isSkillDir(name)) dangling.push(`${rel} -> \`${name}\``);
        }
      }
      assert.deepEqual(dangling, [], `dangling skill reference(s): ${dangling.join(', ')}`);
    },
  },
  {
    // (j) AS-006 — docs describe the agnostic model.
    name: 'AS-006 docs agnostic',
    fn: () => {
      const readme = read('README.md');
      assert.ok(readme.includes('language-agnostic'), `README.md: expected "language-agnostic"`);
      assert.ok(!readme.includes('wired for Go today'), `README.md: must NOT contain "wired for Go today"`);
      const goStack = read('docs', 'go-stack.md');
      assert.ok(goStack.includes('one example'), `docs/go-stack.md: expected "one example"`);
    },
  },
  {
    // (k) AS-007 — per-repo extension point documented.
    name: 'AS-007 extension point',
    fn: () => {
      const cfg = read('docs', 'how-it-works.md');
      assert.ok(
        cfg.includes('Teaching the plugin your stack'),
        `docs/how-it-works.md: expected "Teaching the plugin your stack"`,
      );
      assert.ok(cfg.includes('`.verified/codebase/`'), `docs/how-it-works.md: expected "\`.verified/codebase/\`"`);
      const claude = read('CLAUDE.md');
      assert.ok(claude.includes('Language-agnostic core'), `CLAUDE.md: expected "Language-agnostic core"`);
    },
  },
];
