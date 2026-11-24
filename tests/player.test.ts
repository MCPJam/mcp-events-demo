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
    dataset: {scene}, src: '', hidden: true, currentTime: 0, plays: 0,
    events: new Map<string, () => void>(),
    pause() {}, load() {}, async play() { this.plays++; },
    hasAttribute() { return !!this.src; },
    addEventListener(name: string, callback: () => void) { this.events.set(name, callback); },
  }));
  const controls = new Map<string, Record<string, unknown>>();
  for (const selector of ['[role=status]', '#start', '.cover', '.retry', '#auto', 'nav']) controls.set(selector, {dataset:{}, hidden:true, checked:false});
  const buttons = scenes.map(clip => ({dataset:{clip}, disabled:true, setAttribute() {}}));
  const parent = {postMessage(message: typeof messages[number]) { messages.push(message); }};
  const timers = new Map<number, () => void>(); let id = 0;
  runInNewContext("(async () => {" + html.match(/<script type="module">([\s\S]*?)<\/script>/)![1] + "})()", {
    document: {querySelector: (selector: string) => controls.get(selector), querySelectorAll: (selector: string) => selector === 'video' ? videos : buttons},
    ResizeObserver: class { observe() {} }, parent, URL, console, setTimeout: (callback: () => void) => {timers.set(++id, callback); return id;}, clearTimeout: (id: number) => timers.delete(id),
    addEventListener: (name: string, callback: (event: unknown) => void) => listeners.set(name, callback),
  });
  const receive = (data: object) => listeners.get('message')!({source:parent, data:{jsonrpc:'2.0', ...data}});
  const flush = () => new Promise(resolve => setImmediate(resolve));
  return {messages, controls, videos, receive, flush};
}
test('preloaded clips transition immediately even when cue delivery is pending, without media RPCs or duplicate cues', async () => {
  const p = player();
  const media = Object.fromEntries(p.videos.map(video => [video.dataset.scene, `https://demo.example/media/${video.dataset.scene}.mp4`]));
  p.receive({method:'ui/notifications/tool-result', params:{_meta:{media}}});
  p.receive({id:1, result:{}}); await p.flush();
  (p.controls.get('#start')!.onclick as () => void)();
  await p.flush();
  const cold = p.videos[0], stage = p.videos[1];
  assert.equal(cold.plays, 1);
  cold.currentTime = 6.3; cold.events.get('timeupdate')!();
  cold.events.get('timeupdate')!(); await p.flush();
  assert.equal(stage.hidden, false); assert.equal(stage.plays, 1);
  assert.equal(cold.hidden, true);
  assert.equal(p.messages.filter(message => message.params?.name === 'cue_scene').length, 1);
  assert.equal(p.messages.filter(message => message.params?.name === 'load_show_clip').length, 0);
  const cue = p.messages.find(message => message.params?.name === 'cue_scene')!;
  p.receive({id:cue.id, error:{message:'delivery unavailable'}}); await p.flush();
  assert.match(String(p.controls.get('[role=status]')!.textContent), /delivery unavailable/);
  assert.equal(p.controls.get('.retry')!.hidden, false);
  assert.equal(stage.plays, 1);
});
