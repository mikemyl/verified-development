'use strict';

/**
 * hooks/lib/repair-routing.js
 *
 * Deterministic failure routing + dead-end detection for the /implement repair
 * loop. When an executor's test run fails, the LLM should NOT free-associate a
 * retry strategy — this script classifies the failure against a fixed table and
 * returns a route, and it decides when the loop is stuck (two consecutive
 * iterations with the same normalized failure signature). A script makes the
 * route / stop decision, not the model — same doctrine as waves.js/test-gate.js.
 *
 * Public API (library):
 *   classify(failureText, exitCode) -> { class, route }
 *   signature(failureText)          -> string        (stable hash; volatile stripped)
 *   isDeadEnd(prevSig, curSig)      -> boolean       (two equal, non-null sigs)
 *   failingTests(failureText)       -> string[]      (sorted, unique test ids)
 *   failureDiff(prevText, curText)  -> { resolved, remaining, newly_failing }
 *
 * classify NEVER throws and always returns a route: an unmatched failure yields
 * { class: 'unclassified', route: 'retry' } — i.e. today's generic-retry path,
 * so nothing regresses when a diagnostic is unfamiliar.
 *
 * CLI:
 *   repair-routing.js classify <exitCode> < failure.txt   -> prints the contract JSON
 *   repair-routing.js signature            < failure.txt   -> prints the signature
 * Exit codes: 0 ok · 1 usage error.
 */

const fs = require('fs');
const crypto = require('crypto');

const SCHEMA = 'repair-routing/v1';

/**
 * Ordered classification table. First match wins, so the more specific /
 * higher-priority signals (compile, security, lint, coverage) are tested before
 * the broad behavioral-test catch. Each `test` is a pure predicate over the
 * failure text; the table is data, not code, so adding a class is one row.
 */
const RULES = [
  {
    class: 'compile',
    route: 'fix-inline',
    test: t =>
      /\bundefined:|\bcannot find\b|\bunresolved\b|SyntaxError|\bexpected declaration\b|is not defined\b|cannot use .* as .* value|no such (?:module|file)|\bimport cycle\b/i.test(
        t,
      ),
  },
  {
    class: 'security-finding',
    route: 'dispatch:security-review',
    test: t => /\bgosec\b|\bG\d{3}\b|\bCVE-\d|vulnerab|\binjection\b|hardcoded (?:cred|secret|password)|govulncheck/i.test(t),
  },
  {
    class: 'lint-format',
    route: 'fix-inline',
    test: t => /\bgofmt\b|\beslint\b|\bprettier\b|\brevive\b|\bgolangci-lint\b|\blint(?:er|ing)?\b|not formatted|would reformat/i.test(t),
  },
  {
    class: 'coverage-gap',
    route: 'generate-test',
    test: t => /\bcoverage\b|below (?:the )?threshold|uncovered|not covered/i.test(t),
  },
  {
    class: 'reviewer-conflict',
    route: 'escalate:human',
    test: t => /conflicting (?:reviewer|finding)|cannot reconcile|reviewer conflict/i.test(t),
  },
  {
    class: 'behavioral-test',
    route: 'systematic-debug',
    test: t => /---\s*FAIL:|\bFAIL\b|AssertionError|assert(?:ion)? (?:failed|error)|expected .* (?:but )?got|want .* got|Error Trace:|✗/i.test(t),
  },
];

function classify(failureText, exitCode) {
  const text = String(failureText || '');
  // Exit 0 means the command succeeded — there is no failure to route, even if
  // stray text was captured. (exitCode is null when the caller has none.)
  if (exitCode === 0) return { class: 'unclassified', route: 'retry' };
  for (const rule of RULES) {
    if (rule.test(text)) return { class: rule.class, route: rule.route };
  }
  // Unmatched: preserve the generic-retry behavior so an unfamiliar diagnostic
  // never blocks the loop. New signals are added as RULES rows (regex) here.
  return { class: 'unclassified', route: 'retry' };
}

// Tokens that vary run-to-run but carry no diagnostic identity. Stripped before
// a signature is computed so a genuinely-unchanged failure hashes identically.
const VOLATILE = [
  /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?/g, // ISO timestamps
  /\b\d{1,2}:\d{2}:\d{2}(?:\.\d+)?\b/g, // clock times
  /0x[0-9a-fA-F]+/g, // hex addresses
  /\b\d+(?:\.\d+)?(?:ns|µs|us|ms|s)\b/g, // durations
  /\bpid\s*\d+\b/gi, // pids
  /\(\d+(?:\.\d+)?s\)/g, // go's trailing "(0.01s)"
  /\/(?:tmp|var\/folders|private\/tmp)\/\S+/g, // absolute temp paths
];

function stripVolatile(text) {
  let t = String(text || '');
  for (const re of VOLATILE) t = t.replace(re, '');
  return t.replace(/[ \t]+/g, ' ').trim();
}

const FAIL_RES = [
  /---\s*FAIL:\s*(\S+)/g, // go test
  /\bFAIL\s+(\S+)/g, // generic
  /✗\s+([^\n]+?)(?:\s*\(|$)/gm, // tap-ish / vitest
  /✕\s+([^\n]+?)(?:\s*\(|$)/gm,
];

function failingTests(failureText) {
  const text = String(failureText || '');
  const ids = new Set();
  for (const re of FAIL_RES) {
    for (const m of text.matchAll(re)) {
      const id = m[1].trim();
      // Drop parenthetical noise a broad capture might trail, e.g. "TestA (dup)".
      const clean = id.replace(/\s*\(.*$/, '').trim();
      if (clean) ids.add(clean);
    }
  }
  return [...ids].sort();
}

/**
 * A signature identifies a failure by WHAT is broken, not the surrounding
 * output. Basis = the failing test ids when any are recognizable; otherwise the
 * volatile-stripped text (for compile/lint failures that name no test). The
 * error class is folded in so an identical test set failing a different way is
 * still distinguishable.
 */
function signature(failureText) {
  const text = String(failureText || '');
  const ids = failingTests(text);
  const basis = ids.length ? ids.join('|') : stripVolatile(text);
  const cls = classify(text, null).class;
  return crypto.createHash('sha1').update(cls + '::' + basis).digest('hex');
}

function isDeadEnd(prevSig, curSig) {
  return Boolean(prevSig) && Boolean(curSig) && prevSig === curSig;
}

function failureDiff(prevText, curText) {
  const prev = failingTests(prevText);
  const cur = failingTests(curText);
  const curSet = new Set(cur);
  const prevSet = new Set(prev);
  return {
    resolved: prev.filter(id => !curSet.has(id)),
    remaining: prev.filter(id => curSet.has(id)),
    newly_failing: cur.filter(id => !prevSet.has(id)),
  };
}

// --- CLI shim ----------------------------------------------------------------

function main() {
  const [, , cmd, exitArg] = process.argv;
  if (cmd !== 'classify' && cmd !== 'signature') {
    process.stderr.write('usage: repair-routing.js <classify <exitCode>|signature> < failure.txt\n');
    return 1;
  }
  const text = fs.readFileSync(0, 'utf8');
  if (cmd === 'signature') {
    process.stdout.write(signature(text) + '\n');
    return 0;
  }
  const exitCode = exitArg === undefined ? null : parseInt(exitArg, 10);
  const routed = classify(text, exitCode);
  const out = {
    schema: SCHEMA,
    class: routed.class,
    route: routed.route,
    signature: signature(text),
    failing_tests: failingTests(text),
  };
  process.stdout.write(JSON.stringify(out, null, 2) + '\n');
  return 0;
}

if (require.main === module) {
  process.exit(main());
}

module.exports = {
  classify,
  signature,
  isDeadEnd,
  failingTests,
  failureDiff,
  stripVolatile,
  SCHEMA,
  RULES,
};
