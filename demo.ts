import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { CfWorkerJsonSchemaValidator } from "@modelcontextprotocol/server/validators/cf-worker";
import {
  EventsExtension,
  EventsError,
  type EventsOptions,
  type EventContext,
} from "@modelcontextprotocol/server/ext/events";
import * as z from "zod/v4";

// Shared by local Node and Cloudflare. All Events protocol handling is official SDK code.
export function createDemo(options: EventsOptions) {
  const log = (action: string, details: object = {}) =>
    console.log(JSON.stringify({ action, ...details }));
  const events = new EventsExtension(options);
  const lifecycle = {
    onSubscribe(ctx: EventContext) {
      log("subscribed", {
        event: ctx.name,
        mode: ctx.mode,
        id: ctx.subscriptionId,
      });
    },
    onUnsubscribe(ctx: EventContext) {
      log("unsubscribed", {
        event: ctx.name,
        mode: ctx.mode,
        id: ctx.subscriptionId,
      });
    },
  };

  let sequence = 0;
  const ping = events.registerEvent("demo.ping", {
    ...lifecycle,
    emitOnly: true,
    description:
      "A test message. Subscribe, then call emit_ping from Tools or your agent.",
    inputSchema: z.object({
      topic: z
        .string()
        .max(100)
        .optional()
        .describe("Optional topic filter; omit to receive every ping."),
    }),
    payloadSchema: z.object({
      message: z.string(),
      topic: z.string(),
      sequence: z.number().int(),
    }),
    match: (_ctx, event, args) =>
      args.topic === undefined || event.data.topic === args.topic,
  });

  let ticks = 0;
  const tick = events.registerEvent("timer.tick", {
    ...lifecycle,
    emitOnly: true,
    description:
      "An automatic heartbeat every 10 seconds. Subscribe and wait to see delivery.",
    inputSchema: z.object({}),
    payloadSchema: z.object({ tick: z.number().int(), message: z.string() }),
  });

  function buildServer() {
    const server = new McpServer(
      { name: "MCPJam Official SDK Events Demo", version: "1.0.0" },
      {
        extensions: [events],
        jsonSchemaValidator: new CfWorkerJsonSchemaValidator(),
      },
    );
    server.registerTool(
      "emit_ping",
      {
        description:
          "Send a demo.ping event to matching active subscriptions. Subscribe before calling this.",
        inputSchema: z.object({
          message: z.string().max(2000).default("Hello MCPJam!"),
          topic: z.string().max(100).default("demo"),
        }),
      },
      async ({ message, topic }) => {
        const eventId = crypto.randomUUID();
        const data = { message, topic, sequence: ++sequence };
        await ping.emit({ eventId, data });
        log("emitted", { event: "demo.ping", eventId, sequence });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ eventId, ...data }),
            },
          ],
        };
      },
    );
    return server;
  }

  return {
    handler: createMcpHandler(buildServer, { maxRequestBodySize: 65_536 }),
    async tick(scheduledAt?: number) {
      const tickNumber =
        scheduledAt === undefined ? ++ticks : Math.floor(scheduledAt / 10_000);
      await tick.emit({
        ...(scheduledAt === undefined
          ? {}
          : {
              eventId: `tick-${scheduledAt}`,
              timestamp: new Date(scheduledAt).toISOString(),
            }),
        data: {
          tick: tickNumber,
          message: "Hello from the official TypeScript SDK",
        },
      });
    },
    async stop() {
      const error = new EventsError(
        "forbidden",
        "Demo session expired. Create a new session to continue.",
      );
      await Promise.all([ping.terminate(error), tick.terminate(error)]);
    },
  };
}
