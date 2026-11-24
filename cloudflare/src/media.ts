/** Workers' local asset binding can ignore Range; preserve browser seeking there too. */
export async function mediaResponse(request: Request, assets: Fetcher): Promise<Response> {
  const asset = await assets.fetch(request);
  const response = new Response(asset.body, asset);
  if (!asset.ok) return response;
  response.headers.set("Cache-Control", "public, max-age=86400");
  response.headers.set("Access-Control-Allow-Origin", "*");
  response.headers.set("Accept-Ranges", "bytes");
  const range = request.headers.get("range");
  if (!range || asset.status !== 200 || request.method === "HEAD") return response;
  const bytes = await response.arrayBuffer();
  const match = range.match(/^bytes=(\d+)-(\d*)$/);
  const start = match ? Number(match[1]) : -1;
  const end = match?.[2] ? Math.min(Number(match[2]), bytes.byteLength - 1) : bytes.byteLength - 1;
  const headers = response.headers;
  if (start < 0 || start > end || start >= bytes.byteLength) {
    headers.set("Content-Range", `bytes */${bytes.byteLength}`);
    headers.delete("Content-Length");
    return new Response(null, { status: 416, headers });
  }
  headers.set("Content-Range", `bytes ${start}-${end}/${bytes.byteLength}`);
  headers.set("Content-Length", String(end - start + 1));
  return new Response(bytes.slice(start, end + 1), { status: 206, headers });
}
