// End-to-end: the control API schedules a return and an MCP poll subscriber receives jensen.returned.
import assert from "node:assert/strict";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { EventsClientExtension } from "@modelcontextprotocol/client/ext/events";
import { getToken, port } from "./config.js";

const base = process.argv[2] ?? `http://127.0.0.1:${port}`;
const token = process.env.DEMO_BEARER ?? getToken();
const api = async (method: string, path: string, body?: unknown) => {
  const response = await fetch(base + path, { method, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  assert.equal(response.status, 200, await response.clone().text());
  return response.json();
};
const page = await fetch(base + "/jensen");
assert.equal(page.status, 200);
assert.match(await page.text(), /How long can Jensen play GTA 6\?/);
assert.equal((await fetch(base + "/jensen/run")).status, 401, "control API requires the bearer token");

const extension = new EventsClientExtension();
const client = new Client({ name: "jensen-control-smoke", version: "1" }, { extensions: [extension], versionNegotiation: { mode: "auto" } });
await client.connect(new StreamableHTTPClientTransport(new URL(base + "/mcp"), { authProvider: { token: async () => token } }));
try {
  const subscription = await extension.subscribe({ name: "jensen.returned", delivery: "poll", arguments: {} });
  try {
    const started = Date.now();
    const run = await api("POST", "/jensen/run", { playSeconds: 5, scene: "locker-room", message: "He put the controller down." });
    assert.equal(run.state, "running");
    const delivery = await subscription[Symbol.asyncIterator]().next();
    const waited = Date.now() - started;
    assert.ok(!delivery.done);
    assert.equal(delivery.value.data.scene, "locker-room");
    assert.ok(waited >= 4900, `arrived after ${waited}ms, before the playtime ended`);
    const state = await api("GET", "/jensen/run");
    assert.equal(state.state, "returned");
    assert.equal(state.event.eventId, delivery.value.eventId);
    console.log(`Scheduled return delivered after ${waited}ms`, delivery.value.eventId);

    await api("POST", "/jensen/run", { playSeconds: 600, scene: "stage", message: "Now." });
    const sent = await api("POST", "/jensen/run/emit");
    const now = await subscription[Symbol.asyncIterator]().next();
    assert.equal(now.value.eventId, sent.event.eventId);
    console.log("Send now delivered", now.value.eventId);

    await api("POST", "/jensen/run", { playSeconds: 5, scene: "wolf", message: "Never mind." });
    assert.equal((await api("DELETE", "/jensen/run")).state, "cancelled");
    await new Promise(resolve => setTimeout(resolve, 6000));
    assert.equal((await api("GET", "/jensen/run")).state, "cancelled");
    console.log("Cancelled run stayed cancelled");
  } finally { await subscription.cancel(); }
} finally { await client.close(); }
