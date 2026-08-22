import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { resolveMediaFile } from "@/lib/media";
import { withApiErrorHandling } from "@/lib/api-error";

/** Filenames are content-addressed-ish (a given uuid's bytes never change) — safe
 *  to cache for a long time. */
const CACHE_CONTROL = "public, max-age=31536000, immutable";

export const GET = withApiErrorHandling(async (_req: Request, { params }: { params: Promise<{ filename: string }> }) => {
  const { filename } = await params;
  const found = await resolveMediaFile(filename);
  if (!found) return NextResponse.json({ error: "Photo introuvable" }, { status: 404 });

  const bytes = await readFile(found.path);
  return new NextResponse(bytes, {
    headers: { "Content-Type": found.contentType, "Cache-Control": CACHE_CONTROL },
  });
});
