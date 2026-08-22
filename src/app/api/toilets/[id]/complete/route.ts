import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { payloadTooLarge, withApiErrorHandling } from "@/lib/api-error";
import { sanitizePhotos } from "@/lib/photos";
import { isRateLimited } from "@/lib/rate-limit";
import { saveUploadedPhoto } from "@/lib/media";

const MAX_PHOTOS = 3;
const MAX_BODY_BYTES = 2_500_000;

/**
 * Proposes filling in missing info (name / address / comment / photo(s)) on an
 * existing (OSM-seeded) toilet. Requires login. Unlike the old flow, this no longer
 * auto-applies — it creates a PENDING `Completion` that a moderator must approve
 * (in full or in part) before it merges into the toilet; see
 * `moderateCompletion` in `lib/moderation.ts`.
 */
export const POST = withApiErrorHandling(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const tooBig = payloadTooLarge(req, MAX_BODY_BYTES);
  if (tooBig) return tooBig;

  const toiletId = Number((await params).id);
  if (!Number.isInteger(toiletId)) return NextResponse.json({ error: "Id invalide" }, { status: 400 });

  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Connecte-toi pour compléter ce spot" }, { status: 401 });
  if (isRateLimited(`complete:${me.id}`, 5)) {
    return NextResponse.json({ error: "Doucement — trop de complétions d'un coup, réessaie dans quelques minutes" }, { status: 429 });
  }

  const toilet = await prisma.toilet.findUnique({
    where: { id: toiletId },
    select: { id: true, status: true, name: true, address: true, description: true, _count: { select: { photos: true } } },
  });
  if (!toilet || toilet.status !== "APPROVED") {
    return NextResponse.json({ error: "Ce spot n'existe pas" }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const { name, address, comment, photos } = body;

  const wantsName = typeof name === "string" && name.trim().length > 0;
  const wantsAddress = typeof address === "string" && address.trim().length > 0;
  const wantsComment = typeof comment === "string" && comment.trim().length > 0;
  const wantsPhotos = Array.isArray(photos) && photos.length > 0;
  if (!wantsName && !wantsAddress && !wantsComment && !wantsPhotos) {
    return NextResponse.json({ error: "Rien à compléter" }, { status: 400 });
  }

  const nameActionable = wantsName && toilet.name === null;
  const addressActionable = wantsAddress && toilet.address === null;
  const commentActionable = wantsComment && toilet.description === null;
  const photosActionable = wantsPhotos && toilet._count.photos === 0;

  if (!nameActionable && !addressActionable && !commentActionable && !photosActionable) {
    return NextResponse.json({ error: "Ce spot a déjà toutes ces informations" }, { status: 409 });
  }

  if (nameActionable) {
    const trimmed = (name as string).trim();
    if (trimmed.length < 3 || trimmed.length > 80) {
      return NextResponse.json({ error: "Le nom doit faire entre 3 et 80 caractères" }, { status: 400 });
    }
  }

  // One pending completion per toilet at a time — keeps the moderation queue and the
  // eventual merge simple, instead of stacking up competing proposals for the same spot.
  const existingPending = await prisma.completion.findFirst({ where: { toiletId, status: "PENDING" } });
  if (existingPending) {
    return NextResponse.json({ error: "Une complétion est déjà en attente de validation pour ce spot 🏃" }, { status: 409 });
  }

  const photoDataUrls = photosActionable ? sanitizePhotos(photos, MAX_PHOTOS) : [];
  const urls = await Promise.all(photoDataUrls.map(saveUploadedPhoto));

  const completion = await prisma.completion.create({
    data: {
      toiletId,
      userId: me.id,
      name: nameActionable ? (name as string).trim() : null,
      address: addressActionable ? (address as string).trim().slice(0, 160) : null,
      comment: commentActionable ? (comment as string).trim().slice(0, 600) : null,
      photos: urls.length > 0 ? { create: urls.map((url) => ({ url })) } : undefined,
    },
  });

  return NextResponse.json({ ok: true, id: completion.id }, { status: 201 });
});
