'use strict';

/**
 * hooks/lib/lang-loader.js
 *
 * Shared loader for the per-language adapters under hooks/lib/lang/*. A module
 * there that exports an `extensions` array is an adapter; shared helpers without
 * one (e.g. cfamily.js) are skipped. Extracted from test-corpus.js so that module
 * and test-weakening.js share ONE loader instead of duplicating it (per
 * plan-critic-design). Result is cached for the process.
 *
 * Adapter shape: { id, extensions:[…], testFileGlobs:[…], discover, countAssertions }.
 */

const fs = require('fs');
const path = require('path');

const LANG_DIR = path.join(__dirname, 'lang');

let _adapters = null;

/** @returns {Array<{id,extensions,testFileGlobs,discover,countAssertions}>} */
function loadAdapters() {
  if (_adapters) return _adapters;
  const out = [];
  for (const entry of fs.readdirSync(LANG_DIR)) {
    if (!entry.endsWith('.js')) continue;
    const mod = require(path.join(LANG_DIR, entry));
    if (mod && Array.isArray(mod.extensions)) out.push(mod);
  }
  out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  _adapters = out;
  return out;
}

/** Build an extension→adapter map from the loaded adapters. */
function adapterByExtension() {
  const map = {};
  for (const adapter of loadAdapters()) {
    for (const ext of adapter.extensions) map[ext] = adapter;
  }
  return map;
}

/** Sorted list of supported-language ids. */
function supportedLanguageIds() {
  return loadAdapters().map(a => a.id);
}

const REGEX_SPECIALS = new Set('\\^$.|?+()[]{}'.split(''));

/**
 * Compile a portable path glob into an anchored RegExp. Deterministic and
 * host-glob-engine-independent. `**` crosses `/`; `*` stays within a segment;
 * everything else is literal. Shared by test-corpus.js and test-weakening.js.
 *
 * @param {string} glob
 * @returns {RegExp}
 */
function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      // Globstar: `**/` matches zero-or-more path segments (so `**/x` matches a
      // top-level `x` too); a bare `**` matches anything.
      if (glob[i + 2] === '/') {
        re += '(?:.*/)?';
        i += 2; // consume the second star and the slash
      } else {
        re += '.*';
        i++; // consume the second star
      }
    } else if (c === '*') {
      re += '[^/]*';
    } else if (REGEX_SPECIALS.has(c)) {
      re += '\\' + c;
    } else {
      re += c;
    }
  }
  return new RegExp('^' + re + '$');
}

module.exports = { loadAdapters, adapterByExtension, supportedLanguageIds, globToRegExp };
