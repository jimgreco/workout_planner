import assert from 'node:assert/strict';
import test from 'node:test';
import { preservingSetupSelection } from './setup-selection.mjs';

test('older clients retain selection provenance only for the same exercise and setup context', () => {
  const original = { exerciseId: 'press', baselineId: 'home', setupProfile: { id: 'home' }, setupSelectionMade: true, sets: [] };
  const { setupSelectionMade, ...legacy } = original;
  assert.equal(setupSelectionMade, true);
  assert.equal(preservingSetupSelection([legacy], [original])[0].setupSelectionMade, true);
  for (const changed of [{ ...legacy, exerciseId: 'row' }, { ...legacy, setupProfile: undefined }, { ...legacy, baselineId: 'new' }]) {
    assert.equal(preservingSetupSelection([changed], [original])[0].setupSelectionMade, undefined);
  }
  assert.equal(preservingSetupSelection([{ ...legacy, setupSelectionMade: false }], [original])[0].setupSelectionMade, false);
  assert.equal(preservingSetupSelection([legacy], [])[0].setupSelectionMade, undefined);
  assert.equal(original.setupSelectionMade, true);
});
