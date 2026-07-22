import { prisma } from "./prisma";
import { bumpVersion, KIND_TO_DB } from "./toilets";
import type { AdminCompletion, AdminReviewRow, ToiletKind } from "./types";

/** Latest reviews, flattened with their toilet — the "Avis" tab's data source. */
export async function listReviewsForAdmin(): Promise<AdminReviewRow[]> {
  const rows = await prisma.review.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { toilet: { select: { id: true, name: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    toiletId: r.toilet.id,
    toiletName: r.toilet.name,
    pseudo: r.pseudo,
    proprete: r.proprete,
    confort: r.confort,
    experience: r.experience,
    comment: r.comment,
    status: r.status === "PUBLISHED" ? "published" : "rejected",
    createdAt: r.createdAt.toISOString(),
  }));
}

/** "Compléter ce spot" submissions, flattened with their toilet — the "Complétions" tab. */
export async function listCompletionsForAdmin(): Promise<AdminCompletion[]> {
  const rows = await prisma.completion.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      toilet: { select: { id: true, name: true } },
      user: { select: { pseudo: true } },
      photos: { select: { id: true, url: true }, orderBy: { id: "asc" } },
    },
  });
  return rows.map((c) => ({
    id: c.id,
    toiletId: c.toilet.id,
    toiletName: c.toilet.name,
    userPseudo: c.user.pseudo,
    name: c.name,
    address: c.address,
    comment: c.comment,
    status: c.status.toLowerCase() as AdminCompletion["status"],
    createdAt: c.createdAt.toISOString(),
    photos: c.photos,
  }));
}

type PartialOpts = { rejectedFields: string[]; approveRest: boolean; edits: Record<string, string> };

/**
 * Moderates a pending toilet submission. `approveRest: false` rejects it outright
 * (edits/rejectedFields ignored); `true` approves it, nulling out any field named in
 * `rejectedFields` and applying any moderator edit from `edits` first — the "delete
 * the bad comment, keep the photos/address, then approve" flow.
 */
export async function moderateToilet(id: number, opts: PartialOpts): Promise<{ status: "approved" | "rejected" } | null> {
  const toilet = await prisma.toilet.findUnique({ where: { id }, select: { id: true, status: true } });
  if (!toilet || toilet.status !== "PENDING") return null;

  if (!opts.approveRest) {
    await prisma.toilet.update({ where: { id }, data: { status: "REJECTED" } });
    await bumpVersion();
    return { status: "rejected" };
  }

  const data: Record<string, unknown> = { status: "APPROVED" };
  for (const field of ["name", "address", "description", "price"] as const) {
    if (opts.rejectedFields.includes(field)) data[field] = null;
    else if (field in opts.edits) data[field] = opts.edits[field].trim() || null;
  }
  if (opts.edits.kind && ["gratuit", "payant", "commerce"].includes(opts.edits.kind)) {
    data.kind = KIND_TO_DB[opts.edits.kind as ToiletKind];
  }

  await prisma.toilet.update({ where: { id }, data });
  await bumpVersion();
  return { status: "approved" };
}

/**
 * Moderates a "compléter ce spot" completion. On approval, each non-rejected field
 * merges into the toilet only if that field is still empty there (first-come,
 * first-served — the same guard the old auto-apply flow used, now enforced at
 * moderation time instead of submission time).
 */
export async function moderateCompletion(
  id: number,
  moderatorId: number,
  opts: PartialOpts
): Promise<{ status: "approved" | "rejected"; applied?: { name: boolean; address: boolean; comment: boolean; photos: number } } | null> {
  const completion = await prisma.completion.findUnique({
    where: { id },
    include: { photos: true },
  });
  if (!completion || completion.status !== "PENDING") return null;

  if (!opts.approveRest) {
    await prisma.completion.update({ where: { id }, data: { status: "REJECTED", reviewedAt: new Date(), reviewedById: moderatorId } });
    return { status: "rejected" };
  }

  const finalName = opts.rejectedFields.includes("name") ? null : (opts.edits.name ?? completion.name)?.trim() || null;
  const finalAddress = opts.rejectedFields.includes("address") ? null : (opts.edits.address ?? completion.address)?.trim() || null;
  const finalComment = opts.rejectedFields.includes("comment") ? null : (opts.edits.comment ?? completion.comment)?.trim() || null;
  const wantPhotos = completion.photos.length > 0 && !opts.rejectedFields.includes("photos");

  const applied = { name: false, address: false, comment: false, photos: 0 };

  if (finalName) {
    const r = await prisma.toilet.updateMany({ where: { id: completion.toiletId, name: null }, data: { name: finalName, nameSetById: completion.userId } });
    applied.name = r.count > 0;
  }
  if (finalAddress) {
    const r = await prisma.toilet.updateMany({ where: { id: completion.toiletId, address: null }, data: { address: finalAddress } });
    applied.address = r.count > 0;
  }
  if (finalComment) {
    const r = await prisma.toilet.updateMany({ where: { id: completion.toiletId, description: null }, data: { description: finalComment } });
    applied.comment = r.count > 0;
  }
  if (wantPhotos) {
    await prisma.$transaction(async (tx) => {
      const current = await tx.photo.count({ where: { toiletId: completion.toiletId } });
      if (current === 0) {
        await tx.photo.createMany({ data: completion.photos.map((p) => ({ toiletId: completion.toiletId, url: p.url, createdById: completion.userId })) });
        applied.photos = completion.photos.length;
      }
    });
  }

  await prisma.completion.update({ where: { id }, data: { status: "APPROVED", reviewedAt: new Date(), reviewedById: moderatorId } });
  await bumpVersion();
  return { status: "approved", applied };
}

/**
 * Publishes or rejects a review, keeping the toilet's denormalized reviewCount/
 * avgScore (used by the lean map sync) in sync with which reviews currently count.
 * `commentOverride` (including explicit `null`) lets a moderator strip a bad comment
 * while keeping the review itself published — the "reject one field" case.
 */
async function setReviewStatus(reviewId: number, status: "PUBLISHED" | "REJECTED", commentOverride: string | null | undefined) {
  const review = await prisma.review.findUnique({
    where: { id: reviewId },
    select: { toiletId: true, proprete: true, confort: true, experience: true, status: true },
  });
  if (!review) return false;

  const data: Record<string, unknown> = { status };
  if (commentOverride !== undefined) data.comment = commentOverride;

  if (review.status !== status) {
    const scoreDelta = (review.proprete + review.confort + review.experience) / 3;
    const toilet = await prisma.toilet.findUniqueOrThrow({ where: { id: review.toiletId }, select: { reviewCount: true, avgScore: true } });
    const goingLive = status === "PUBLISHED";
    const newCount = Math.max(0, toilet.reviewCount + (goingLive ? 1 : -1));
    const newAvg = newCount > 0 ? (toilet.avgScore * toilet.reviewCount + (goingLive ? scoreDelta : -scoreDelta)) / newCount : 0;
    await prisma.$transaction([
      prisma.review.update({ where: { id: reviewId }, data }),
      prisma.toilet.update({ where: { id: review.toiletId }, data: { reviewCount: newCount, avgScore: newAvg } }),
    ]);
  } else if (commentOverride !== undefined) {
    await prisma.review.update({ where: { id: reviewId }, data });
  }
  return true;
}

/** Moderates a review: `approveRest: false` rejects it, `true` (re-)publishes it. */
export async function moderateReview(id: number, opts: PartialOpts): Promise<{ status: "published" | "rejected" } | null> {
  const targetStatus = opts.approveRest ? "PUBLISHED" : "REJECTED";
  const commentOverride = opts.rejectedFields.includes("comment") ? null : opts.edits.comment !== undefined ? opts.edits.comment.trim().slice(0, 600) || null : undefined;

  const ok = await setReviewStatus(id, targetStatus, commentOverride);
  if (!ok) return null;
  return { status: targetStatus === "PUBLISHED" ? "published" : "rejected" };
}
