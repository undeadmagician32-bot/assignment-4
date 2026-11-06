import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { classifySourceAge } from '../lib/core.js';

const plan = JSON.parse(await readFile(new URL('../T05-AGE-CASES.json', import.meta.url), 'utf8'));
assert.equal(plan.cases.length, 10, 'the fixed assignment suite must contain exactly ten cases');
assert.equal(new Set(plan.cases.map((item) => item.id)).size, 10, 'every fixed case must have a unique ID');

for (const { id, input, expected } of plan.cases) {
  test(`${id}: source observation age`, () => {
    assert.deepEqual(classifySourceAge(input.sourceTime, input.fetchedAt, input.maxAgeSeconds), expected);
  });
}
