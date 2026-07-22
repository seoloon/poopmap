import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

/** True for "can't reach the database" style failures — not a bug, just infra being down. */
export function isDbConnectionError(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientInitializationError ||
    (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P1001")
  );
}

export function dbUnavailableResponse() {
  return NextResponse.json(
    { error: "Base de données injoignable pour le moment — réessaie dans un instant." },
    { status: 503 }
  );
}

/**
 * First-line body-size guard: rejects a request whose declared Content-Length exceeds
 * `maxBytes` before the body is ever read/parsed. Browsers (and fetch/axios/curl with
 * a non-streamed body) always send Content-Length, so this stops the realistic
 * "POST me a 100 MB JSON" memory/CPU DoS; a deliberately chunked request without the
 * header falls through to the reverse proxy's own limit and the per-field validation
 * (photo string caps etc.) in each route.
 */
export function payloadTooLarge(req: Request, maxBytes: number): NextResponse | null {
  const len = Number(req.headers.get("content-length"));
  if (Number.isFinite(len) && len > maxBytes) {
    return NextResponse.json({ error: "Requête trop volumineuse" }, { status: 413 });
  }
  return null;
}

/**
 * Wraps a route handler so a DB outage becomes a clean 503 instead of an unhandled
 * exception (which Next.js logs as a scary, misleading stack-trace dump on every request).
 */
export function withApiErrorHandling<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response>
) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (err) {
      if (isDbConnectionError(err)) {
        const firstLine = err instanceof Error ? err.message.split("\n").find((l) => l.trim()) : undefined;
        console.warn(`[api] database unreachable: ${firstLine ?? err}`);
        return dbUnavailableResponse();
      }
      console.error("[api] unexpected error:", err);
      return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
    }
  };
}
