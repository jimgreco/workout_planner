import { expect, it } from 'vitest';
import { actualRepsInput } from '../liveEntry.js';
it('validates actual rep counts without accepting target ranges or converting invalid input into evidence', () => {
  for (const [input, output] of [['', ''], [' 8 ', '8'], ['008', '8'], ['0', '0'], ['150', '150']]) expect(actualRepsInput(input)).toBe(output);
  for (const invalid of ['-1', '1.5', '8-12', 'abc', '1e2', '9007199254740992']) expect(actualRepsInput(invalid)).toBeNull();
});
