'use strict';

/**
 * CLI seam: a script's JSON must reach a PIPE whole.
 *
 * `process.exit(code)` right after `process.stdout.write(big)` drops whatever
 * has not been flushed yet. On macOS a pipe is written asynchronously, so a
 * consumer like `node x.js | node -e …` or `| python3 -c …` saw exactly 65,536
 * bytes of a 103 KB corpus scan (found while mapping tcba-web). Redirecting to
 * a file hid it. Fails for a reason other than "I changed the code I just
 * wrote": any future CLI that reintroduces exit-before-flush truncates here.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO = path.resolve(__dirname, '..');
const LIB = name => path.join(REPO, 'hooks', 'lib', name);
const BIG = 70 * 1024; // past the 64 KiB pipe buffer

function run(args, cwd) {
  // stdio 'pipe' is the seam under test: the parent reads through a pipe.
  return spawnSync('node', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

module.exports = [
  {
    name: 'taxonomy.js extract: a Test Types section larger than the pipe buffer arrives whole through a pipe',
    fn: () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flush-'));
      const types = [];
      for (let i = 0; types.join('').length < BIG; i += 1) {
        types.push(`### type${i}\n- **boundary:** b${i}\n- **pattern:** ${'p'.repeat(400)}\n- **location:** l\n- **tier:** default\n- **when-to-use:** w\n- **primitives:** x\n\n`);
      }
      const doc = `# Testing\n\n## Test Types\n\n${types.join('')}`;
      const file = path.join(dir, 'TESTING.md');
      fs.writeFileSync(file, doc);
      const res = run([LIB('taxonomy.js'), 'extract', file], dir);
      assert.equal(res.status, 0, res.stderr);
      assert.ok(res.stdout.length > BIG, `expected > ${BIG} bytes, got ${res.stdout.length}`);
      assert.ok(res.stdout.trimEnd().endsWith(types[types.length - 1].trimEnd()), 'the tail of the section was lost');
    },
  },
  {
    name: 'test-corpus.js scan: a corpus whose report exceeds the pipe buffer arrives whole and parses',
    fn: () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flush-'));
      fs.mkdirSync(path.join(dir, 'pkg'));
      fs.writeFileSync(
        path.join(dir, 'TESTING.md'),
        '## Test Types\n\n### unit\n- **boundary:** fn\n- **pattern:** std\n- **location:** pkg\n- **tier:** sign-off\n- **when-to-use:** w\n- **primitives:** x\n- **match-paths:** **/*_test.go\n- **match-markers:** assert\n\n',
      );
      for (let f = 0; f < 150; f += 1) {
        const body = Array.from({ length: 4 }, (_, i) => `func TestFile${f}Case${i}(t *testing.T) {\n\tassert.Equal(t, 1, 1)\n}\n`).join('\n');
        fs.writeFileSync(path.join(dir, 'pkg', `f${f}_test.go`), `package pkg\n\n${body}`);
      }
      const res = run([LIB('test-corpus.js'), 'scan', 'pkg', '--testing', 'TESTING.md'], dir);
      assert.equal(res.status, 0, res.stderr);
      assert.ok(res.stdout.length > BIG, `expected > ${BIG} bytes, got ${res.stdout.length}`);
      const parsed = JSON.parse(res.stdout); // throws on a truncated document
      assert.equal(parsed.summary.total, 600);
    },
  },
];
