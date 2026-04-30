'use strict';

const assert = require('node:assert/strict');

module.exports = [
  {
    name: 'runner is alive',
    fn: () => assert.equal(1, 1),
  },
];
