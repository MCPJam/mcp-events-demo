import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const html = await readFile(new URL('../show.html', import.meta.url), 'utf8');
function player() {
  const messages: {id: number; method: string; params: {name?: string}}[] = [];
  const listeners = new Map<string, (event: unknown) => void>();
  const scenes = ['cold-open', 'stage', 'locker-room', 'wolf'];
  const videos = scenes.map(scene => ({
    dataset: {scene}, src: '', hidden: scene !== 'cold-open', muted: true, currentTime: 0, plays: 0,
    events: new Map<string, () => void>(),
    pause() {}, load() {}, async play() { this.plays++; },
    getAttribute() { return this.src; },
    addEventListener(name: string, callback: () => void) { this.events.set(name, callback); },
  }));
  const nodes = new Map<string, Record<string, unknown>>();
  const node = (selector: string) => { if (!nodes.has(selector)) nodes.set(selector, {dataset: {}, textContent: ''}); return nodes.get(selector); };
  const parent = {postMessage(message: typeof messages[number]) { messages.push(message); }};
  runInNewContext("(async () => {" + html.match(/<script type="module">([\s\S]*?)<\/script>/)![1] + "})()", {
    document: {querySelector: node, querySelectorAll: () => videos},
    ResizeObserver: class { observe() {} }, parent, URL, console, Date,
    setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0,
    addEventListener: (name: string, callback: (event: unknown) => void) => listeners.set(name, callback),
  });
  const receive = (data: object) => listeners.get('message')!({source: parent, data: {jsonrpc: '2.0', ...data}});
  const flush = () => new Promise(resolve => setImmediate(resolve));
  return {messages, nodes, videos, receive, flush};
}
const media = Object.fromEntries(['cold-open', 'stage', 'locker-room', 'wolf'].map(scene => [scene, `https://demo.example/media/${scene}.mp4`]));

test('the couch loops until jensen.returned arrives, then the alert and return scene play once', async () => {
  const p = player();
  p.receive({method: 'ui/notifications/tool-result', params: {_meta: {media}}});
  p.receive({id: 1, result: {}}); await p.flush();
  const [cold, stage] = p.videos;
  assert.equal(cold.hidden, false); assert.ok(cold.plays >= 1); assert.equal(stage.plays, 0);

  const event = {eventId: 'abcdef12-0000', scene: 'stage', message: 'He put the controller down.'};
  p.receive({method: 'ui/notifications/tool-result', params: {structuredContent: event, _meta: {media}}});
  p.receive({method: 'ui/notifications/tool-result', params: {structuredContent: event, _meta: {media}}});
  await p.flush();
  assert.equal(stage.hidden, false); assert.equal(cold.hidden, true); assert.equal(stage.plays, 1);
  assert.equal(p.nodes.get('.msg')!.textContent, event.message);
  assert.equal(p.nodes.get('.ev-id')!.textContent, 'abcdef12');
  // The app only renders; the server owns timing and emission.
  assert.equal(p.messages.filter(message => message.params?.name === 'cue_scene').length, 0);
  assert.equal(p.messages.filter(message => message.params?.name === 'load_show_clip').length, 0);
});
