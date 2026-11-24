import { fromJsonSchema, type McpServer } from "@modelcontextprotocol/server";
import { CfWorkerJsonSchemaValidator } from "@modelcontextprotocol/server/validators/cf-worker";
import type { EventsExtension } from "@modelcontextprotocol/server/ext/events";
import * as z from "zod/v4";

const scene = z.enum(["stage", "locker-room", "wolf"]);
type Scene = z.infer<typeof scene>;
const validator = new CfWorkerJsonSchemaValidator();
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

export interface ShowAssets {
  html(): Promise<string>;
  mediaOrigin(): string;
}

export function createJensen(events: EventsExtension, assets: ShowAssets) {
  const event = events.registerEvent("jensen.returned", {
    emitOnly: true,
    description: "A scene cue for the Jensen comeback show. Filter by scene or receive all three.",
    inputSchema: fromJsonSchema<{scene?: Scene}>({ type: "object", properties: { scene: sceneProperty }, additionalProperties: false }, validator),
    payloadSchema: fromJsonSchema<{scene: Scene; message: string}>({ type: "object", properties: { scene: sceneProperty, message: { type: "string" } }, required: ["scene", "message"], additionalProperties: false }, validator),
    match: (_ctx, item, args) => !args.scene || item.data.scene === args.scene,
  });
  const media = () => Object.fromEntries(clip.options.map(name => [name, `${assets.mediaOrigin()}/media/${name}.mp4?v=2`]));
  /** Emits jensen.returned outside any MCP request, for server-side timers. */
  const emit = async (scene: Scene, message: string) => {
    const eventId = crypto.randomUUID();
    await event.emit({ eventId, data: { scene, message } });
    return eventId;
  };
  const register = (server: McpServer) => {
    server.registerResource("Jensen comeback show", uri, { mimeType }, async () => ({
      contents: [{ uri, mimeType, text: await assets.html(),
        _meta: { ui: { csp: { resourceDomains: [assets.mediaOrigin(), "https://fonts.googleapis.com", "https://fonts.gstatic.com"] } } },
      }],
    }));
    server.registerTool("open_show", {
      description: "Open the Jensen comeback show in MCPJam. Use this when asked what Jensen is up to. The player starts the comeback sequence when the viewer presses Start the show.",
      inputSchema: z.object({}), _meta: { ui },
    }, async () => ({ content: [{ type: "text", text: "Jensen is on the couch. The show is ready; press Start the show in the player." }], _meta: { media: media() } }));
    server.registerTool("cue_scene", {
      description: "Emit jensen.returned for a scene. The tool result opens the scene player in an MCP Apps client.",
      inputSchema: z.object({ scene }), _meta: { ui },
    }, async ({ scene }) => {
      const data = { scene, message: titles[scene] };
      const eventId = crypto.randomUUID();
      await event.emit({ eventId, data });
      return { content: [{ type: "text", text: data.message }], structuredContent: { eventId, ...data }, _meta: { media: media() } };
    });
    server.registerTool("load_show_clip", {
      description: "Load the selected demo clip for the embedded player.",
      inputSchema: z.object({ clip }), _meta: { ui: { visibility: ["app"] } },
    }, async ({ clip }) => {
      return { content: [], _meta: { url: media()[clip], media: media() } };
    });
  };
  return { register, emit };
}
