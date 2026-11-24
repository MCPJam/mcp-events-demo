import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ShowRuns, handleRunRequest, memoryRunStore, type ReturnScene } from '../show-runs.ts';

function setup() {
  const emitted: {scene: ReturnScene; message: string}[] = [];
  const scheduled: (number | null)[] = [];
  const runs = new ShowRuns(async (scene, message) => { emitted.push({scene, message}); return `evt-${emitted.length}`; },
    memoryRunStore(), at => { scheduled.push(at); });
  return {runs, emitted, scheduled};
}
const req = (method: string, path: string, body?: unknown) =>
  new Request('http://x' + path, {method, body: body === undefined ? undefined : JSON.stringify(body)});

test('a run emits jensen.returned once when time is up, not before', async () => {
  const {runs, emitted, scheduled} = setup();
  const run = await runs.start({playSeconds: 5, scene: 'wolf', message: 'Back.'});
  assert.equal(scheduled.at(-1), run.returnsAt);
  assert.equal((await runs.due())?.state, 'running');
  assert.equal(emitted.length, 0);
  run.returnsAt = Date.now() - 1; // the memory store holds this object
  const [a, b] = await Promise.all([runs.due(), runs.due()]);
  assert.equal(emitted.length, 1);
  assert.deepEqual(emitted[0], {scene: 'wolf', message: 'Back.'});
  assert.equal(a?.state, 'returned'); assert.equal(b?.event?.eventId, 'evt-1');
  assert.equal(scheduled.at(-1), null);
});

test('send now emits immediately; cancel stops a run without emitting', async () => {
  const {runs, emitted} = setup();
  await runs.start({playSeconds: 600, scene: 'stage', message: 'Hi'});
  assert.equal((await runs.emitNow())?.state, 'returned');
  assert.equal((await runs.emitNow())?.state, 'returned');
  assert.equal(emitted.length, 1);
  await runs.start({playSeconds: 600, scene: 'stage', message: 'Hi'});
  assert.equal((await runs.cancel())?.state, 'cancelled');
  assert.equal((await runs.emitNow())?.state, 'cancelled');
  assert.equal(emitted.length, 1);
});

test('HTTP handler validates input and routes', async () => {
  const {runs} = setup();
  assert.equal((await handleRunRequest(req('POST', '/jensen/run', {playSeconds: 2, scene: 'stage', message: 'x'}), runs))!.status, 400);
  assert.equal((await handleRunRequest(req('POST', '/jensen/run', {playSeconds: 30, scene: 'beach', message: 'x'}), runs))!.status, 400);
  const ok = await handleRunRequest(req('POST', '/jensen/run', {playSeconds: 30, scene: 'stage', message: ' Back '}), runs);
  assert.equal(ok!.status, 200); assert.equal((await ok!.json()).message, 'Back');
  assert.equal((await (await handleRunRequest(req('POST', '/jensen/run/emit'), runs))!.json()).state, 'returned');
  assert.equal(await handleRunRequest(req('GET', '/mcp'), runs), null);
});
