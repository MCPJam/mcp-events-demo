export const SESSION_TTL_MS = 30 * 60 * 1000;

async function key(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}
function hex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
export async function createSessionToken(secret: string, now = Date.now()) {
  const id = crypto.randomUUID();
  const expiresAt = now + SESSION_TTL_MS;
  const body = `${id}.${expiresAt}`;
  const signature = await crypto.subtle.sign(
    "HMAC",
    await key(secret),
    new TextEncoder().encode(body),
  );
  return { token: `${body}.${hex(signature)}`, expiresAt };
}
export async function verifySessionToken(
  secret: string,
  token: string,
  now = Date.now(),
) {
  const match =
    /^([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.(\d{13})\.([0-9a-f]{64})$/.exec(
      token,
    );
  if (!match) return null;
  const [, id, expiration, signature] = match;
  const expiresAt = Number(expiration);
  if (expiresAt <= now || expiresAt > now + SESSION_TTL_MS + 5000) return null;
  const bytes = Uint8Array.from(signature.match(/../g)!, (pair) =>
    parseInt(pair, 16),
  );
  const valid = await crypto.subtle.verify(
    "HMAC",
    await key(secret),
    bytes,
    new TextEncoder().encode(`${id}.${expiration}`),
  );
  return valid ? { id, expiresAt } : null;
}
