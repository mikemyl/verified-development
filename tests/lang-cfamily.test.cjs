'use strict';

/**
 * Tests for the shared, configurable brace-balance scanner
 * (hooks/lib/lang/cfamily.js). The scanner is language-agnostic: comment/string
 * rules are supplied via opts. These cases exercise it directly so each language
 * adapter can trust the primitive.
 */

const assert = require('node:assert/strict');
const path = require('node:path');

const { scanBlock } = require(path.join(__dirname, '..', 'hooks', 'lib', 'lang', 'cfamily.js'));

// Go-shaped opts, reused across cases.
const GO = {
  open: '{',
  close: '}',
  lineComment: '//',
  blockComment: { open: '/*', close: '*/' },
  strings: [
    { open: '"', close: '"', escape: '\\' },
    { open: '`', close: '`', raw: true },
    { open: "'", close: "'", escape: '\\' },
  ],
};

function block(src, opts) {
  const span = scanBlock(src, 0, opts);
  if (!span) return null;
  return src.slice(span.open, span.close + opts.close.length);
}

module.exports = [
  {
    name: 'cfamily: balances a simple nested block from the first open delimiter',
    fn: () => {
      const src = 'prefix { a { b } c } suffix';
      const span = scanBlock(src, 0, GO);
      assert.deepEqual({ open: span.open, close: span.close }, { open: 7, close: 19 });
      assert.equal(src.slice(span.open, span.close + 1), '{ a { b } c }');
    },
  },

  {
    name: 'cfamily: braces inside interpreted, raw and char literals do not move depth',
    fn: () => {
      assert.equal(block('{ s := "}}}" }', GO), '{ s := "}}}" }');
      assert.equal(block('{ r := `a}b{c` }', GO), '{ r := `a}b{c` }');
      assert.equal(block("{ c := '}' }", GO), "{ c := '}' }");
    },
  },

  {
    name: 'cfamily: escaped close delimiter inside a string is not the string end',
    fn: () => {
      // The \" must NOT close the string, so the trailing } stays balanced.
      assert.equal(block('{ s := "a\\"}" }', GO), '{ s := "a\\"}" }');
    },
  },

  {
    name: 'cfamily: raw strings ignore escapes (a backslash does not skip the close)',
    fn: () => {
      // In a raw string the backtick closes regardless of a preceding backslash.
      assert.equal(block('{ r := `a\\` ; x := 1 }', GO), '{ r := `a\\` ; x := 1 }');
    },
  },

  {
    name: 'cfamily: line and block comment braces are ignored',
    fn: () => {
      assert.equal(block('{ // }\n x := 1 }', GO), '{ // }\n x := 1 }');
      assert.equal(block('{ /* } } } */ x := 1 }', GO), '{ /* } } } */ x := 1 }');
    },
  },

  {
    name: 'cfamily: an unbalanced block returns null',
    fn: () => {
      assert.equal(scanBlock('{ a { b }', 0, GO), null);
    },
  },

  {
    name: 'cfamily: works with a different delimiter/opts set (no strings/comments)',
    fn: () => {
      const opts = { open: '(', close: ')' };
      const span = scanBlock('f(g(x), y)', 1, opts);
      assert.equal('f(g(x), y)'.slice(span.open, span.close + 1), '(g(x), y)');
    },
  },
];
