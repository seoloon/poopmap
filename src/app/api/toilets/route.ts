import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { getVersion, bumpVersion, listToilets, KIND_TO_DB } from "@/lib/toilets";
import { FRANCE_BBOX } from "@/lib/france";
import { payloadTooLarge, withApiErrorHandling } from "@/lib/api-error";
import { jsonResponse } from "@/lib/compress";
import { sanitizePhotos } from "@/lib/photos";
import { isRateLimited } from "@/lib/rate-limit";
import type { ToiletKind } from "@/lib/types";

const MAX_PHOTOS = 3;
// 3 photos ≤600k chars each + text fields, with headroom — anything bigger is abuse.
const MAX_BODY_BYTES = 2_500_000;
const KINDS: ToiletKind[] = ["gratuit", "payant", "commerce"];

/** Cheap sync: client sends its last known version, we reply 304 when nothing changed. */
export const GET = withApiErrorHandling(async (req: NextRequest) => {
  // Version check FIRST: this endpoint is polled every 20s by every open tab, and the
  // overwhelmingly common outcome is "nothing changed". The version is global (any
  // change to any user's visible pins bumps it), so the 304 can be decided from one
  // tiny query — resolving the session cookie before knowing whether we even need it
  // would double the DB cost of every poll for logged-in users.
  const version = await getVersion();
  const clientVersion = req.nextUrl.searchParams.get("v");

  if (clientVersion !== null && Number(clientVersion) === version) {
    return new NextResponse(null, { status: 304 });
  }

  const me = await getSessionUser();
  const toilets = await listToilets(me?.id ?? null);
  return await jsonResponse({ version, toilets }, req, { headers: { "Cache-Control": "no-store" } });
});

/** Referencing a new spot requires an account — enforced here, not just hidden in the UI. */
export const POST = withApiErrorHandling(async (req: NextRequest) => {
  const tooBig = payloadTooLarge(req, MAX_BODY_BYTES);
  if (tooBig) return tooBig;

  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Connecte-toi pour référencer un spot" }, { status: 401 });
  if (isRateLimited(`toilet:${me.id}`, 5)) {
    return NextResponse.json({ error: "Doucement — trop de spots d'un coup, réessaie dans quelques minutes" }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });

  const { name, lat, lng, kind, price, address, description, photos } = body as Record<string, unknown>;

  if (typeof name !== "string" || name.trim().length < 3 || name.trim().length > 80) {
    return NextResponse.json({ error: "Le nom doit faire entre 3 et 80 caractères" }, { status: 400 });
  }
  if (typeof lat !== "number" || typeof lng !== "number" || Number.isNaN(lat) || Number.isNaN(lng)) {
    return NextResponse.json({ error: "Position invalide" }, { status: 400 });
  }
  const [south, west, north, east] = FRANCE_BBOX;
  if (lat < south || lat > north || lng < west || lng > east) {
    return NextResponse.json({ error: "PoopMap ne référence que la France métropolitaine" }, { status: 400 });
  }
  if (typeof kind !== "string" || !KINDS.includes(kind as ToiletKind)) {
    return NextResponse.json({ error: "Type invalide" }, { status: 400 });
  }
  const photoUrls = sanitizePhotos(photos, MAX_PHOTOS);

  const toilet = await prisma.toilet.create({
    data: {
      name: name.trim(),
      lat,
      lng,
      kind: KIND_TO_DB[kind as ToiletKind],
      price: typeof price === "string" && price.trim() ? price.trim().slice(0, 32) : null,
      address: typeof address === "string" && address.trim() ? address.trim().slice(0, 160) : null,
      description: typeof description === "string" && description.trim() ? description.trim().slice(0, 600) : null,
      status: "PENDING",
      createdById: me.id,
      createdByPseudo: me.pseudo,
      photos: { create: photoUrls.map((url) => ({ url, createdById: me.id })) },
    },
  });

  await bumpVersion();
  return NextResponse.json({ id: toilet.id }, { status: 201 });
});
