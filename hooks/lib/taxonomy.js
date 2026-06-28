'use strict';

/**
 * hooks/lib/taxonomy.js
 *
 * Resolves the test taxonomy for a repo. A taxonomy is the set of sanctioned
 * test "types" (acceptance, dao, unit, none, …), each with a boundary, required
 * pattern, location, tier, when-to-use guidance, named primitives, and an
 * optional Mermaid harness diagram.
 *
 * Two roles:
 *   1. parse a `## Test Types` markdown section into a typed map (parseTaxonomy);
 *   2. resolve repo-defined-taxonomy-else-shipped-seed (resolve). The repo
 *      taxonomy, when present and non-empty, is AUTHORITATIVE — it replaces the
 *      seed rather than merging with it (FR-003 / AS-010). The seed lives in
 *      `hooks/lib/test-types-seed.md` and is the fallback when a repo defines no
 *      `## Test Types` section (EC-002).
 *
 * Markdown contract (one `### <name>` subsection per type under the single
 * `## Test Types` H2):
 *   - **boundary:** …     → type.boundary    (string)
 *   - **pattern:** …      → type.pattern     (string)
 *   - **location:** …     → type.location    (string)
 *   - **tier:** …         → type.tier        (string)
 *   - **when-to-use:** …  → type.when_to_use (string; hyphen→underscore key)
 *   - **primitives:** …   → type.primitives  (string)
 *   - a fenced ```mermaid block in the subsection → type.has_diagram (boolean)
 *
 * Optional extension fields (additive, non-breaking — NOT required; their
 * absence never produces a defect, FR-011 / AS-011). Hyphen→underscore keys:
 *   - **match-paths:**   → type.match_paths   (string[]; comma-split, trimmed)
 *   - **match-markers:** → type.match_markers (string[]; comma-split, trimmed)
 *   - **anti-patterns:** → type.anti_patterns (string[]; comma-split, trimmed)
 *   - **good-example:**  → type.good_example  (string|null)
 *   - **bad-example:**   → type.bad_example   (string|null)
 * Defaults when omitted: array fields → [], example fields → null. Sentinel
 * coercion: a list value of `—` (em-dash) or empty → []; an example value of
 * `n/a` / `—` / empty → null.
 *
 * A type missing any required field is reported in `defects` as `{type, field}`
 * rather than throwing — callers (the gate) decide policy (EC-003). A subsection
 * with prose but no mermaid fence parses fine with has_diagram:false (EC-004).
 *
 * Output shapes:
 *   parseTaxonomy(md) → { types: {<name>: typeObj}, defects: [{type, field}] }
 *   loadSeed()        → same shape, read from test-types-seed.md
 *   resolve({repoDoc})→ { types, source: "repo"|"seed", defects: [{type,field}] }
 *
 * Usage from a skill (the LLM invokes node):
 *   node ${CLAUDE_PLUGIN_ROOT}/hooks/lib/taxonomy.js resolve <testing.md|->
 *
 * Library usage:
 *   const { resolve } = require('./taxonomy.js');
 *   const { types, source, defects } = resolve({ repoDoc });
 *
 * Exit codes (CLI): 0 ok · 1 usage / read error.
 */

const fs = require('fs');
const path = require('path');

const REQUIRED_FIELDS = ['boundary', 'pattern', 'location', 'tier', 'when_to_use', 'primitives'];

// Optional list fields (normalized keys). Comma-split + trim → string[].
const ARRAY_FIELDS = ['match_paths', 'match_markers', 'anti_patterns'];
// Optional scalar example fields (normalized keys). Trimmed string | null.
const EXAMPLE_FIELDS = ['good_example', 'bad_example'];
// A list value of `—`/empty → []; an example value of `n/a`/`—`/empty → null.
const LIST_SENTINELS = new Set(['', '—']);
const EXAMPLE_SENTINELS = new Set(['', '—', 'n/a']);

const TEST_TYPES_H2_RE = /^##\s+Test Types\s*$/;
const ANY_H2_RE = /^##\s+/;
const H3_RE = /^###\s+(.+?)\s*$/;
// `- **field:** value` — captures the field name and the trailing value.
const FIELD_RE = /^\s*[-*]\s*\*\*([^:*]+):\*\*\s*(.*)$/;
const MERMAID_OPEN_RE = /^```mermaid\b/;
const FENCE_RE = /^```/;

function normaliseFieldKey(name) {
  return name.trim().toLowerCase().replace(/-/g, '_');
}

/**
 * Coerce a raw list-field value into a trimmed string[]. A sentinel (`—`) or
 * empty value yields [] rather than ["—"].
 *
 * @param {string} raw
 * @returns {string[]}
 */
function parseListField(raw) {
  if (LIST_SENTINELS.has(raw)) return [];
  return raw
    .split(',')
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

/**
 * Coerce a raw example-field value into a trimmed string or null. A sentinel
 * (`n/a`, `—`) or empty value yields null.
 *
 * @param {string} raw
 * @returns {?string}
 */
function parseExampleField(raw) {
  if (EXAMPLE_SENTINELS.has(raw.toLowerCase())) return null;
  return raw;
}

/**
 * Slice the lines belonging to the single `## Test Types` section (everything
 * after its heading, up to the next H2 or EOF). Returns null if no such H2.
 *
 * @param {string[]} lines
 * @returns {?string[]}
 */
function sliceTestTypesSection(lines) {
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (TEST_TYPES_H2_RE.test(lines[i])) {
      start = i + 1;
      break;
    }
  }
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start; i < lines.length; i++) {
    if (ANY_H2_RE.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end);
}

/**
 * Fill optional-field defaults for every parsed type in place: an absent list
 * field becomes [], an absent example field becomes null. Mutates and returns
 * the same `types` map.
 *
 * @param {Object.<string, Object>} types
 * @returns {Object.<string, Object>}
 */
function fillOptionalDefaults(types) {
  for (const name of Object.keys(types)) {
    const obj = types[name];
    for (const f of ARRAY_FIELDS) {
      if (!Array.isArray(obj[f])) obj[f] = [];
    }
    for (const f of EXAMPLE_FIELDS) {
      if (typeof obj[f] !== 'string') obj[f] = null;
    }
  }
  return types;
}

/**
 * Validate required fields per type. Returns a `defects` array (never throws);
 * callers decide policy (EC-003).
 *
 * @param {Object.<string, Object>} types
 * @returns {Array<{type: string, field: string}>}
 */
function validateTypes(types) {
  const defects = [];
  for (const name of Object.keys(types)) {
    for (const f of REQUIRED_FIELDS) {
      const v = types[name][f];
      if (typeof v !== 'string' || v.length === 0) {
        defects.push({ type: name, field: f });
      }
    }
  }
  return defects;
}

/**
 * Parse the `### <name>` subsections of a `## Test Types` section into a typed
 * map. Optional fields are left absent here — defaulting happens separately in
 * fillOptionalDefaults.
 *
 * @param {string[]} section
 * @returns {Object.<string, Object>}
 */
function parseTypeSections(section) {
  const types = {};
  let current = null; // { name, obj }
  let inMermaid = false;

  for (const line of section) {
    if (inMermaid) {
      if (FENCE_RE.test(line)) inMermaid = false;
      continue;
    }

    const h3 = H3_RE.exec(line);
    if (h3) {
      const name = h3[1].trim();
      current = { name, obj: { has_diagram: false } };
      types[name] = current.obj;
      continue;
    }

    if (!current) continue;

    if (MERMAID_OPEN_RE.test(line)) {
      current.obj.has_diagram = true;
      inMermaid = true;
      continue;
    }

    const field = FIELD_RE.exec(line);
    if (field) {
      const key = normaliseFieldKey(field[1]);
      const raw = field[2].trim();
      if (ARRAY_FIELDS.includes(key)) {
        current.obj[key] = parseListField(raw);
      } else if (EXAMPLE_FIELDS.includes(key)) {
        current.obj[key] = parseExampleField(raw);
      } else {
        current.obj[key] = raw;
      }
    }
  }

  return types;
}

/**
 * Parse a `## Test Types` markdown document into a taxonomy map.
 *
 * Pipeline: parse subsections → fill optional defaults → validate required
 * fields → return.
 *
 * @param {string} md
 * @returns {{types: Object.<string, Object>, defects: Array<{type: string, field: string}>}}
 */
function parseTaxonomy(md) {
  const lines = String(md).split(/\r?\n/);

  const section = sliceTestTypesSection(lines);
  if (!section) return { types: {}, defects: [] };

  const types = fillOptionalDefaults(parseTypeSections(section));
  const defects = validateTypes(types);

  return { types, defects };
}

/**
 * Parse the shipped seed taxonomy (the fallback when a repo defines none).
 *
 * @returns {{types: Object.<string, Object>, defects: Array<{type: string, field: string}>}}
 */
function loadSeed() {
  const seedPath = path.join(__dirname, 'test-types-seed.md');
  return parseTaxonomy(fs.readFileSync(seedPath, 'utf8'));
}

/**
 * Resolve the taxonomy: the repo doc when it carries a non-empty
 * `## Test Types` section (≥1 `### ` subsection), else the shipped seed.
 * Repo taxonomy is authoritative — never merged with the seed (AS-010).
 *
 * @param {{repoDoc?: string}} [opts]
 * @returns {{types: Object, source: "repo"|"seed", defects: Array}}
 */
function resolve({ repoDoc } = {}) {
  if (typeof repoDoc === 'string') {
    const parsed = parseTaxonomy(repoDoc);
    if (Object.keys(parsed.types).length > 0) {
      return { types: parsed.types, source: 'repo', defects: parsed.defects };
    }
  }
  const seed = loadSeed();
  return { types: seed.types, source: 'seed', defects: seed.defects };
}

// --- CLI shim ----------------------------------------------------------------

function readSource(arg) {
  if (arg === '-') return fs.readFileSync(0, 'utf8');
  return fs.readFileSync(arg, 'utf8');
}

function main() {
  const [, , cmd, arg] = process.argv;
  if (cmd !== 'resolve' || !arg) {
    process.stderr.write('usage: taxonomy.js resolve <testing.md|->\n');
    return 1;
  }
  let repoDoc;
  try {
    repoDoc = readSource(arg);
  } catch (err) {
    process.stderr.write(`cannot read testing doc: ${err.message}\n`);
    return 1;
  }
  const resolved = resolve({ repoDoc });
  process.stdout.write(JSON.stringify(resolved, null, 2) + '\n');
  return 0;
}

if (require.main === module) {
  process.exit(main());
}

module.exports = {
  parseTaxonomy,
  loadSeed,
  resolve,
  REQUIRED_FIELDS,
  ARRAY_FIELDS,
};
