import { createJensen } from "../../jensen";
import showHtml from "../../show.html";
import controlHtml from "../../control.html";
import { ShowRuns, controlHeaders, handleRunRequest, type ShowRun } from "../../show-runs";
import { DurableObject } from "cloudflare:workers";
import {
  EventsError,
  type WebhookSubscriptionRecord,
  type WebhookSubscriptionStore,
} from "@modelcontextprotocol/server/ext/events";
import { createDemo } from "../../demo";
import { createSessionToken, verifySessionToken } from "./session-token";
import { cloudflareWebhookSender } from "./webhook-sender";
import { landing } from "./landing";
import { mediaResponse } from "./media";

interface Env {
  ASSETS: Fetcher;
  SESSIONS: DurableObjectNamespace<EventsDemoSession>;
  SESSION_LIMIT: RateLimit;
  REQUEST_LIMIT: RateLimit;
  DEMO_SESSION_SECRET: string;
}
const TICK_MS = 10_000;

class SubscriptionStore implements WebhookSubscriptionStore {
  constructor(private storage: DurableObjectStorage) {}
  get(id: string) {
    return this.storage.get<WebhookSubscriptionRecord>(`subscription:${id}`);
  }
  async put(record: WebhookSubscriptionRecord) {
    if (
      !(await this.get(record.id)) &&
      (await this.storage.list({ prefix: "subscription:", limit: 32 })).size >=
        32
    ) {
      throw new EventsError(
        "resourceExhausted",
        "This demo session allows at most 32 webhook subscriptions.",
      );
    }
    await this.storage.put(`subscription:${record.id}`, record);
  }
  delete(id: string) {
    return this.storage.delete(`subscription:${id}`);
  }
  async *listByName(name: string) {
    const records = await this.storage.list<WebhookSubscriptionRecord>({
      prefix: "subscription:",
    });
    for (const record of records.values())
      if (record.name === name) yield record;
  }
}

export class EventsDemoSession extends DurableObject<Env> {
  private demo: ReturnType<typeof createDemo>;
  private expiresAt = 0;
  private mediaOrigin = "";
  private runs!: ShowRuns;
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.demo = createDemo({
      getPrincipal: () => ctx.id.toString(),
      webhookSender: cloudflareWebhookSender,
      webhookStore: new SubscriptionStore(ctx.storage),
      webhookTtlMs: 60_000,
      maxSubscriptions: 128,
      emitBuffer: { maxEvents: 256, maxAgeMs: 5 * 60_000 },
      defaultNextPollMs: 1000,
      checkIntervalMs: 1000,
    }, events => {
      const show = createJensen(events, {
        html: async () => showHtml,
        mediaOrigin: () => this.mediaOrigin,
      });
      // The run lives in this session's storage; the alarm fires it even if the isolate restarts.
      this.runs = new ShowRuns(show.emit, {
        get: () => ctx.storage.get<ShowRun>("jensenRun"),
        put: run => ctx.storage.put("jensenRun", run),
      }, () => this.reschedule());
      return show.register;
    });
    ctx.blockConcurrencyWhile(async () => {
      this.expiresAt = (await ctx.storage.get<number>("expiresAt")) ?? 0;
    });
  }
  async fetch(request: Request) {
    this.mediaOrigin = new URL(request.url).origin;
    if (!this.expiresAt) {
      this.expiresAt = Number(request.headers.get("x-demo-expires-at"));
      if (!Number.isFinite(this.expiresAt) || this.expiresAt <= Date.now())
        return new Response("Expired session", { status: 401 });
      await this.ctx.storage.put("expiresAt", this.expiresAt);
      await this.ctx.storage.setAlarm(
        Math.min(Date.now() + TICK_MS, this.expiresAt),
      );
    }
    if (Date.now() >= this.expiresAt)
      return new Response("Expired session", { status: 401 });
    return (await handleRunRequest(request, this.runs)) ?? this.demo.handler.fetch(request);
  }
  /** One alarm serves both the heartbeat and a pending Jensen return: whichever is sooner. */
  private async reschedule() {
    const now = Date.now();
    const nextTick = (await this.ctx.storage.get<number>("nextTick")) ?? now + TICK_MS;
    const run = await this.ctx.storage.get<ShowRun>("jensenRun");
    let at = Math.min(Math.max(nextTick, now), this.expiresAt);
    if (run?.state === "running") at = Math.min(at, run.returnsAt);
    await this.ctx.storage.setAlarm(at);
  }
  async alarm() {
    if (Date.now() >= this.expiresAt) {
      await this.demo.stop();
      await this.demo.handler.close();
      await this.ctx.storage.deleteAll();
      await this.ctx.storage.deleteAlarm();
      return;
    }
    await this.runs.due();
    // Stable ID across alarm retries. Persist the next tick before performing delivery.
    const scheduledAt =
      (await this.ctx.storage.get<number>("nextTick")) ??
      Math.floor(Date.now() / TICK_MS) * TICK_MS;
    if (Date.now() >= scheduledAt) {
      await this.ctx.storage.setAlarm(
        Math.min(Date.now() + TICK_MS, this.expiresAt),
      );
      await this.demo.tick(scheduledAt);
      await this.ctx.storage.put("nextTick", scheduledAt + TICK_MS);
    }
    await this.reschedule();
  }
}

function cors(response: Response) {
  const result = new Response(response.body, response);
  result.headers.set("Access-Control-Allow-Origin", "*");
  result.headers.set(
    "Access-Control-Expose-Headers",
    "Mcp-Session-Id, Mcp-Protocol-Version, WWW-Authenticate",
  );
  result.headers.set("Cache-Control", "no-store");
  result.headers.set("X-Content-Type-Options", "nosniff");
  return result;
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname, origin } = new URL(request.url);
    if (request.method === "OPTIONS")
      return cors(
        new Response(null, {
          headers: {
            "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
            "Access-Control-Allow-Headers":
              request.headers.get("Access-Control-Request-Headers") ??
              "Authorization, Content-Type",
          },
        }),
      );
    if (/^\/media\/(cold-open|stage|locker-room|wolf)\.mp4$/.test(pathname) && ["GET", "HEAD"].includes(request.method)) {
      return mediaResponse(request, env.ASSETS);
    }
    if (pathname === "/" && request.method === "GET") return landing();
    if (pathname === "/jensen" && request.method === "GET")
      return new Response(controlHtml, { headers: controlHeaders });
    if (pathname === "/health")
      return cors(
        Response.json({
          ok: true,
          sdkCommit: "5ebb589b970bfc8f98e344e13299f8eb76ff8cd1",
        }),
      );
    const isRun = pathname === "/jensen/run" || pathname === "/jensen/run/emit";
    if (pathname !== "/sessions" && pathname !== "/mcp" && !isRun)
      return new Response("Not found", { status: 404 });
    if (!env.DEMO_SESSION_SECRET || env.DEMO_SESSION_SECRET.length < 32)
      return cors(new Response("Demo is not configured", { status: 503 }));
    if (pathname === "/sessions") {
      if (request.method !== "POST")
        return cors(new Response("Use POST", { status: 405 }));
      // Only session creation uses an IP limit; MCP requests are limited by session.
      const { success } = await env.SESSION_LIMIT.limit({
        key: request.headers.get("cf-connecting-ip") ?? "local",
      });
      if (!success)
        return cors(
          new Response(
            "Please wait a minute before creating another session.",
            { status: 429, headers: { "Retry-After": "60" } },
          ),
        );
      return cors(
        Response.json({
          ...(await createSessionToken(env.DEMO_SESSION_SECRET)),
          url: `${origin}/mcp`,
        }),
      );
    }
    const token =
      /^Bearer (.+)$/i.exec(request.headers.get("Authorization") ?? "")?.[1] ??
      "";
    const session = await verifySessionToken(env.DEMO_SESSION_SECRET, token);
    if (!session)
      return cors(
        new Response(
          "Create a new 30-minute demo session on the home page, then use its bearer token.",
          {
            status: 401,
            headers: { "WWW-Authenticate": 'Bearer realm="MCP Events Demo"' },
          },
        ),
      );
    if (!(await env.REQUEST_LIMIT.limit({ key: session.id })).success)
      return cors(
        new Response("Session request limit exceeded.", {
          status: 429,
          headers: { "Retry-After": "60" },
        }),
      );
    const headers = new Headers(request.headers);
    headers.set("x-demo-expires-at", String(session.expiresAt));
    const object = env.SESSIONS.get(env.SESSIONS.idFromName(session.id));
    return cors(await object.fetch(new Request(request, { headers })));
  },
} satisfies ExportedHandler<Env>;
