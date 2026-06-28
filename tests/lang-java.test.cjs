'use strict';

/**
 * Tests for the Java language adapter (hooks/lib/lang/java.js). The adapter
 * discovers JUnit `@Test`-annotated methods as TEXT (no Java toolchain) and
 * counts assertion-dispersion tokens. The final case is an integration test
 * proving the test-corpus registry auto-loads java.js by extension.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const java = require(path.join(__dirname, '..', 'hooks', 'lib', 'lang', 'java.js'));

module.exports = [
  {
    name: 'java: discovers a @Test method with name, line and body',
    fn: () => {
      const src = [
        'class FooTest {',
        '  @Test',
        '  void addsNumbers() {',
        '    assertEquals(3, add(1, 2));',
        '  }',
        '}',
      ].join('\n');
      const tests = java.discover(src, 'FooTest.java');
      assert.equal(tests.length, 1);
      assert.equal(tests[0].name, 'addsNumbers');
      assert.equal(tests[0].line, 3); // 1-based signature line
      assert.match(tests[0].body, /^\{[\s\S]*assertEquals\(3, add\(1, 2\)\);[\s\S]*\}$/);
    },
  },

  {
    name: 'java: discovers a @Test method declared public (JUnit 4 style)',
    fn: () => {
      const src = [
        'class BarTest {',
        '  @Test',
        '  public void worksPublicly() {',
        '    assertTrue(true);',
        '  }',
        '}',
      ].join('\n');
      const tests = java.discover(src, 'BarTest.java');
      assert.equal(tests.length, 1);
      assert.equal(tests[0].name, 'worksPublicly');
      assert.equal(tests[0].line, 3);
    },
  },

  {
    name: 'java: @Test with args (@Test(expected=...)) is still discovered',
    fn: () => {
      const src = [
        'class ExcTest {',
        '  @Test(expected = IllegalArgumentException.class)',
        '  public void throwsOnBadInput() {',
        '    parse(null);',
        '  }',
        '}',
      ].join('\n');
      const tests = java.discover(src, 'ExcTest.java');
      assert.equal(tests.length, 1);
      assert.equal(tests[0].name, 'throwsOnBadInput');
    },
  },

  {
    name: 'java: a non-@Test annotated method (@BeforeEach) is NOT picked up',
    fn: () => {
      const src = [
        'class SetupTest {',
        '  @BeforeEach',
        '  void setUp() {',
        '    reset();',
        '  }',
        '  void helper() {', // plain helper, no annotation
        '    doThing();',
        '  }',
        '  @Test',
        '  void realTest() {',
        '    assertEquals(1, 1);',
        '  }',
        '}',
      ].join('\n');
      const tests = java.discover(src, 'SetupTest.java');
      assert.equal(tests.length, 1);
      assert.equal(tests[0].name, 'realTest');
    },
  },

  {
    name: 'java: braces inside a string literal "{" do not end the body',
    fn: () => {
      const src = [
        'class StrTest {',
        '  @Test',
        '  void handlesBraceInString() {',
        '    String s = "{";',
        '    assertEquals("{", s);',
        '  }',
        '}',
      ].join('\n');
      const tests = java.discover(src, 'StrTest.java');
      assert.equal(tests.length, 1);
      // The full body must reach the method's real closing brace, including the
      // assertion AFTER the deceptive "{" string.
      assert.match(tests[0].body, /assertEquals\("\{", s\);/);
      assert.ok(tests[0].body.trim().endsWith('}'));
    },
  },

  {
    name: 'java: nested blocks (if/try) are kept inside the body',
    fn: () => {
      const src = [
        'class NestTest {',
        '  @Test',
        '  void nests() {',
        '    if (cond) {',
        '      try {',
        '        run();',
        '      } catch (Exception e) {',
        '        handle(e);',
        '      }',
        '    }',
        '    assertTrue(done);',
        '  }',
        '}',
      ].join('\n');
      const tests = java.discover(src, 'NestTest.java');
      assert.equal(tests.length, 1);
      assert.match(tests[0].body, /catch \(Exception e\)/);
      assert.match(tests[0].body, /assertTrue\(done\);/);
    },
  },

  {
    name: 'java: countAssertions counts assertEquals(/assertThat(/Assertions.',
    fn: () => {
      const body = [
        '{',
        '  assertEquals(1, x);',
        '  assertThat(y).isEqualTo(2);',
        '  Assertions.assertTrue(z);',
        '}',
      ].join('\n');
      // assertEquals( + assertThat( + Assertions.assertTrue( = 3 assert*() calls,
      // plus 1 `Assertions.` occurrence = 4.
      assert.equal(java.countAssertions(body), 4);
    },
  },

  {
    name: 'java: countAssertions counts Mockito verify( calls',
    fn: () => {
      const body = '{ verify(mock).called(); assertTrue(ok); }';
      assert.equal(java.countAssertions(body), 2); // verify( + assertTrue(
    },
  },

  {
    name: 'java: registry (test-corpus) auto-discovers Java tests by extension',
    fn: () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vd-java-'));
      try {
        const fixture = [
          'package com.example;',
          'import org.junit.jupiter.api.Test;',
          'import static org.junit.jupiter.api.Assertions.*;',
          '',
          'class FooTest {',
          '  @Test',
          '  void discoversMe() {',
          '    assertEquals(2, 1 + 1);',
          '  }',
          '',
          '  @BeforeEach',
          '  void ignored() {',
          '    setup();',
          '  }',
          '}',
        ].join('\n');
        fs.writeFileSync(path.join(dir, 'FooTest.java'), fixture);

        const { discover } = require(path.join(__dirname, '..', 'hooks', 'lib', 'test-corpus.js'));
        const { tests, unsupported_files } = discover(dir);

        const javaTests = tests.filter((t) => t.file.endsWith('FooTest.java'));
        assert.equal(javaTests.length, 1, 'expected exactly one discovered Java test');
        assert.equal(javaTests[0].name, 'discoversMe');
        assert.equal(javaTests[0].assertions, 1); // one assertEquals(
        // Now that java.js is registered, the file is analyzable, NOT unsupported.
        assert.ok(
          !unsupported_files.some((f) => f.endsWith('FooTest.java')),
          'FooTest.java should be analyzed, not flagged unsupported',
        );
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    },
  },
];
