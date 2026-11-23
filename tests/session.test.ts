import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createSessionToken,
  verifySessionToken,
  SESSION_TTL_MS,
} from "../cloudflare/src/session-token.ts";

test("signed sessions are isolated, expire, and reject forged credentials", async () => {
  const secret = "unit-test-secret-not-used-in-any-deployment";
  const now = 1_795_000_000_000;
  const first = await createSessionToken(secret, now);
  const second = await createSessionToken(secret, now);
  const a = await verifySessionToken(secret, first.token, now);
  const b = await verifySessionToken(secret, second.token, now);
  assert.ok(a && b);
  assert.notEqual(a.id, b.id);
  assert.equal(a.expiresAt, now + SESSION_TTL_MS);
  assert.equal(
    await verifySessionToken(secret, first.token, a.expiresAt),
    null,
  );
  assert.equal(
    await verifySessionToken("different-secret", first.token, now),
    null,
  );
  const parts = first.token.split(".");
  parts[1] = String(now + SESSION_TTL_MS - 1000);
  assert.equal(await verifySessionToken(secret, parts.join("."), now), null);
  assert.equal(await verifySessionToken(secret, "malformed", now), null);
});
