import assert from "node:assert/strict";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import {
  EventsClientExtension,
  type EventSubscription,
} from "@modelcontextprotocol/client/ext/events";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { getToken, port, receiverPort } from "./config.js";

const url = process.argv[2] ?? `http://127.0.0.1:${port}/mcp`;
const session =
  process.env.CREATE_SESSION === "1"
    ? await fetch(new URL("/sessions", url), { method: "POST" }).then(
        async (response) => {
          assert.equal(response.status, 200, "Create hosted demo session");
          return (await response.json()) as { token: string };
        },
      )
    : undefined;
const events = new EventsClientExtension({
  webhook: {
    url: process.env.WEBHOOK_URL ?? `http://127.0.0.1:${receiverPort}/events`,
  },
});
const client = new Client(
  { name: "mcpjam-events-smoke", version: "1.0.0" },
  { versionNegotiation: { mode: "auto" }, extensions: [events] },
);
const receiverHandler = toNodeHandler({ fetch: events.createWebhookHandler() });
const receiver = createServer((req, res) => void receiverHandler(req, res));
await new Promise<void>((resolve, reject) => {
  receiver.once("error", reject);
  receiver.listen(receiverPort, "127.0.0.1", resolve);
});
const timeout = setTimeout(() => {
  console.error("FAIL: timed out after 45 seconds");
  process.exit(1);
}, 45_000);
const subscriptions: EventSubscription[] = [];
async function firstEvent<T>(subscription: EventSubscription<T>) {
  for await (const event of subscription) return event;
  throw new Error("Subscription ended before receiving an event");
}
try {
  await client.connect(
    new StreamableHTTPClientTransport(new URL(url), {
      authProvider: { token: async () => session?.token ?? getToken() },
    }),
  );
  const { events: types } = await events.list();
  assert.deepEqual(
    types.map((type) => [type.name, type.delivery]),
    [
      ...(process.env.JENSEN_SHOW === "1" ? [["jensen.returned", ["poll", "push", "webhook"]]] : []),
      ["demo.ping", ["poll", "push", "webhook"]],
      ["timer.tick", ["poll", "push", "webhook"]],
    ],
  );
  console.log(
    "PASS: official SDK discovery lists the configured events and all three delivery modes",
  );
  const topic = `smoke-${randomUUID()}`;
  for (const delivery of ["poll", "push", "webhook"] as const) {
    const sub = await events.subscribe({
      name: "demo.ping",
      delivery,
      arguments: { topic },
    });
    subscriptions.push(sub);
  }
  // A nonmatching event must not be delivered to the filtered subscriptions.
  await client.callTool({
    name: "emit_ping",
    arguments: { message: "Ignore me", topic: "not-the-test-topic" },
  });
  await client.callTool({
    name: "emit_ping",
    arguments: { message: "E2E works", topic },
  });
  const received = await Promise.all(subscriptions.map(firstEvent));
  for (let i = 0; i < subscriptions.length; i++) {
    assert.equal(received[i].name, "demo.ping");
    assert.equal(received[i].data.message, "E2E works");
    assert.equal(received[i].data.topic, topic);
    assert.equal(received[i].eventId, received[0].eventId);
    console.log(
      `PASS: ${subscriptions[i].deliveryMode} delivered the same emitted event with topic filtering`,
    );
  }
  const heartbeat = await events.subscribe({
    name: "timer.tick",
    delivery: "poll",
  });
  subscriptions.push(heartbeat);
  const beat = await firstEvent(heartbeat);
  assert.equal(beat.name, "timer.tick");
  assert.ok(Number.isInteger(beat.data.tick));
  console.log("PASS: automatic timer event delivered");
} finally {
  await Promise.allSettled(subscriptions.map((sub) => sub.cancel()));
  await client.close();
  receiver.closeAllConnections();
  await new Promise<void>((resolve) => receiver.close(() => resolve()));
  clearTimeout(timeout);
}
