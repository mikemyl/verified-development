'use strict';

/**
 * hooks/lib/handoff.js
 *
 * Atomic read/write/clear for handoff.json + continue-here.md, with
 * explicit field validation. The companion JSON Schema lives at
 * hooks/schemas/handoff.schema.json for documentation; validation here
 * enforces the same constraints with no external dependencies.
 *
 * Usage from a skill (the LLM invokes node):
 *   node ${CLAUDE_PLUGIN_ROOT}/hooks/lib/handoff.js read   <feature-dir>
 *   node ${CLAUDE_PLUGIN_ROOT}/hooks/lib/handoff.js write  <feature-dir>  (stdin = JSON)
 *   node ${CLAUDE_PLUGIN_ROOT}/hooks/lib/handoff.js update <feature-dir>  (stdin = patch JSON)
 *   node ${CLAUDE_PLUGIN_ROOT}/hooks/lib/handoff.js clear  <feature-dir>
 *   node ${CLAUDE_PLUGIN_ROOT}/hooks/lib/handoff.js validate              (stdin = JSON)
 *
 * Library usage (from another node module):
 *   const h = require('./handoff.js');
 *   h.read(featureDir); h.write(featureDir, data); ...
 */

const fs = require('fs');
const path = require('path');

const SCHEMA_VERSION = 1;
const PHASES = ['specify', 'ui-spec', 'plan', 'implement', 'verify', 'review', 'quick'];
const SEVERITIES = ['blocking', 'advisory'];

const HANDOFF_FILE = 'handoff.json';
const CONTINUE_FILE = 'continue-here.md';

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

function isObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function assertString(v, field, { min = 0 } = {}) {
  if (typeof v !== 'string') throw new ValidationError(`${field}: expected string`);
  if (v.length < min) throw new ValidationError(`${field}: length < ${min}`);
}

function assertArray(v, field) {
  if (!Array.isArray(v)) throw new ValidationError(`${field}: expected array`);
}

function assertEnum(v, allowed, field) {
  if (!allowed.includes(v)) throw new ValidationError(`${field}: not in [${allowed.join(', ')}]`);
}

function assertIsoDate(v, field) {
  if (typeof v !== 'string') throw new ValidationError(`${field}: expected ISO date-time string`);
  const t = Date.parse(v);
  if (Number.isNaN(t)) throw new ValidationError(`${field}: not a valid ISO date-time`);
}

function validateTask(t, field) {
  if (!isObject(t)) throw new ValidationError(`${field}: expected object`);
  assertString(t.id, `${field}.id`, { min: 1 });
  assertString(t.title, `${field}.title`, { min: 1 });
  if ('completed_at' in t) assertIsoDate(t.completed_at, `${field}.completed_at`);
}

function validateBlocker(b, field) {
  if (!isObject(b)) throw new ValidationError(`${field}: expected object`);
  assertEnum(b.severity, SEVERITIES, `${field}.severity`);
  assertString(b.description, `${field}.description`, { min: 1 });
  if ('raised_at' in b) assertIsoDate(b.raised_at, `${field}.raised_at`);
}

function validate(data) {
  if (!isObject(data)) throw new ValidationError('handoff: expected object');
  if (data.schema_version !== SCHEMA_VERSION) {
    throw new ValidationError(`schema_version: expected ${SCHEMA_VERSION}, got ${data.schema_version}`);
  }
  assertString(data.feature, 'feature', { min: 1 });
  assertEnum(data.phase, PHASES, 'phase');

  assertArray(data.completed_tasks, 'completed_tasks');
  data.completed_tasks.forEach((t, i) => validateTask(t, `completed_tasks[${i}]`));

  assertArray(data.remaining_tasks, 'remaining_tasks');
  data.remaining_tasks.forEach((t, i) => validateTask(t, `remaining_tasks[${i}]`));

  if ('blockers' in data) {
    assertArray(data.blockers, 'blockers');
    data.blockers.forEach((b, i) => validateBlocker(b, `blockers[${i}]`));
  }
  if ('decisions_made' in data) {
    assertArray(data.decisions_made, 'decisions_made');
    data.decisions_made.forEach((d, i) => assertString(d, `decisions_made[${i}]`, { min: 1 }));
  }

  assertString(data.git_head, 'git_head', { min: 7 });
  if (!/^[0-9a-f]{7,40}$/.test(data.git_head)) {
    throw new ValidationError('git_head: must be 7-40 lowercase hex chars');
  }
  assertIsoDate(data.timestamp, 'timestamp');

  if ('reason' in data && typeof data.reason !== 'string') {
    throw new ValidationError('reason: expected string');
  }

  // Reject unknown top-level keys.
  const allowed = new Set([
    'schema_version', 'feature', 'phase',
    'completed_tasks', 'remaining_tasks', 'blockers',
    'decisions_made', 'git_head', 'timestamp', 'reason',
  ]);
  for (const k of Object.keys(data)) {
    if (!allowed.has(k)) throw new ValidationError(`unknown field: ${k}`);
  }
  return data;
}

function handoffPath(featureDir) {
  return path.join(featureDir, HANDOFF_FILE);
}

function continuePath(featureDir) {
  return path.join(featureDir, CONTINUE_FILE);
}

function read(featureDir) {
  const p = handoffPath(featureDir);
  if (!fs.existsSync(p)) return null;
  const raw = fs.readFileSync(p, 'utf8');
  const data = JSON.parse(raw);
  return validate(data);
}

function atomicWriteFile(targetPath, content) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  // Same-filesystem rename is atomic on POSIX. Use a sibling tempfile so
  // we never cross a mount boundary.
  const tmp = `${targetPath}.tmp.${process.pid}.${Date.now()}`;
  fs.writeFileSync(tmp, content, { encoding: 'utf8', mode: 0o644 });
  fs.renameSync(tmp, targetPath);
}

function write(featureDir, data) {
  validate(data);
  atomicWriteFile(handoffPath(featureDir), JSON.stringify(data, null, 2) + '\n');
}

function update(featureDir, patch) {
  if (!isObject(patch)) throw new ValidationError('patch: expected object');
  const current = read(featureDir);
  if (!current) {
    throw new ValidationError('cannot update: no existing handoff (call write first)');
  }
  const merged = { ...current, ...patch };
  // Always refresh timestamp on update unless the caller explicitly provided one.
  if (!('timestamp' in patch)) {
    merged.timestamp = new Date().toISOString();
  }
  write(featureDir, merged);
  return merged;
}

function clear(featureDir) {
  for (const p of [handoffPath(featureDir), continuePath(featureDir)]) {
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
}

// --- CLI shim ----------------------------------------------------------------

async function readStdinJson() {
  return new Promise((resolve, reject) => {
    let buf = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', c => (buf += c));
    process.stdin.on('end', () => {
      try {
        resolve(JSON.parse(buf));
      } catch (err) {
        reject(new Error(`stdin is not valid JSON: ${err.message}`));
      }
    });
    process.stdin.on('error', reject);
  });
}

async function main() {
  const [, , cmd, featureDir] = process.argv;
  try {
    switch (cmd) {
      case 'read': {
        if (!featureDir) throw new Error('usage: handoff.js read <feature-dir>');
        const data = read(featureDir);
        process.stdout.write(data ? JSON.stringify(data, null, 2) + '\n' : '');
        return data ? 0 : 0;
      }
      case 'write': {
        if (!featureDir) throw new Error('usage: handoff.js write <feature-dir>');
        const data = await readStdinJson();
        write(featureDir, data);
        return 0;
      }
      case 'update': {
        if (!featureDir) throw new Error('usage: handoff.js update <feature-dir>');
        const patch = await readStdinJson();
        const merged = update(featureDir, patch);
        process.stdout.write(JSON.stringify(merged, null, 2) + '\n');
        return 0;
      }
      case 'clear': {
        if (!featureDir) throw new Error('usage: handoff.js clear <feature-dir>');
        clear(featureDir);
        return 0;
      }
      case 'validate': {
        const data = await readStdinJson();
        validate(data);
        process.stdout.write('ok\n');
        return 0;
      }
      default:
        throw new Error(`unknown command: ${cmd}\nusage: handoff.js <read|write|update|clear|validate> [feature-dir]`);
    }
  } catch (err) {
    process.stderr.write(`${err.name || 'Error'}: ${err.message}\n`);
    return 1;
  }
}

if (require.main === module) {
  main().then(code => process.exit(code));
}

module.exports = {
  read,
  write,
  update,
  clear,
  validate,
  ValidationError,
  SCHEMA_VERSION,
  PHASES,
  SEVERITIES,
  HANDOFF_FILE,
  CONTINUE_FILE,
  // Exposed for tests.
  _atomicWriteFile: atomicWriteFile,
};
