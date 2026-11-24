import { readFile } from "node:fs/promises";
import { fromJsonSchema, type McpServer } from "@modelcontextprotocol/server";
import type { EventsExtension } from "@modelcontextprotocol/server/ext/events";
import * as z from "zod/v4";

const scene = z.enum(["stage", "locker-room", "wolf"]);
type Scene = z.infer<typeof scene>;
const sceneProperty = { type: "string", enum: scene.options };
const clip = z.enum(["cold-open", ...scene.options]);
const titles = {
  stage: "Jensen is back",
  "locker-room": "Jensen is back in the locker room",
  wolf: "Jensen is back for the speech",
};
const uri = "ui://jensen/show.html";
const mimeType = "text/html;profile=mcp-app";
const ui = { resourceUri: uri };

export function createJensen(events: EventsExtension) {
  const event = events.registerEvent("jensen.returned", {
    emitOnly: true,
    description: "A scene cue for the Jensen comeback show. Filter by scene or receive all three.",
    inputSchema: fromJsonSchema<{scene?: Scene}>({ type: "object", properties: { scene: sceneProperty }, additionalProperties: false }),
    payloadSchema: fromJsonSchema<{scene: Scene; message: string}>({ type: "object", properties: { scene: sceneProperty, message: { type: "string" } }, required: ["scene", "message"], additionalProperties: false }),
    match: (_ctx, item, args) => !args.scene || item.data.scene === args.scene,
  });
  return (server: McpServer) => {
    server.registerResource("Jensen comeback show", uri, { mimeType }, async () => ({
      contents: [{ uri, mimeType, text: await readFile(new URL("./show.html", import.meta.url), "utf8") }],
    }));
    server.registerTool("open_show", {
      description: "Open the Jensen comeback show in MCPJam. Press Play cold open to begin.",
      inputSchema: z.object({}), _meta: { ui },
    }, async () => ({ content: [{ type: "text", text: "Press Play cold open. At the mid-bite pause the player calls cue_scene." }] }));
    server.registerTool("cue_scene", {
      description: "Emit jensen.returned for a scene. The tool result opens the scene player in an MCP Apps client.",
      inputSchema: z.object({ scene }), _meta: { ui },
    }, async ({ scene }) => {
      const data = { scene, message: titles[scene] };
      const eventId = crypto.randomUUID();
      await event.emit({ eventId, data });
      return { content: [{ type: "text", text: data.message }], structuredContent: { eventId, ...data } };
    });
    server.registerTool("load_show_clip", {
      description: "Load the selected demo clip for the embedded player.",
      inputSchema: z.object({ clip }), _meta: { ui: { visibility: ["app"] } },
    }, async ({ clip }) => {
      const bytes = await readFile(new URL('./.runtime/media/' + clip + '.mp4', import.meta.url));
      return { content: [], _meta: { video: bytes.toString("base64") } };
    });
  };
}
