import assert from "node:assert/strict";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import {
  EventsClientExtension,
  type EventSubscription,
} from "@modelcontextprotocol/client/ext/events";

const url = process.argv[2] ?? "http://127.0.0.1:18891/mcp";
const clients: Client[] = [];
const subscriptions: EventSubscription[] = [];
const deadline = setTimeout(() => {
  console.error("Isolation test timed out");
  process.exit(1);
}, 30_000);
async function connect() {
  const response = await fetch(new URL("/sessions", url), { method: "POST" });
  assert.equal(response.status, 200);
  const { token } = (await response.json()) as { token: string };
  const events = new EventsClientExtension();
  const client = new Client(
    { name: "isolation-test", version: "1" },
    {
      versionNegotiation: { mode: "auto" },
      extensions: [events],
    },
  );
  clients.push(client);
  await client.connect(
    new StreamableHTTPClientTransport(new URL(url), {
      authProvider: { token: async () => token },
    }),
  );
  return { client, events, token };
}
async function first(sub: EventSubscription) {
  for await (const event of sub) return event;
  throw new Error("No event");
}
try {
  assert.equal((await fetch(url, { method: "POST" })).status, 401);
  assert.equal(
    (
      await fetch(url, {
        headers: {
          Authorization: "Bearer forged",
          "x-demo-expires-at": "9999999999999",
        },
      })
    ).status,
    401,
  );
  const a = await connect();
  const b = await connect();
  assert.notEqual(a.token, b.token);
  const tools = await a.client.listTools();
  for (const name of ["open_show", "cue_scene", "load_show_clip"])
    assert.ok(tools.tools.some(tool => tool.name === name), name);
  const app = await a.client.readResource({ uri: "ui://jensen/show.html" });
  assert.ok(app.contents[0] && "text" in app.contents[0] && app.contents[0].text.includes("jensen.returned"));
  for (const clip of ["cold-open", "stage", "locker-room", "wolf"]) {
    const result = await a.client.callTool({ name: "load_show_clip", arguments: { clip } });
    const mediaUrl = result._meta?.url;
    assert.ok(typeof mediaUrl === "string", clip);
    assert.ok(JSON.stringify(result).length < 2000, "Media results contain URLs, not video bytes");
    const response = await fetch(mediaUrl, { headers: { Range: "bytes=0-127" } });
    assert.equal(response.status, 206);
    assert.match(response.headers.get("cache-control") ?? "", /public/);
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(bytes.length, 128);
    assert.equal(bytes.toString("ascii", 4, 8), "ftyp");
  }
  const sceneSub = await a.events.subscribe({ name: "jensen.returned", delivery: "poll", arguments: { scene: "stage" } });
  subscriptions.push(sceneSub);
  const cue = await a.client.callTool({ name: "cue_scene", arguments: { scene: "stage" } });
  const receipt = cue.structuredContent;
  assert.ok(receipt && typeof receipt === "object" && "eventId" in receipt);
  assert.equal((await first(sceneSub)).eventId, receipt.eventId);
  await sceneSub.cancel();
  subscriptions.pop();
  console.log("PASS: hosted show, all four MP4 clips, and matching Jensen stage event");
  for (const session of [a, b])
    subscriptions.push(
      await session.events.subscribe({ name: "demo.ping", delivery: "poll" }),
    );
  await a.client.callTool({
    name: "emit_ping",
    arguments: { message: "Only A" },
  });
  assert.equal((await first(subscriptions[0])).data.message, "Only A");
  await b.client.callTool({
    name: "emit_ping",
    arguments: { message: "Only B" },
  });
  assert.equal((await first(subscriptions[1])).data.message, "Only B");
  console.log(
    "PASS: missing/forged credentials rejected; two sessions cannot receive each other’s events",
  );
} finally {
  await Promise.allSettled(subscriptions.map((sub) => sub.cancel()));
  await Promise.allSettled(clients.map((client) => client.close()));
  clearTimeout(deadline);
}
