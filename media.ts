import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";

/** Public demo clips only; callers must validate the clip name. */
export async function serveMedia(req: IncomingMessage, res: ServerResponse, file: URL) {
  try {
    const { size } = await stat(file);
    const range = req.headers.range;
    const match = range?.match(/^bytes=(\d+)-(\d*)$/);
    const start = match ? Number(match[1]) : 0;
    const end = match?.[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
    if ((range && !match) || start > end || start >= size) {
      res.writeHead(416, { "Content-Range": `bytes */${size}` });
      res.end();
      return;
    }
    res.writeHead(range ? 206 : 200, {
      "Content-Type": "video/mp4", "Accept-Ranges": "bytes",
      "Cache-Control": "public, max-age=86400", "Access-Control-Allow-Origin": "*",
      "Content-Length": end - start + 1,
      ...(range ? { "Content-Range": `bytes ${start}-${end}/${size}` } : {}),
    });
    if (req.method === "HEAD") { res.end(); return; }
    const stream = createReadStream(file, { start, end });
    stream.on("error", error => res.destroy(error));
    res.on("close", () => stream.destroy());
    stream.pipe(res);
  } catch (error) {
    console.error("Demo media unavailable", error);
    res.writeHead(404); res.end("Demo clip unavailable");
  }
}
