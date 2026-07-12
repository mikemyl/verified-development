'use strict';

/**
 * Contract test for review-agent dispatch metadata. Every Stage-2 review agent
 * (agents/*-review.md) must self-declare `scope:` (what changed files it applies
 * to) and `context_needs:` (how much context to load before dispatching it), from
 * fixed allowlists. This is the drift guard behind frontmatter-driven dispatch:
 * a new review agent that forgets to declare its scope fails the build instead of
 * silently never running (or running on everything).
 *
 * Non-review agents (plan-critics, executor, adr, use-case-data-patterns) are NOT
 * file-triggered and are intentionally exempt.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const AGENTS_DIR = path.resolve(__dirname, '..', 'agents');

const ALLOWED_CONTEXT = ['diff-only', 'full-file', 'project-structure', 'artifact-stream'];

function reviewAgents() {
  return fs
    .readdirSync(AGENTS_DIR)
    .filter(f => f.endsWith('-review.md'))
    .map(f => ({ file: f, text: fs.readFileSync(path.join(AGENTS_DIR, f), 'utf8') }));
}

function frontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  return m ? m[1] : '';
}

function field(fm, key) {
  const m = fm.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
  // Glob scopes are quoted (a YAML scalar starting with `*` is an alias); strip
  // surrounding quotes so validators see the raw value.
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : null;
}

// A scope value is either the literal `always` or a comma list of path globs
// (each token must look path-ish: contain a `*`, `/`, or `.`).
function scopeValid(value) {
  if (value === 'always') return true;
  return value
    .split(',')
    .map(s => s.trim())
    .every(tok => tok.length > 0 && /[*/.]/.test(tok));
}

function contextValid(value) {
  return value
    .split(',')
    .map(s => s.trim())
    .every(tok => ALLOWED_CONTEXT.includes(tok));
}

module.exports = [
  {
    name: 'frontmatter: there is a discoverable set of review agents',
    fn: () => {
      assert.ok(reviewAgents().length >= 10, 'expected the *-review agent roster');
    },
  },
  {
    name: 'frontmatter: every *-review agent declares a valid scope',
    fn: () => {
      for (const { file, text } of reviewAgents()) {
        const value = field(frontmatter(text), 'scope');
        assert.ok(value, `${file} is missing a scope: declaration`);
        assert.ok(scopeValid(value), `${file} has an invalid scope: "${value}"`);
      }
    },
  },
  {
    name: 'frontmatter: every *-review agent declares valid context_needs',
    fn: () => {
      for (const { file, text } of reviewAgents()) {
        const value = field(frontmatter(text), 'context_needs');
        assert.ok(value, `${file} is missing a context_needs: declaration`);
        assert.ok(
          contextValid(value),
          `${file} has invalid context_needs: "${value}" (allowed: ${ALLOWED_CONTEXT.join(', ')})`,
        );
      }
    },
  },
];
