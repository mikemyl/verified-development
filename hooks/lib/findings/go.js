'use strict';

/**
 * Go static-analysis adapter for hooks/lib/findings.js.
 *
 * Contract (shared by every findings adapter, auto-loaded by extension):
 *   { lang, extensions, tool, run(scope) -> sarifText|null, normalize(sarifText) -> finding[] }
 *
 * `normalize` is pure and defers to findings.js (unit-tested against a fixture,
 * no tool). `run` is the runtime seam: it invokes golangci-lint at MODULE scope
 * (`run ./...`), NOT per-file — golangci-lint is package-aware and per-file
 * invocation drops cross-file findings. It returns SARIF text, or null when the
 * tool is absent or errors (the caller degrades to skip-with-hint, never fails).
 */

const { spawnSync } = require('child_process');
const { normalize } = require('../findings.js');

const TOOL = 'golangci-lint';
const CONTEXT = { tool: TOOL, lang: 'go' };

module.exports = {
  lang: 'go',
  extensions: ['.go'],
  tool: TOOL,

  normalize(sarifText) {
    return normalize(sarifText, CONTEXT);
  },

  /**
   * Run golangci-lint at module scope and return its SARIF text. Returns null
   * when the tool is missing or exits without producing SARIF — never throws,
   * so a missing/broken linter degrades rather than blocks.
   * @param {string} cwd  directory to run in (the module root)
   * @param {Function} [spawn]  injectable spawnSync (for tests); defaults to the real one
   * @returns {?string}
   */
  run(cwd, spawn = spawnSync) {
    let res;
    try {
      res = spawn(TOOL, ['run', '--out-format', 'sarif', './...'], { cwd, encoding: 'utf8' });
    } catch {
      return null; // spawn itself threw (e.g. tool absent on some platforms)
    }
    if (!res || res.error) return null; // ENOENT etc.
    const out = (res.stdout || '').trim();
    // golangci-lint exits non-zero when it finds issues — that is SUCCESS for
    // us as long as we got SARIF. Only a missing SARIF payload is a null.
    return out.startsWith('{') ? out : null;
  },
};
