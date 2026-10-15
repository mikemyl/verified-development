'use strict';

/**
 * Documentation integrity for v2.
 *
 * Fails for a reason other than "I changed the code I just wrote": someone
 * renames or deletes a doc that another page links to, adds a doc the README
 * does not list, adds a skill or lib the docs never mention, or registers a
 * hook the how-it-works page does not describe.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(REPO, rel), 'utf8');
const list = (dir, pred) => fs.readdirSync(path.join(REPO, dir)).filter(pred).sort();

const PAGES = ['README.md', ...list('docs', f => f.endsWith('.md')).map(f => `docs/${f}`)];

/** Relative markdown links: [text](docs/x.md#anchor), [text](../templates/y.md). */
function relativeLinks(md) {
  const out = [];
  const re = /\]\(([^)\s]+)\)/g;
  let m;
  while ((m = re.exec(md))) {
    const target = m[1];
    if (/^(https?:|mailto:|#)/.test(target)) continue;
    out.push(target.split('#')[0]);
  }
  return out;
}

module.exports = [
  {
    name: 'docs: every relative link in README and docs/ resolves to a file',
    fn: () => {
      const broken = [];
      for (const page of PAGES) {
        const base = path.dirname(path.join(REPO, page));
        for (const target of relativeLinks(read(page))) {
          if (!fs.existsSync(path.resolve(base, target))) broken.push(`${page} -> ${target}`);
        }
      }
      assert.deepEqual(broken, [], `broken links:\n  ${broken.join('\n  ')}`);
    },
  },
  {
    name: 'docs: every page under docs/ is linked from the README',
    fn: () => {
      const readme = read('README.md');
      const orphans = list('docs', f => f.endsWith('.md')).filter(f => !readme.includes(`docs/${f}`));
      assert.deepEqual(orphans, [], `docs not linked from README: ${orphans.join(', ')}`);
    },
  },
  {
    name: 'docs: the README names every shipped skill',
    fn: () => {
      const readme = read('README.md');
      const skills = list('skills', f => fs.statSync(path.join(REPO, 'skills', f)).isDirectory());
      const missing = skills.filter(s => !new RegExp(`(/|\`)${s}\\b`).test(readme));
      assert.deepEqual(missing, [], `skills the README never names: ${missing.join(', ')}`);
    },
  },
  {
    name: 'docs: how-it-works.md names every hook command registered in hooks.json and every lib',
    fn: () => {
      const page = read('docs/how-it-works.md');
      const hooks = JSON.parse(read('hooks/hooks.json')).hooks;
      const cmds = Object.values(hooks).flat().flatMap(h => h.hooks.map(x => path.basename(x.command.split(' ').pop())));
      const libs = list('hooks/lib', f => f.endsWith('.js'));
      const missing = [...cmds, ...libs].filter(n => !page.includes(n));
      assert.deepEqual(missing, [], `how-it-works.md never mentions: ${missing.join(', ')}`);
    },
  },
  {
    name: 'docs: how-it-works.md documents every config key and env switch the code reads',
    fn: () => {
      const page = read('docs/how-it-works.md');
      for (const key of ['hooks.git_guard', 'VERIFIED_GIT_GUARD', 'workflows.plan_critics', '"verify"']) {
        assert.ok(page.includes(key), `how-it-works.md: expected ${key}`);
      }
      assert.ok(page.includes('Teaching the plugin your stack'), 'the per-repo extension point section');
      assert.ok(page.includes('`.verified/codebase/`'));
    },
  },
  {
    name: 'docs: the README has a workflow section that orders map → build → verify → review → commit',
    fn: () => {
      const readme = read('README.md');
      const section = readme.match(/## Workflow[\s\S]*?(?=\n## )/);
      assert.ok(section, 'README needs a "## Workflow" section');
      const order = ['/map', 'scenario', 'verify', '/review', 'commit'].map(k => section[0].indexOf(k));
      assert.ok(order.every(i => i >= 0), `workflow section must mention /map, scenario tests, verify, /review, commit: ${order}`);
      assert.deepEqual([...order].sort((a, b) => a - b), order, 'workflow steps out of order');
    },
  },
];
