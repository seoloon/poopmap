import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { withApiErrorHandling } from "@/lib/api-error";

const MAX_PHOTOS = 3;

/**
 * Fills in a missing name and/or missing photos on an existing (OSM-seeded) toilet.
 * First come, first served: only applies to fields that are currently empty, and
 * requires login (unlike anonymous reviews) so an admin can act on the account if
 * something inappropriate gets submitted this way.
 */
export const POST = withApiErrorHandling(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const toiletId = Number((await params).id);
  if (!Number.isInteger(toiletId)) return NextResponse.json({ error: "Id invalide" }, { status: 400 });

  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Connecte-toi pour compléter ce spot" }, { status: 401 });

  const toilet = await prisma.toilet.findUnique({
    where: { id: toiletId },
    select: { id: true, status: true, name: true, _count: { select: { photos: true } } },
  });
  if (!toilet || toilet.status !== "APPROVED") {
    return NextResponse.json({ error: "Ce spot n'existe pas" }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const { name, photos } = body;

  const wantsName = typeof name === "string" && name.trim().length > 0;
  const wantsPhotos = Array.isArray(photos) && photos.length > 0;
  if (!wantsName && !wantsPhotos) {
    return NextResponse.json({ error: "Rien à compléter" }, { status: 400 });
  }

  const nameEligible = toilet.name === null;
  const photosEligible = toilet._count.photos === 0;
  const nameActionable = wantsName && nameEligible;
  const photosActionable = wantsPhotos && photosEligible;

  if (!nameActionable && !photosActionable) {
    const error =
      wantsName && wantsPhotos
        ? "Ce spot a déjà un nom et des photos"
        : wantsName
          ? "Ce spot a déjà un nom"
          : "Ce spot a déjà des photos";
    return NextResponse.json({ error }, { status: 409 });
  }

  let nameApplied = false;
  if (nameActionable) {
    const trimmed = (name as string).trim();
    if (trimmed.length < 3 || trimmed.length > 80) {
      return NextResponse.json({ error: "Le nom doit faire entre 3 et 80 caractères" }, { status: 400 });
    }
    // Conditional update: only succeeds if the name is still null at commit time —
    // the actual "first come, first served" guarantee under concurrent submissions.
    const result = await prisma.toilet.updateMany({
      where: { id: toiletId, name: null },
      data: { name: trimmed, nameSetById: me.id },
    });
    nameApplied = result.count > 0;
  }

  let photosApplied = 0;
  if (photosActionable) {
    const urls = (photos as unknown[]).filter((p): p is string => typeof p === "string").slice(0, MAX_PHOTOS);
    if (urls.length > 0) {
      await prisma.$transaction(async (tx) => {
        const current = await tx.photo.count({ where: { toiletId } });
        if (current === 0) {
          await tx.photo.createMany({ data: urls.map((url) => ({ toiletId, url, createdById: me.id })) });
          photosApplied = urls.length;
        }
      });
    }
  }

  if (!nameApplied && photosApplied === 0) {
    return NextResponse.json({ error: "Quelqu'un vient de compléter ce spot avant toi 🏃" }, { status: 409 });
  }

  return NextResponse.json({ ok: true, nameApplied, photosApplied });
});
