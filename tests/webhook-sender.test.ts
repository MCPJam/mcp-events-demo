import { test } from "node:test";
import assert from "node:assert/strict";
import { cloudflareWebhookSender } from "../cloudflare/src/webhook-sender.ts";

test("Cloudflare adapter requires HTTPS, preserves signatures, refuses redirects and caps response bodies", async (t) => {
  let calls = 0;
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: URL, options: RequestInit) => {
      calls++;
      assert.equal(options.redirect, "manual");
      assert.equal(options.method, "POST");
      assert.equal(options.body, '{"event":"demo"}');
      assert.equal(
        (options.headers as Record<string, string>)["webhook-signature"],
        "sdk-signature",
      );
      return new Response("x".repeat(100_000), {
        status: 302,
        headers: { Location: "http://127.0.0.1/private" },
      });
    },
  );
  const input = {
    url: "https://receiver.example/events",
    headers: { "webhook-signature": "sdk-signature" },
    body: '{"event":"demo"}',
    trusted: false,
    signal: new AbortController().signal,
  };
  assert.deepEqual(
    await cloudflareWebhookSender({ ...input, url: "http://127.0.0.1/events" }),
    { error: "connection_refused" },
  );
  assert.equal(calls, 0);
  const result = await cloudflareWebhookSender(input);
  assert.ok("status" in result);
  assert.equal(result.status, 302);
  assert.equal(result.body.length, 65_536);
  assert.equal(calls, 1);
});
