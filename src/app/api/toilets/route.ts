import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { getVersion, bumpVersion, listToilets, KIND_TO_DB } from "@/lib/toilets";
import { FRANCE_BBOX } from "@/lib/france";
import { withApiErrorHandling } from "@/lib/api-error";
import { jsonResponse } from "@/lib/compress";
import type { ToiletKind } from "@/lib/types";

const MAX_PHOTOS = 3;
const KINDS: ToiletKind[] = ["gratuit", "payant", "commerce"];

/** Cheap sync: client sends its last known version, we reply 304 when nothing changed. */
export const GET = withApiErrorHandling(async (req: NextRequest) => {
  const me = await getSessionUser();
  const version = await getVersion();
  const clientVersion = req.nextUrl.searchParams.get("v");

  if (clientVersion !== null && Number(clientVersion) === version) {
    return new NextResponse(null, { status: 304 });
  }

  const toilets = await listToilets(me?.id ?? null);
  return jsonResponse({ version, toilets }, req, { headers: { "Cache-Control": "no-store" } });
});

export const POST = withApiErrorHandling(async (req: NextRequest) => {
  const me = await getSessionUser();
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });

  const { name, lat, lng, kind, price, address, description, pseudo, photos } = body as Record<string, unknown>;

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
  let pseudoToUse = me?.pseudo ?? "Anonyme";
  if (!me) {
    if (typeof pseudo !== "string" || pseudo.trim().length < 2 || pseudo.trim().length > 24) {
      return NextResponse.json({ error: "Un pseudo (2 à 24 caractères) est requis sans compte" }, { status: 400 });
    }
    pseudoToUse = pseudo.trim();
  }
  const photoUrls = Array.isArray(photos) ? photos.filter((p): p is string => typeof p === "string").slice(0, MAX_PHOTOS) : [];

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
      createdById: me?.id ?? null,
      createdByPseudo: pseudoToUse,
      photos: { create: photoUrls.map((url) => ({ url, createdById: me?.id ?? null })) },
    },
  });

  await bumpVersion();
  return NextResponse.json({ id: toilet.id }, { status: 201 });
});
