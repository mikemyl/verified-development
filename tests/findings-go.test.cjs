'use strict';

/**
 * Tests for the Go static-analysis adapter (hooks/lib/findings/go.js).
 * Pure — normalizes a golangci-lint SARIF fixture; the tool is never invoked.
 *
 * Requirement ids trace to .verified/features/structured-finding-layer/spec.md.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const go = require('../hooks/lib/findings/go.js');

const fixture = fs.readFileSync(
  path.join(__dirname, 'fixtures', 'golangci-lint.sarif'),
  'utf8',
);

module.exports = [
  {
    name: 'go adapter: declares language, extension, and tool metadata',
    fn: () => {
      assert.equal(go.lang, 'go');
      assert.deepEqual(go.extensions, ['.go']);
      assert.equal(go.tool, 'golangci-lint');
      assert.equal(typeof go.run, 'function');
    },
  },
  {
    // structured-finding-layer/AS-7 — parse a real golangci-lint SARIF shape
    name: 'go adapter: normalizes golangci-lint SARIF to go-prefixed findings',
    fn: () => {
      const findings = go.normalize(fixture);
      assert.equal(findings.length, 2);
      assert.deepEqual(
        findings.map(f => f.rule_id),
        ['golangci-lint.go.errcheck', 'golangci-lint.go.ineffassign'],
      );
      assert.deepEqual(
        findings.map(f => `${f.file}:${f.line}`),
        ['internal/store/db.go:42', 'cmd/main.go:8'],
      );
      assert.deepEqual(
        findings.map(f => f.severity),
        ['error', 'warning'],
      );
    },
  },

  // --- run() seam: exercise the REAL degradation branches with an injected spawn
  {
    // structured-finding-layer/AS-7 — run() returns the SARIF payload on success
    name: 'go adapter run(): valid SARIF stdout is returned (trimmed)',
    fn: () => {
      const spawn = () => ({ status: 1, stdout: fixture, error: null });
      const out = go.run('.', spawn);
      assert.equal(out, fixture.trim());
      // And it round-trips through normalize (proves run→normalize compose).
      assert.equal(go.normalize(out).length, 2);
    },
  },
  {
    // structured-finding-layer/AS-6 — spawn error (ENOENT / tool absent) → null
    name: 'go adapter run(): spawn error → null (degrade, not throw)',
    fn: () => {
      const spawn = () => ({ error: new Error('ENOENT'), stdout: '' });
      assert.equal(go.run('.', spawn), null);
    },
  },
  {
    // structured-finding-layer/AS-6 — spawn that THROWS → null, never propagated
    name: 'go adapter run(): a throwing spawn is caught and returns null',
    fn: () => {
      const spawn = () => { throw new Error('boom'); };
      assert.equal(go.run('.', spawn), null);
    },
  },
  {
    // structured-finding-layer/EC-002 — non-SARIF stdout (not `{`-prefixed) → null
    name: 'go adapter run(): non-SARIF stdout → null',
    fn: () => {
      const spawn = () => ({ status: 3, stdout: 'level=error msg="config broken"\n', error: null });
      assert.equal(go.run('.', spawn), null);
    },
  },
];
