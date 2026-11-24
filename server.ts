import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { serveMedia } from "./media.js";
import {
  OAuthError,
  OAuthErrorCode,
  requireBearerAuth,
} from "@modelcontextprotocol/server";
import { nodeWebhookSender } from "@modelcontextprotocol/server/ext/events/node";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { createDemo } from "./demo.js";
import { getToken, port, receiverPort } from "./config.js";

const jensen = process.env.JENSEN_SHOW === "1" ? (await import("./jensen.js")).createJensen : undefined;
const token = getToken();
const log = (action: string, details: object = {}) =>
  console.log(
    JSON.stringify({ at: new Date().toISOString(), action, ...details }),
  );

// All protocol, subscription, replay, signature and delivery logic is the official SDK.
const demo = createDemo({
  getPrincipal: (ctx) => {
    const principal = ctx.http?.authInfo?.extra?.sub;
    return typeof principal === "string" ? principal : null;
  },
  webhookSender: nodeWebhookSender(),
  webhookTtlMs: 60_000,
  // Only the local smoke-test receiver bypasses the SDK's public HTTPS requirement.
  trustedOrigins: [`http://127.0.0.1:${receiverPort}`],
  checkIntervalMs: 250,
  defaultNextPollMs: 1000,
}, jensen && (events => jensen(events, {
  html: () => readFile(new URL("./show.html", import.meta.url), "utf8"),
  mediaOrigin: () => `http://127.0.0.1:${port}`,
})));

const gate = requireBearerAuth({
  verifier: {
    async verifyAccessToken(value) {
      if (value !== token)
        throw new OAuthError(OAuthErrorCode.InvalidToken, "Invalid demo token");
      return {
        token: value,
        clientId: "mcpjam-demo",
        scopes: [],
        // Static demo credential; each successful verification authorizes the next hour.
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
        extra: { sub: "demo-user" },
      };
    },
  },
});
const handler = demo.handler;
const timer = setInterval(() => void demo.tick().catch(console.error), 10_000);
timer.unref();
const mcp = toNodeHandler({
  async fetch(request) {
    const authInfo = await gate(request);
    if (authInfo instanceof Response) return authInfo;
    // Log method names only, never request bodies, authorization headers or callback secrets.
    const method = request.headers.get("mcp-method");
    if (method && method !== "events/poll") log("rpc", { method });
    return handler.fetch(request, { authInfo });
  },
});
const http = createServer((req, res) => {
  const path = new URL(req.url ?? "/", "http://localhost").pathname;
  if (jensen && /^\/media\/(cold-open|stage|locker-room|wolf)\.mp4$/.test(path) && ["GET", "HEAD"].includes(req.method ?? "")) {
    void serveMedia(req, res, new URL("./cloudflare/assets" + path, import.meta.url));
    return;
  }
  if (path === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        sdk: "official-events-PR-3209",
        events: ["demo.ping", "timer.tick", ...(jensen ? ["jensen.returned"] : [])],
      }),
    );
    return;
  }
  if (path !== "/mcp") {
    res.writeHead(404);
    res.end("MCP endpoint: /mcp");
    return;
  }
  void mcp(req, res);
});
http.listen(port, "127.0.0.1", () => {
  log("ready", {
    url: `http://127.0.0.1:${port}/mcp`,
    tokenFile: ".demo-token",
  });
});
async function shutdown() {
  clearInterval(timer);
  await handler.close();
  http.closeAllConnections();
  http.close();
}
process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
