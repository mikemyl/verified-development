#!/usr/bin/env node
/**
 * tests/run.cjs — minimal test runner
 *
 * Discovers *.test.cjs files in this directory and executes them in order.
 * A test file is a CommonJS module exporting an array of {name, fn} objects
 * (or a single {name, fn}). Each fn() throws on failure.
 *
 * Why no jest/vitest: the surface tested here is plugin prompt content,
 * JSON schema, and small JS library helpers. A 60-line runner is plenty
 * and has zero install footprint for plugin consumers.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const TESTS_DIR = __dirname;

function findTests() {
  return fs
    .readdirSync(TESTS_DIR)
    .filter(f => f.endsWith('.test.cjs'))
    .map(f => path.join(TESTS_DIR, f))
    .sort();
}

function loadTests(file) {
  const mod = require(file);
  if (Array.isArray(mod)) return mod;
  if (mod && typeof mod.fn === 'function') return [mod];
  throw new Error(`${file}: must export an array of {name, fn} or a single {name, fn}`);
}

const files = findTests();
if (files.length === 0) {
  process.stdout.write('no tests found\n');
  process.exit(0);
}

let passed = 0;
let failed = 0;
const failures = [];

for (const file of files) {
  const rel = path.relative(TESTS_DIR, file);
  let cases;
  try {
    cases = loadTests(file);
  } catch (err) {
    process.stderr.write(`load error: ${rel}\n  ${err.message}\n`);
    failed++;
    failures.push({ file: rel, name: '(load)', err });
    continue;
  }
  for (const { name, fn } of cases) {
    try {
      fn();
      passed++;
      process.stdout.write(`ok  ${rel} :: ${name}\n`);
    } catch (err) {
      failed++;
      failures.push({ file: rel, name, err });
      process.stderr.write(`FAIL ${rel} :: ${name}\n  ${err.message}\n`);
    }
  }
}

process.stdout.write(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) {
  process.stderr.write('\nFailures:\n');
  for (const f of failures) {
    process.stderr.write(`  - ${f.file} :: ${f.name}\n    ${f.err.stack || f.err.message}\n`);
  }
  process.exit(1);
}
process.exit(0);
