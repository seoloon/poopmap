import zlib from "node:zlib";
import { promisify } from "node:util";
import { NextResponse } from "next/server";

/**
 * Next's self-hosted standalone server does NOT gzip Route Handler responses on its
 * own (unlike static assets/pages) — verified against a production build. For most
 * routes that's irrelevant, but the toilets sync can be several MB of highly
 * repetitive JSON at OSM-seeded scale, so it's worth compressing explicitly rather
 * than shipping that raw over a mobile connection.
 *
 * Gzip, not brotli: benchmarked both against a real ~35k-row payload from this
 * endpoint (mostly repetitive float lat/lng + small ints). Brotli only starts beating
 * gzip at quality ≥10, which takes ~2-5s for a payload this size — brotli at speeds
 * fast enough to actually use (≤9) is both bigger AND slower than gzip level 9 here.
 * Numeric-heavy JSON just isn't brotli's favorable case; don't assume, measure.
 *
 * Uses the async zlib variant (not …Sync): this is Node's single event loop, and a
 * multi-MB payload compressed synchronously would stall every other in-flight
 * request — including other clients' map syncs — for the duration. The async form
 * offloads the work to libuv's threadpool instead.
 */
const MIN_COMPRESS_BYTES = 1024;

const gzip = promisify(zlib.gzip);

export async function jsonResponse(data: unknown, req: Request, init?: ResponseInit): Promise<NextResponse> {
  const body = JSON.stringify(data);
  const acceptsGzip = req.headers.get("accept-encoding")?.includes("gzip") ?? false;
  if (!acceptsGzip || body.length < MIN_COMPRESS_BYTES) {
    return NextResponse.json(data, init);
  }

  const compressed = await gzip(body, { level: zlib.constants.Z_BEST_COMPRESSION });
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  headers.set("Content-Encoding", "gzip");
  headers.append("Vary", "Accept-Encoding");
  return new NextResponse(compressed, { ...init, headers });
}
