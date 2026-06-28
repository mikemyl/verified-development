'use strict';

/**
 * hooks/lib/lang/cfamily.js
 *
 * A SHARED, configurable brace-balance scanner for C-family languages (Go, TS,
 * Java, …). It is intentionally language-AGNOSTIC: the rules that say "this run
 * of characters is a comment / a string / a char literal and therefore its
 * braces don't count" are passed in via `opts`, so each language adapter reuses
 * the same state machine with its own delimiter set.
 *
 * This module exports the scanner only — it has NO `extensions` property, which
 * is how the test-corpus adapter loader knows to SKIP it when building the
 * extension→adapter map (adapters MUST export an `extensions` array; cfamily is
 * a shared helper, not an adapter).
 *
 *   const { scanBlock } = require('./cfamily.js');
 *   scanBlock(source, fromIndex, opts) -> { open, close } | null
 *
 *   • source     — full file text.
 *   • fromIndex  — char offset to start scanning from. The scanner advances to
 *                  the FIRST `opts.open` delimiter at-or-after fromIndex, then
 *                  balances open/close to the matching close at depth 0.
 *   • returns    — { open, close } char offsets, where `open` points AT the
 *                  opening delimiter and `close` points AT the closing
 *                  delimiter (so the block text is
 *                  source.slice(open, close + closeLen)); or null when the
 *                  block is unbalanced (no matching close before EOF).
 *
 * opts shape (all comment/string rules optional — omit what a language lacks):
 *   {
 *     open:  '{',                 // block open delimiter (required)
 *     close: '}',                 // block close delimiter (required)
 *     lineComment: '//',          // runs to end of line
 *     blockComment: { open: '/*', close: '*\/' },
 *     strings: [                  // string / char literal delimiters
 *       { open: '"',  close: '"',  escape: '\\' },   // interpreted
 *       { open: '`',  close: '`',  raw: true },      // raw (no escapes)
 *       { open: "'",  close: "'",  escape: '\\' },   // char / rune
 *     ],
 *   }
 *
 * The scanner is split into small single-purpose helpers (one per state) so the
 * dispatch loop stays flat and low-complexity.
 */

/**
 * Advance past a line comment. `i` points at the comment-open token; returns the
 * index just after the terminating newline (or EOF).
 */
function skipLineComment(source, i, token) {
  const nl = source.indexOf('\n', i + token.length);
  return nl === -1 ? source.length : nl + 1;
}

/**
 * Advance past a block comment. `i` points at the comment-open token; returns
 * the index just after the close token (or EOF if unterminated).
 */
function skipBlockComment(source, i, openTok, closeTok) {
  const end = source.indexOf(closeTok, i + openTok.length);
  return end === -1 ? source.length : end + closeTok.length;
}

/**
 * Advance past a string / char literal. `i` points at the opening delimiter;
 * returns the index just after the closing delimiter (or EOF if unterminated).
 * Honours `escape` (skips the escaped char) unless the literal is `raw`.
 */
function skipString(source, i, delim) {
  const n = source.length;
  let j = i + delim.open.length;
  while (j < n) {
    if (!delim.raw && delim.escape && source.startsWith(delim.escape, j)) {
      j += delim.escape.length + 1; // skip the escape char + the char it escapes
      continue;
    }
    if (source.startsWith(delim.close, j)) {
      return j + delim.close.length;
    }
    j++;
  }
  return n;
}

/**
 * If a string/char literal opens at `i`, return its delimiter spec; else null.
 */
function stringDelimAt(source, i, strings) {
  for (const delim of strings) {
    if (source.startsWith(delim.open, i)) return delim;
  }
  return null;
}

/**
 * Balance-scan a block. See module header for the contract.
 *
 * @param {string} source
 * @param {number} fromIndex
 * @param {{open:string, close:string, lineComment?:string,
 *          blockComment?:{open:string, close:string},
 *          strings?:Array<{open:string, close:string, escape?:string, raw?:boolean}>}} opts
 * @returns {?{open:number, close:number}}
 */
function scanBlock(source, fromIndex, opts) {
  const n = source.length;
  const { open, close, lineComment, blockComment, strings = [] } = opts;

  let i = fromIndex;
  let depth = 0;
  let openIndex = -1;

  while (i < n) {
    if (lineComment && source.startsWith(lineComment, i)) {
      i = skipLineComment(source, i, lineComment);
      continue;
    }
    if (blockComment && source.startsWith(blockComment.open, i)) {
      i = skipBlockComment(source, i, blockComment.open, blockComment.close);
      continue;
    }

    const delim = strings.length ? stringDelimAt(source, i, strings) : null;
    if (delim) {
      i = skipString(source, i, delim);
      continue;
    }

    if (source.startsWith(open, i)) {
      if (openIndex === -1) openIndex = i;
      depth++;
      i += open.length;
      continue;
    }
    if (source.startsWith(close, i)) {
      // A close before any open (openIndex === -1) is ignored, mirroring the
      // original scanner: we only complete a block once one has begun.
      i += close.length;
      if (openIndex !== -1) {
        depth--;
        if (depth === 0) return { open: openIndex, close: i - close.length };
      }
      continue;
    }
    i++;
  }
  return null;
}

module.exports = { scanBlock };
