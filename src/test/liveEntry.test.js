import { expect, it } from 'vitest';
import { actualRepsInput } from '../liveEntry.js';
it('validates actual rep counts without accepting target ranges or converting invalid input into evidence', () => {
  for (const [input, output] of [['', ''], [' 8 ', '8'], ['008', '8'], ['0', '0'], ['150', '150']]) expect(actualRepsInput(input)).toBe(output);
  for (const invalid of ['-1', '1.5', '8-12', 'abc', '1e2', '9007199254740992']) expect(actualRepsInput(invalid)).toBeNull();
});

import { actualWeightInput, adjustedLiveWeight } from '../liveEntry.js';
it('supports fractional load entry and repeatable five-pound steps without negatives', () => {
  for (const [input, output] of [['', ''], ['.', ''], ['.5', '0.5'], ['45.125', '45.125'], ['45.', '45'], ['0', '0']]) expect(actualWeightInput(input)).toBe(output);
  for (const invalid of ['-5', '1..5', 'abc', '1e2', 'Infinity']) expect(actualWeightInput(invalid)).toBeNull();
  expect(adjustedLiveWeight('45.125', 5)).toBe('50.125');
  expect(adjustedLiveWeight('50.125', -5)).toBe('45.125');
  expect(adjustedLiveWeight('2.5', -5)).toBe('0');
  expect(adjustedLiveWeight('', 5, '40')).toBe('45');
  expect(adjustedLiveWeight('0', 5, '40')).toBe('5');
});
