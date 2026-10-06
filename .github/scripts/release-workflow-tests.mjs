import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

for (const [file, job, input] of [
  ['testflight.yml', 'build', 'upload_testflight'],
  ['deploy.yml', 'deploy', 'deploy_production'],
]) {
  test(`${file} requires explicit dispatch on main before publication`, () => {
    const source = readFileSync(new URL(`../workflows/${file}`, import.meta.url), 'utf8');
    const condition = source.match(new RegExp(`^  ${job}:\\n    if: (.+)$`, 'm'))?.[1];
    assert.ok(condition, 'Publication job must have an explicit gate');
    assert.match(source, new RegExp(`${input}:[\\s\\S]*?default: false`));
    // Evaluate GitHub's boolean expression against the actual trigger cases.
    const enabled = new Function('github', 'inputs', `return (${condition});`);
    for (const event of ['push', 'pull_request', 'workflow_dispatch']) {
      for (const ref of ['refs/heads/main', 'refs/heads/codex/target-rir']) {
        for (const approved of [false, true]) {
          assert.equal(enabled({ event_name: event, ref }, { [input]: approved }),
            event === 'workflow_dispatch' && ref === 'refs/heads/main' && approved,
            `${event} ${ref} approval=${approved}`);
        }
      }
    }
  });
}
