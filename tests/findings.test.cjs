'use strict';

/**
 * Tests for the SARIF finding-normalization layer (hooks/lib/findings.js).
 *
 * The whole point is a deterministic, model-free finding envelope: normalize
 * parses SARIF text (never invokes a tool), dedup/buildEnvelope are pure, and
 * scan() degrades gracefully so a missing or broken linter never blocks a build.
 * Every test runs against SARIF fixtures — no external tool is invoked.
 *
 * Requirement ids trace to .verified/features/structured-finding-layer/spec.md.
 */

const assert = require('node:assert/strict');
const { normalize, dedup } = require('../hooks/lib/findings.js');

const finding = (rule_id, file, line) => ({ rule_id, file, line, severity: 'error', message: 'm', tool: 't', lang: 'l' });

// Minimal SARIF builder for fixtures.
const sarif = (...results) => JSON.stringify({ runs: [{ results }] });
const result = (ruleId, level, uri, startLine, text = 'msg') => ({
  ...(ruleId !== undefined ? { ruleId } : {}),
  ...(level !== undefined ? { level } : {}),
  message: { text },
  ...(uri !== undefined
    ? { locations: [{ physicalLocation: { artifactLocation: { uri }, region: { startLine } } }] }
    : {}),
});

const ctx = { tool: 'golangci-lint', lang: 'go' };

module.exports = [
  {
    // structured-finding-layer/AS-1 + FR-001/FR-002
    name: 'normalize: one SARIF result → one finding with tool-prefixed rule id',
    fn: () => {
      const out = normalize(sarif(result('errcheck', 'error', 'foo.go', 12)), ctx);
      assert.equal(out.length, 1);
      assert.deepEqual(out[0], {
        rule_id: 'golangci-lint.go.errcheck',
        file: 'foo.go',
        line: 12,
        severity: 'error',
        message: 'msg',
        tool: 'golangci-lint',
        lang: 'go',
      });
    },
  },
  {
    // structured-finding-layer/AS-2 + FR-003 — severity mapping
    name: 'normalize: SARIF level maps error→error, warning→warning, note→suggestion',
    fn: () => {
      const out = normalize(
        sarif(
          result('a', 'error', 'f.go', 1),
          result('b', 'warning', 'f.go', 2),
          result('c', 'note', 'f.go', 3),
        ),
        ctx,
      );
      assert.deepEqual(out.map(f => f.severity), ['error', 'warning', 'suggestion']);
    },
  },
  {
    // structured-finding-layer/EC-003 — missing location
    name: 'normalize: a result with no location → file "unknown", line 0',
    fn: () => {
      const out = normalize(sarif(result('r', 'error', undefined, undefined)), ctx);
      assert.equal(out[0].file, 'unknown');
      assert.equal(out[0].line, 0);
    },
  },
  {
    // structured-finding-layer/EC-004 — missing ruleId
    name: 'normalize: a result with no ruleId → <tool>.<lang>.unknown',
    fn: () => {
      const out = normalize(sarif(result(undefined, 'warning', 'f.go', 5)), ctx);
      assert.equal(out[0].rule_id, 'golangci-lint.go.unknown');
    },
  },
  {
    // structured-finding-layer/AS-10 — pure parse, no tool
    name: 'normalize: empty results array → no findings, no throw',
    fn: () => {
      assert.deepEqual(normalize(sarif(), ctx), []);
    },
  },

  // --- dedup (within-adapter) --------------------------------------------------
  {
    // structured-finding-layer/AS-3 + EC-006
    name: 'dedup: identical file+line+rule_id collapse to one',
    fn: () => {
      const out = dedup([finding('t.l.a', 'f.go', 3), finding('t.l.a', 'f.go', 3)]);
      assert.equal(out.length, 1);
    },
  },
  {
    // structured-finding-layer/AS-3 — same file:line, different rule → kept separate
    name: 'dedup: same file:line but different rule_id are NOT duplicates',
    fn: () => {
      const out = dedup([finding('t.l.a', 'f.go', 3), finding('t.l.b', 'f.go', 3)]);
      assert.equal(out.length, 2);
    },
  },
  {
    // structured-finding-layer/AS-3 — differing line/file kept separate
    name: 'dedup: same rule but different line or file are kept separate',
    fn: () => {
      const out = dedup([
        finding('t.l.a', 'f.go', 3),
        finding('t.l.a', 'f.go', 4),
        finding('t.l.a', 'g.go', 3),
      ]);
      assert.equal(out.length, 3);
    },
  },
];
