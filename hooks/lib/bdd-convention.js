'use strict';

/**
 * hooks/lib/bdd-convention.js
 *
 * Deterministically detect a repo's acceptance-test convention so /plan can
 * decide whether materializing the spec's Given/When/Then scenarios as runnable
 * `.feature` files is warranted. This RECORDS a decision — it never forces an
 * export: a repo with no cucumber-family runner is `none`/export:false, and its
 * existing scenario→task→test linkage (via test-gate's scenario traceability)
 * stands unchanged. No Gherkin scaffolding is imposed on a testdsl/page-object
 * repo. Model-free; mirrors the sibling hooks/lib contracts.
 *
 * classify({featureFileCount, manifestText}) -> {schema, convention, export, signals}
 *   convention: "gherkin" (a cucumber-family convention is present → export warranted)
 *             | "none"    (no such convention → no .feature export; linkage stands)
 *
 * CLI: bdd-convention.js detect <path>  -> prints the decision JSON.
 * Exit codes: 0 ok · 1 usage error.
 */

const SCHEMA = 'bdd-convention/v1';

// Cucumber-family runners across ecosystems (Go/JS/JVM/.NET/Python).
const RUNNER = /\b(godog|cucumber|@cucumber\/[\w-]+|reqnroll|specflow|behave|pytest[-_]bdd)\b/i;

/**
 * @param {{featureFileCount?: number, manifestText?: string}} input
 * @returns {{schema: string, convention: string, export: boolean, signals: string[]}}
 */
function classify(input = {}) {
  const featureFileCount = input.featureFileCount || 0;
  const manifestText = input.manifestText || '';

  const signals = [];
  if (featureFileCount > 0) signals.push(`feature-files:${featureFileCount}`);
  const m = manifestText.match(RUNNER);
  if (m) signals.push(`manifest:${m[1]}`);

  const gherkin = featureFileCount > 0 || Boolean(m);
  return {
    schema: SCHEMA,
    convention: gherkin ? 'gherkin' : 'none',
    export: gherkin,
    signals,
  };
}

// --- CLI shim ----------------------------------------------------------------

// Manifests worth scanning for a cucumber-family runner, per ecosystem.
const MANIFESTS = ['go.mod', 'package.json', 'pom.xml', 'build.gradle', 'requirements.txt', 'Gemfile'];

function detectFromDisk(root) {
  const fs = require('fs');
  const path = require('path');

  // Count .feature files (bounded walk; skip VCS/deps/hidden).
  let featureFileCount = 0;
  const walk = (dir, depth) => {
    if (depth > 12) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name === 'node_modules' || e.name === '.git' || e.name.startsWith('.')) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p, depth + 1);
      else if (e.name.endsWith('.feature')) featureFileCount += 1;
    }
  };
  walk(root, 0);

  // Concatenate any present manifests for a single runner scan.
  let manifestText = '';
  for (const name of MANIFESTS) {
    try {
      manifestText += fs.readFileSync(path.join(root, name), 'utf8') + '\n';
    } catch {
      /* absent manifest — skip */
    }
  }
  return classify({ featureFileCount, manifestText });
}

function main() {
  const [, , cmd, arg] = process.argv;
  if (cmd !== 'detect' || !arg) {
    process.stderr.write('usage: bdd-convention.js detect <path>\n');
    return 1;
  }
  process.stdout.write(JSON.stringify(detectFromDisk(arg), null, 2) + '\n');
  return 0;
}

if (require.main === module) {
  process.exit(main());
}

module.exports = {
  classify,
  detectFromDisk,
  SCHEMA,
};
