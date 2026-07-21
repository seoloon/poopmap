import zlib from "node:zlib";
import { NextResponse } from "next/server";

/**
 * Next's self-hosted standalone server does NOT gzip Route Handler responses on its
 * own (unlike static assets/pages) — verified against a production build. For most
 * routes that's irrelevant, but the toilets sync can be several MB of highly
 * repetitive JSON at OSM-seeded scale, so it's worth compressing explicitly rather
 * than shipping that raw over a mobile connection.
 */
const MIN_COMPRESS_BYTES = 1024;

export function jsonResponse(data: unknown, req: Request, init?: ResponseInit): NextResponse {
  const body = JSON.stringify(data);
  const acceptsGzip = req.headers.get("accept-encoding")?.includes("gzip") ?? false;
  if (!acceptsGzip || body.length < MIN_COMPRESS_BYTES) {
    return NextResponse.json(data, init);
  }

  const compressed = zlib.gzipSync(body);
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  headers.set("Content-Encoding", "gzip");
  headers.append("Vary", "Accept-Encoding");
  return new NextResponse(compressed, { ...init, headers });
}
