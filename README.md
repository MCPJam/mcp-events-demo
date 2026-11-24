# MCP Events Demo

A real MCP Events publisher, built with the **official TypeScript SDK**, that you can connect to MCPJam or another compatible client.

**[Try the hosted demo](https://mcp-events.mcpjam.com)** · [Official SDK Events PR](https://github.com/modelcontextprotocol/typescript-sdk/pull/3209)

Hosted MCP endpoint: **`https://mcp-events.mcpjam.com/mcp`**. Create a session on the home page to get its Authorization header.

## Try it in MCPJam

1. Open the hosted demo and click **Create session**.
2. Add an **HTTP** server in MCPJam with the URL shown on the page.
3. Add a custom header named **Authorization** and paste the entire value shown, including `Bearer`. No OAuth login is needed.
4. In Events, subscribe to **`timer.tick`**. A heartbeat arrives about every 10 seconds.
5. For manual delivery, subscribe to **`demo.ping`**, then call **`emit_ping`** from Tools:

```json
{ "message": "Hello MCPJam!", "topic": "demo" }
```

Both event types support **webhook, polling, and streaming (push)**. The optional `topic` subscription argument filters `demo.ping` events. Enable the desired delivery mode in your MCPJam client/host settings.

Each visitor gets an isolated **30-minute session**. Keep its token private: anyone holding it can access that session. When it expires, subscriptions stop and stored session data is removed. Create another session to continue. Use synthetic test messages only.

An agent can call `emit_ping` just like any other MCP tool. Whether that agent automatically consumes or reacts to the event depends on the client's integration; this demo does not establish Events support across every MCPJam Playground, eval, swarm, or user-testing surface.

## Official SDK version

The source is pinned as a git submodule to:

- Repository: [`modelcontextprotocol/typescript-sdk`](https://github.com/modelcontextprotocol/typescript-sdk)
- Branch at selection: `feature/ext-events-sep-3415`
- Commit: `5ebb589b970bfc8f98e344e13299f8eb76ff8cd1`
- Events implementation: [PR #3209](https://github.com/modelcontextprotocol/typescript-sdk/pull/3209), experimental and open when selected

This is **not a stable npm release of Events support**. The server speaks MCP `2026-07-28` and advertises `capabilities.extensions["io.modelcontextprotocol/events"]`. It does not emulate the older top-level `capabilities.events` draft.

`demo.ts` uses the official `EventsExtension`, `registerEvent`, `emit`, and `createMcpHandler` APIs. The SDK handles protocol messages, subscription validation, callback verification, signatures, leases, and delivery retries. Cloudflare supplies the HTTP sender, persistent subscription storage, and scheduling through the SDK's extension points.

## Run locally

Requirements: Node 24 and pnpm 10.26.1.

```sh
git clone --recurse-submodules https://github.com/MCPJam/mcp-events-demo.git
cd mcp-events-demo
nvm use
npm run setup
npm start
```

The setup script installs the SDK's locked workspace dependencies, builds its server/client/Node packages, and links them into the demo. Do not run a separate `npm install` in the root.

Connect to `http://127.0.0.1:18889/mcp`. On first start, the Node server generates `.demo-token` (gitignored, mode 0600). Set the custom HTTP header:

```text
Authorization: Bearer <contents of .demo-token>
```

The local Node version has a single test principal and in-memory subscriptions. It uses the SDK's `nodeWebhookSender`. The hosted version uses isolated sessions and Durable Object storage. Both use the same event definitions in `demo.ts`.

Local configuration:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `18889` | Node server port |
| `DEMO_TOKEN` | `.demo-token` contents | Override the local bearer credential |
| `EVENTS_RECEIVER_PORT` | `18890` | Smoke-test receiver; set on both Node server and test if changing it |
| `WEBHOOK_URL` | Local receiver URL | Public HTTPS receiver URL for remote tests |

For temporary remote access to the local Node server, install `cloudflared` and run `npm run tunnel`. This is separate from the permanent Workers deployment.

## Deploy your own Cloudflare copy

The hosted version uses a Worker and one SQLite-backed Durable Object per session. You need a Cloudflare account with Workers and Durable Objects available.

```sh
# After npm run setup:
npm --prefix cloudflare ci
cd cloudflare
npx wrangler login
```

Choose a unique Worker `name` in `cloudflare/wrangler.jsonc`. Remove the `routes` entry for MCPJam's domain, or replace it with a domain in your own Cloudflare account. Change the two rate-limit namespace IDs if those IDs already exist in your account. The config does not contain an account ID or production secrets.

```sh
npx wrangler deploy
npx wrangler secret put DEMO_SESSION_SECRET
```

At the secret prompt, paste a fresh random secret of at least 32 characters, for example one generated with `openssl rand -hex 32`. Until this secret is configured, session creation and MCP access return `503`. Rotating it invalidates existing session tokens.

Wrangler prints your `workers.dev` address and any configured custom domain. MCPJam's deployment uses `mcp-events.mcpjam.com`. Share the **home page**, where users create their own credentials, rather than sharing one user's token. The landing page's source link points to this repository; update it for your fork if desired.

For local Cloudflare development, create `cloudflare/.dev.vars` with a **different** random secret:

```text
DEMO_SESSION_SECRET=your-local-random-secret-at-least-32-characters
```

Then run `npm --prefix cloudflare run dev` and visit `http://localhost:18891`. Never commit `.dev.vars` or share the session-signing secret.

## Architecture and limits

- `demo.ts`: shared event catalog and manual emission tool, using the official SDK.
- `server.ts`: local Node HTTP server and SDK Node webhook sender.
- `cloudflare/src/index.ts`: session creation, validation, rate limiting, Durable Object routing, webhook storage, and alarms.
- `cloudflare/src/webhook-sender.ts`: Workers `fetch` adapter; HTTPS only, no redirects, five-second timeout, 64 KiB response cap. Cloudflare's public outbound network enforces private-destination restrictions. No private networking bindings are configured.
- `cloudflare/src/landing.ts`: self-service connection instructions; no account or shared credential required.

Hosted sessions use signed, expiring bearer tokens. The session ID routes all requests to the same Durable Object. Webhook subscription records (including signing secrets) live in that object's storage. An alarm emits the heartbeat roughly every 10 seconds, even without incoming HTTP requests, and terminates subscriptions and deletes storage at session expiry.

**Demo durability:** the event replay buffer and manual sequence counter are in memory and may reset after runtime eviction or deployment. Webhook records survive those restarts until session expiry, but this is not a durable event queue or an exactly-once delivery system. Alarm retries reuse an event ID where possible; consumers should deduplicate by event ID.

The hosted replay buffer holds at most 256 events / five minutes per event type. SDK subscription quotas and a stored-webhook cap bound each session. Session creation is limited to approximately 10/minute per IP and MCP requests to 300/minute per session, per Cloudflare location. These are demo safeguards, not a global spending cap. Active sessions use Durable Object requests, storage, and duration; normal Cloudflare usage charges apply. Worker invocation logging is disabled to avoid collecting demo traffic by default.

## Tests

```sh
npm run typecheck
npm --prefix cloudflare run check
npm run test:unit
npm --prefix cloudflare run build

# With the local Node server running:
npm test

# With the local Cloudflare server running:
npm run test:isolation
```

The official SDK client checks discovery, manual event delivery via **all three modes**, topic filtering, timer delivery, and cancellation. Additional checks cover session separation, missing/forged credentials, expiration/signature validation, and the Cloudflare sender's transport boundaries.

To test all modes against a hosted server, expose the smoke-test receiver from your machine:

```sh
cloudflared tunnel --url http://127.0.0.1:18890
```

In another terminal, use that tunnel's HTTPS URL:

```sh
WEBHOOK_URL=https://YOUR-RECEIVER.trycloudflare.com/events \
  npm run test:cloudflare -- https://YOUR-DEMO.workers.dev/mcp

npm run test:isolation -- https://YOUR-DEMO.workers.dev/mcp
```

The test creates its own 30-minute hosted session. Its receiver is started before subscribing and closed when the test finishes. Stop the receiver tunnel afterward. Hosted senders cannot call your machine's localhost directly.

GitHub Actions builds the pinned SDK, typechecks both runtimes, runs unit checks, tests all three modes against Node, and checks isolation in the local Cloudflare runtime. Public callback delivery is verified separately against the live deployment.

## License

Demo code: MIT. The official SDK submodule retains its Apache-2.0 license.
