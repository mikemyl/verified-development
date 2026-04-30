'use strict';

/**
 * hooks/lib/state.js
 *
 * Read/write helpers for .verified/state.md.
 *
 * Schema v2 frontmatter (this version):
 *   feature, phase, status, last_activity, schema_version: 2,
 *   active_phase, next_action, next_phases
 *
 * Schema v1 (legacy, no schema_version key) is read transparently — missing
 * fields default to safe values; the next write bumps the file to v2.
 *
 * Atomic writes via temp + rename. State.md is capped at 100 lines —
 * per the spec, it is a digest, not an archive.
 */

const fs = require('fs');
const path = require('path');

const STATE_FILE = 'state.md';
const STATE_DIR = '.verified';
const SCHEMA_VERSION = 2;
const MAX_LINES = 100;
const PHASES = ['specify', 'ui-spec', 'plan', 'implement', 'verify', 'review', 'quick'];

const DEFAULT_FRONTMATTER = Object.freeze({
  feature: 'none',
  phase: '',
  status: '',
  last_activity: '',
  active_phase: '',
  next_action: '',
  next_phases: [],
  schema_version: SCHEMA_VERSION,
});

class StateError extends Error {
  constructor(message) {
    super(message);
    this.name = 'StateError';
  }
}

function statePath(verifiedDir) {
  // Accept either the project root or the .verified dir itself.
  if (path.basename(verifiedDir) === STATE_DIR) return path.join(verifiedDir, STATE_FILE);
  return path.join(verifiedDir, STATE_DIR, STATE_FILE);
}

function parseFrontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { frontmatter: {}, body: text };
  const fmBlock = m[1];
  const body = m[2];

  const fm = {};
  const lines = fmBlock.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const kv = line.match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1];
    let value = kv[2];

    // Inline list: `key: [a, b, c]`
    if (/^\[.*\]$/.test(value)) {
      value = value
        .slice(1, -1)
        .split(',')
        .map(s => s.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean);
      fm[key] = value;
      continue;
    }

    // Quoted string
    if (/^".*"$/.test(value) || /^'.*'$/.test(value)) {
      fm[key] = value.slice(1, -1);
      continue;
    }

    // Numeric
    if (/^-?\d+$/.test(value)) {
      fm[key] = Number(value);
      continue;
    }

    fm[key] = value;
  }
  return { frontmatter: fm, body };
}

function serializeFrontmatter(fm) {
  const lines = ['---'];
  // Stable key order: well-known fields first, then any extras alphabetically.
  const knownOrder = [
    'feature',
    'phase',
    'status',
    'last_activity',
    'active_phase',
    'next_action',
    'next_phases',
    'schema_version',
  ];
  const keys = [
    ...knownOrder.filter(k => k in fm),
    ...Object.keys(fm).filter(k => !knownOrder.includes(k)).sort(),
  ];
  for (const k of keys) {
    const v = fm[k];
    if (Array.isArray(v)) {
      const items = v.map(s => (typeof s === 'string' ? `"${s}"` : String(s)));
      lines.push(`${k}: [${items.join(', ')}]`);
    } else if (typeof v === 'number') {
      lines.push(`${k}: ${v}`);
    } else {
      // Always quote strings so colons / specials don't break parsing.
      const safe = String(v).replace(/"/g, '\\"');
      lines.push(`${k}: "${safe}"`);
    }
  }
  lines.push('---');
  return lines.join('\n');
}

function applyDefaults(fm) {
  const upgraded = { ...DEFAULT_FRONTMATTER, ...fm };
  // Coerce next_phases to an array if a v1 file accidentally had a string.
  if (!Array.isArray(upgraded.next_phases)) {
    upgraded.next_phases = upgraded.next_phases ? [String(upgraded.next_phases)] : [];
  }
  // schema_version: missing -> 1 on read, bumped to 2 on next write.
  if (!('schema_version' in fm)) upgraded.schema_version = 1;
  return upgraded;
}

function read(verifiedDir) {
  const p = statePath(verifiedDir);
  if (!fs.existsSync(p)) return null;
  const raw = fs.readFileSync(p, 'utf8');
  const { frontmatter, body } = parseFrontmatter(raw);
  const fm = applyDefaults(frontmatter);
  return { frontmatter: fm, body, path: p };
}

function validate(fm) {
  if (!fm || typeof fm !== 'object') throw new StateError('frontmatter must be an object');
  if (typeof fm.feature !== 'string' || !fm.feature) {
    throw new StateError('feature: required string');
  }
  if (fm.phase && !PHASES.includes(fm.phase) && fm.phase !== '') {
    throw new StateError(`phase: not in [${PHASES.join(', ')}] (got "${fm.phase}")`);
  }
  if (fm.active_phase && !PHASES.includes(fm.active_phase) && fm.active_phase !== '') {
    throw new StateError(`active_phase: not in [${PHASES.join(', ')}] (got "${fm.active_phase}")`);
  }
  if (!Array.isArray(fm.next_phases)) {
    throw new StateError('next_phases: must be an array');
  }
}

function write(verifiedDir, { frontmatter, body }) {
  const fm = { ...frontmatter, schema_version: SCHEMA_VERSION };
  validate(fm);

  const out = `${serializeFrontmatter(fm)}\n${body || ''}`;
  const lines = out.split(/\r?\n/);
  if (lines.length > MAX_LINES) {
    throw new StateError(`state.md size cap: ${lines.length} lines > ${MAX_LINES}`);
  }

  const p = statePath(verifiedDir);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.tmp.${process.pid}.${Date.now()}`;
  fs.writeFileSync(tmp, out, { encoding: 'utf8', mode: 0o644 });
  fs.renameSync(tmp, p);
}

function update(verifiedDir, patch) {
  if (!patch || typeof patch !== 'object') throw new StateError('patch must be an object');
  const current = read(verifiedDir);
  if (!current) throw new StateError(`no state.md at ${statePath(verifiedDir)}`);
  const merged = { ...current.frontmatter, ...patch };
  if (!('last_activity' in patch)) {
    merged.last_activity = new Date().toISOString().slice(0, 10);
  }
  write(verifiedDir, { frontmatter: merged, body: current.body });
  return merged;
}

module.exports = {
  read,
  write,
  update,
  validate,
  parseFrontmatter,
  serializeFrontmatter,
  StateError,
  SCHEMA_VERSION,
  PHASES,
  STATE_FILE,
  STATE_DIR,
  MAX_LINES,
};
