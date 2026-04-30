#!/usr/bin/env node
/**
 * lint-descriptions.cjs
 *
 * Enforces the 100-char description budget for skill/command frontmatter.
 *
 * Why 100 chars? Skill descriptions live in the LLM's discovery context for
 * every session. They must be specific enough to trigger correctly and short
 * enough to leave context budget for actual work. Anti-patterns to avoid:
 *   - Flag/argument docs (move to argument-hint:)
 *   - "Triggers on:" keyword stuffing (the description IS the trigger)
 *   - Numbered enumerations / multi-sentence prose
 *
 * Usage:
 *   node scripts/lint-descriptions.cjs                    # scan defaults
 *   node scripts/lint-descriptions.cjs path/to/SKILL.md   # scan specific files
 *
 * Exits 1 if any description exceeds the budget; exits 0 otherwise.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const MAX_LENGTH = 100;
const ROOT = path.join(__dirname, '..');
const SKILL_DIRS = ['skills'];
const COMMAND_DIRS = ['commands'];
const AGENT_DIRS = ['agents'];

function findSkillFiles(dir) {
  const out = [];
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return out;
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const skillFile = path.join(abs, entry.name, 'SKILL.md');
    if (fs.existsSync(skillFile)) out.push(skillFile);
  }
  return out;
}

function findCommandFiles(dir) {
  const out = [];
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return out;
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.md')) {
      out.push(path.join(abs, entry.name));
    }
  }
  return out;
}

/**
 * Extract description from frontmatter. Handles:
 *   - description: "quoted"
 *   - description: plain
 *   - description: >- (folded block scalar, multi-line)
 *   - description: > (folded block scalar)
 *   - description: |- / | (literal block — joined with spaces)
 */
function parseDescription(content) {
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fmMatch) return null;
  const fm = fmMatch[1];

  const folded = fm.match(/^description:\s*[>|][-+]?\s*\r?\n((?:[ \t]+[^\n]*\r?\n?)+)/m);
  if (folded) {
    return folded[1]
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(Boolean)
      .join(' ');
  }

  const quoted = fm.match(/^description:\s+"((?:[^"\\]|\\.)*)"\s*$/m);
  if (quoted) return quoted[1];

  const single = fm.match(/^description:\s+'((?:[^'\\]|\\.)*)'\s*$/m);
  if (single) return single[1];

  const plain = fm.match(/^description:\s+(.+)$/m);
  if (plain) return plain[1].trim();

  return null;
}

function getFiles() {
  if (process.argv.length > 2) return process.argv.slice(2);
  const skills = SKILL_DIRS.flatMap(findSkillFiles);
  const commands = COMMAND_DIRS.flatMap(findCommandFiles);
  // Agents are flat .md files in agents/ (same shape as commands).
  const agents = AGENT_DIRS.flatMap(findCommandFiles);
  return [...skills, ...commands, ...agents];
}

const files = getFiles();
const violations = [];

for (const filePath of files) {
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    process.stderr.write(`ERROR: Cannot read file: ${filePath}\n  ${err.message}\n`);
    process.exit(1);
  }

  const description = parseDescription(content);
  if (description === null) continue;
  if (description.length > MAX_LENGTH) {
    violations.push({ filePath, length: description.length, description });
  }
}

const rel = p => path.relative(ROOT, p);

if (violations.length === 0) {
  process.stdout.write(`ok lint-descriptions: ${files.length} file(s) checked, 0 violations\n`);
  process.exit(0);
}

process.stderr.write(`\nERROR lint-descriptions: ${violations.length} violation(s) found (max ${MAX_LENGTH} chars)\n\n`);
for (const v of violations) {
  const preview = v.description.length > 140 ? v.description.slice(0, 137) + '...' : v.description;
  process.stderr.write(`  ${rel(v.filePath)}\n`);
  process.stderr.write(`    Length : ${v.length}\n`);
  process.stderr.write(`    Desc   : ${preview}\n\n`);
}
process.stderr.write(`Trim to <= ${MAX_LENGTH} chars. Move flag docs to argument-hint:; drop "Triggers:" stuffing.\n\n`);
process.exit(1);
