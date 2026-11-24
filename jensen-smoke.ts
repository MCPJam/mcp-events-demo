import assert from "node:assert/strict";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { EventsClientExtension } from "@modelcontextprotocol/client/ext/events";
import { getToken, port } from "./config.js";

const extension = new EventsClientExtension();
const client = new Client({ name: "jensen-show-smoke", version: "1" }, {
  extensions: [extension], versionNegotiation: { mode: "auto" },
});
await client.connect(new StreamableHTTPClientTransport(new URL(
  process.argv[2] ?? `http://127.0.0.1:${port}/mcp`,
), { authProvider: { token: async () => getToken() } }));
try {
  const { events } = await extension.list();
  const descriptor = events.find(item => item.name === "jensen.returned");
  assert.ok(descriptor);
  assert.ok(!Object.hasOwn(descriptor.inputSchema ?? {}, "$schema"));
  assert.ok(!Object.hasOwn(descriptor.payloadSchema ?? {}, "$schema"));
  for (const scene of ["stage", "locker-room", "wolf"]) {
    const subscription = await extension.subscribe({
      name: "jensen.returned", delivery: "poll", arguments: { scene },
    });
    try {
      const result = await client.callTool({ name: "cue_scene", arguments: { scene } });
      assert.ok(!result.isError);
      const delivery = await subscription[Symbol.asyncIterator]().next();
      assert.ok(!delivery.done);
      const receipt = result.structuredContent;
      assert.ok(receipt && typeof receipt === "object" && "eventId" in receipt);
      assert.equal(delivery.value.eventId, receipt.eventId);
      assert.equal(delivery.value.data.scene, scene);
      console.log("Delivered", scene, delivery.value.eventId);
    } finally { await subscription.cancel(); }
  }
} finally { await client.close(); }
