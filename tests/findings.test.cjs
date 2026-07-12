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
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { normalize, dedup, buildEnvelope, scan, walk, severityOf, SCHEMA } = require('../hooks/lib/findings.js');

const CLI = path.join(__dirname, '..', 'hooks', 'lib', 'findings.js');
const runCli = (...args) => spawnSync('node', [CLI, ...args], { encoding: 'utf8' });

// A fake adapter for scan() tests — never invokes a real tool.
const fakeAdapter = (over = {}) => ({
  lang: 'go',
  extensions: ['.go'],
  tool: 'fake',
  run: () => sarif(),
  normalize: s => normalize(s, { tool: 'fake', lang: 'go' }),
  ...over,
});

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
    // structured-finding-layer/FR-003 — an unmapped/absent level falls back to suggestion
    name: 'severityOf: an unrecognized or missing SARIF level → suggestion',
    fn: () => {
      assert.equal(severityOf('info'), 'suggestion');
      assert.equal(severityOf(undefined), 'suggestion');
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

  // --- buildEnvelope -----------------------------------------------------------
  {
    // structured-finding-layer/AS-9 + FR-005 — schema + summary counts
    name: 'buildEnvelope: findings/v1 schema and per-severity summary counts',
    fn: () => {
      const env = buildEnvelope({
        scope: 'pkg',
        findings: [finding('t.l.a', 'f', 1), finding('t.l.b', 'f', 2), { ...finding('t.l.c', 'f', 3), severity: 'warning' }],
        ran: 1,
      });
      assert.equal(env.schema, SCHEMA);
      assert.equal(env.schema, 'findings/v1');
      assert.equal(env.scope, 'pkg');
      const counts = Object.fromEntries(env.summary.map(s => [s.severity, s.count]));
      assert.equal(counts.error, 2);
      assert.equal(counts.warning, 1);
    },
  },
  {
    // structured-finding-layer/EC-001 — empty results but an adapter ran → ok
    name: 'buildEnvelope: no findings with an adapter that ran → status ok',
    fn: () => {
      const env = buildEnvelope({ scope: 'pkg', findings: [], ran: 1 });
      assert.deepEqual(env.findings, []);
      assert.equal(env.status, 'ok');
    },
  },
  {
    // structured-finding-layer/AS-4 — nothing ran → skip
    name: 'buildEnvelope: no adapter ran → status skip',
    fn: () => {
      const env = buildEnvelope({ scope: 'pkg', findings: [], ran: 0 });
      assert.equal(env.status, 'skip');
    },
  },
  {
    // structured-finding-layer/FR-005/FR-006 — skipped entry shape is pinned
    name: 'buildEnvelope: skipped entries carry exactly {lang, tool, reason, hint}',
    fn: () => {
      const env = buildEnvelope({
        scope: 'pkg',
        findings: [],
        ran: 0,
        skipped: [{ lang: 'go', tool: 'golangci-lint', reason: 'absent', hint: 'install it' }],
      });
      assert.deepEqual(Object.keys(env.skipped[0]).sort(), ['hint', 'lang', 'reason', 'tool']);
    },
  },

  // --- scan(): discovery + language-conditional probing ------------------------
  {
    // structured-finding-layer/AS-5 (positive) — an in-scope adapter runs
    name: 'scan: an adapter whose extension is in scope runs and yields findings',
    fn: () => {
      const adapter = fakeAdapter({ run: () => sarif(result('r', 'error', 'a.go', 1)) });
      const env = scan(['a.go'], { adapters: [adapter], cwd: '.' });
      assert.equal(env.status, 'ok');
      assert.equal(env.findings.length, 1);
      assert.equal(env.findings[0].rule_id, 'fake.go.r');
    },
  },
  {
    // structured-finding-layer/AS-5 — a language not in scope is never probed
    name: 'scan: an adapter is not probed when its extension is absent from scope',
    fn: () => {
      let probed = false;
      const adapter = fakeAdapter({ run: () => { probed = true; return sarif(); } });
      const env = scan(['app.py'], { adapters: [adapter], cwd: '.' });
      assert.equal(probed, false, 'go tool must not be probed on a python-only scope');
      assert.equal(env.status, 'skip');
    },
  },
  {
    // structured-finding-layer/design-suggestion — mixed supported/unsupported scope
    name: 'scan: a mixed scope runs the supported adapter and ignores unsupported files',
    fn: () => {
      let probed = false;
      const adapter = fakeAdapter({ run: () => { probed = true; return sarif(); } });
      const env = scan(['a.go', 'b.py'], { adapters: [adapter], cwd: '.' });
      assert.equal(probed, true, 'go adapter runs because .go is in scope');
      assert.equal(env.status, 'ok');
    },
  },

  // --- scan(): graceful degradation matrix -------------------------------------
  {
    // structured-finding-layer/AS-4 + AS-6 — absent tool → skipped, status skip
    name: 'scan: an in-scope adapter with no tool → skipped-with-hint, status skip',
    fn: () => {
      const adapter = fakeAdapter({ run: () => null });
      const env = scan(['a.go'], { adapters: [adapter], cwd: '.' });
      assert.equal(env.status, 'skip');
      assert.equal(env.skipped[0].reason, 'unavailable');
      assert.match(env.skipped[0].hint, /install/i);
    },
  },
  {
    // structured-finding-layer/AS-6 — a crashing adapter degrades, never throws
    name: 'scan: an adapter whose run() throws is skipped, not propagated',
    fn: () => {
      const adapter = fakeAdapter({ run: () => { throw new Error('tool exploded'); } });
      const env = scan(['a.go'], { adapters: [adapter], cwd: '.' });
      assert.notEqual(env.status, 'fail');
      assert.equal(env.skipped[0].reason, 'error');
    },
  },
  {
    // structured-finding-layer/EC-002 — malformed SARIF → skip-with-hint, no crash
    name: 'scan: an adapter returning malformed SARIF is skipped, not crashed',
    fn: () => {
      const adapter = fakeAdapter({ run: () => 'not json', normalize: undefined });
      // normalize on garbage must throw internally and be caught by scan.
      const withNormalize = { ...adapter, normalize: s => normalize(s, { tool: 'fake', lang: 'go' }) };
      const env = scan(['a.go'], { adapters: [withNormalize], cwd: '.' });
      assert.notEqual(env.status, 'fail');
      assert.equal(env.skipped[0].reason, 'malformed-output');
    },
  },
  {
    // structured-finding-layer/EC-005 — only-unsupported scope → skip + explicit note
    name: 'scan: a scope with no applicable adapter → status skip with a note',
    fn: () => {
      const adapter = fakeAdapter();
      const env = scan(['app.py', 'app.rb'], { adapters: [adapter], cwd: '.' });
      assert.equal(env.status, 'skip');
      assert.match(env.note || '', /no .*adapter|unsupported/i);
    },
  },
  {
    // structured-finding-layer/FR-009 — CLI usage error → exit 1
    name: 'CLI: missing scope argument exits 1',
    fn: () => {
      const r = runCli('scan');
      assert.equal(r.status, 1);
    },
  },
  {
    // structured-finding-layer/AS-4/FR-009 — findings are data: CLI never fails for "found problems"
    name: 'CLI: scan over a real path exits 0 and prints a findings/v1 envelope',
    fn: () => {
      const r = runCli('scan', path.join(__dirname, '..'));
      assert.equal(r.status, 0, r.stderr);
      assert.match(r.stdout, /"schema": "findings\/v1"/);
    },
  },
  {
    // structured-finding-layer/FR-009 — an unreadable scope path is a usage error (exit 1)
    name: 'CLI: a nonexistent scope path exits 1 with a read error',
    fn: () => {
      const r = runCli('scan', path.join(os.tmpdir(), 'sfl-does-not-exist-xyz'));
      assert.equal(r.status, 1);
      assert.match(r.stderr, /cannot read scope/i);
    },
  },
  {
    // structured-finding-layer/FR-008 — walk prunes VCS/dependency/hidden dirs
    name: 'walk: excludes node_modules, .git and dotfiles from the scanned scope',
    fn: () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sfl-walk-'));
      try {
        fs.writeFileSync(path.join(root, 'keep.go'), '');
        fs.mkdirSync(path.join(root, 'node_modules'));
        fs.writeFileSync(path.join(root, 'node_modules', 'dep.go'), '');
        fs.mkdirSync(path.join(root, '.git'));
        fs.writeFileSync(path.join(root, '.git', 'HEAD'), '');
        fs.writeFileSync(path.join(root, '.hidden.go'), '');
        const found = walk(root, [], 0).map(p => path.basename(p));
        assert.deepEqual(found, ['keep.go']);
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    },
  },
];
