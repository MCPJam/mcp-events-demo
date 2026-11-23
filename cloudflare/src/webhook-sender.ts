import type { WebhookSender } from "@modelcontextprotocol/server/ext/events";

// Runtime adapter only: the SDK constructs/verifies/signs the protocol messages.
// Workers' public fetch network blocks private destinations; redirects are never followed.
// https://developers.cloudflare.com/workers/configuration/compatibility-flags/#global-fetch-strictly-public
export const cloudflareWebhookSender: WebhookSender = async (request) => {
  const url = new URL(request.url);
  if (url.protocol !== "https:" || url.username || url.password)
    return { error: "connection_refused" };
  const deadline = AbortSignal.timeout(5000);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: request.headers,
      body: request.body,
      redirect: "manual",
      signal: AbortSignal.any([request.signal, deadline]),
    });
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let size = 0;
    let body = "";
    if (reader) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const bytes = value.subarray(0, 65_536 - size);
          body += decoder.decode(bytes, { stream: true });
          size += bytes.byteLength;
          if (size >= 65_536) break;
        }
        body += decoder.decode();
      } finally {
        await reader.cancel();
      }
    }
    return { status: response.status, body };
  } catch {
    return { error: deadline.aborted ? "timeout" : "connection_refused" };
  }
};
