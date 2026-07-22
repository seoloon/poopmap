import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import type { AdminModeratableToilet, ToiletDetail, ToiletPin } from "./types";

const KIND_TO_CLIENT = { GRATUIT: "gratuit", PAYANT: "payant", COMMERCE: "commerce" } as const;
const STATUS_TO_CLIENT = { PENDING: "pending", APPROVED: "approved", REJECTED: "rejected", HIDDEN: "hidden", DELETED: "deleted" } as const;

export const KIND_TO_DB = { gratuit: "GRATUIT", payant: "PAYANT", commerce: "COMMERCE" } as const;

/** Global data version — bumped on every mutation visible on the map. */
export async function getVersion(): Promise<number> {
  const row = await prisma.meta.findUnique({ where: { key: "version" } });
  return row?.value ?? 0;
}

export async function bumpVersion() {
  await prisma.meta.upsert({
    where: { key: "version" },
    update: { value: { increment: 1 } },
    create: { key: "version", value: 1 },
  });
}

const PIN_SELECT = {
  id: true,
  lat: true,
  lng: true,
  kind: true,
  status: true,
  createdById: true,
  reviewCount: true,
  avgScore: true,
} satisfies Prisma.ToiletSelect;

type PinRow = Prisma.ToiletGetPayload<{ select: typeof PIN_SELECT }>;

/**
 * ~11cm at French latitudes — far tighter than GPS/OSM placement accuracy and
 * imperceptible at any zoom the map allows, but trims the long float tails
 * (`43.5363875...`) that bloat the bulk sync's JSON *and* compress worse than the
 * repetitive short decimals rounding produces. Detail lookups (`mapDetail`) keep
 * full precision — this only applies to the lean pin list fetched at OSM scale.
 */
const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

function mapPin(t: PinRow, meId: number | null): ToiletPin {
  return {
    id: t.id,
    lat: round6(t.lat),
    lng: round6(t.lng),
    kind: KIND_TO_CLIENT[t.kind],
    status: STATUS_TO_CLIENT[t.status],
    // Only ever displayed rounded to 1-2 decimals client-side — trimming the
    // repeating-decimal tail from the averaging division here is free.
    score: Math.round(t.avgScore * 100) / 100,
    reviewCount: t.reviewCount,
    mine: meId !== null && t.createdById === meId && t.status === "PENDING",
  };
}

/**
 * Toilets visible to `meId` (or anonymous when null): approved spots for everyone,
 * plus a user's own pending spots so they can track their submission.
 *
 * Deliberately lean: this is the payload every client fetches on load and on every
 * version bump, and at OSM-seeded scale (tens of thousands of rows) that's the
 * difference between a multi-MB response and a few hundred KB. Anything not needed
 * to draw/filter a pin belongs in `getToiletDetail` instead, fetched per-toilet.
 */
export async function listToilets(meId: number | null): Promise<ToiletPin[]> {
  const rows = await prisma.toilet.findMany({
    where: meId
      ? { OR: [{ status: "APPROVED" }, { status: "PENDING", createdById: meId }] }
      : { status: "APPROVED" },
    select: PIN_SELECT,
    orderBy: { id: "asc" },
  });
  return rows.map((t) => mapPin(t, meId));
}

const DETAIL_INCLUDE = {
  reviews: { select: { proprete: true, confort: true, experience: true } },
  photos: { select: { id: true, url: true }, orderBy: { id: "asc" as const } },
} satisfies Prisma.ToiletInclude;

type DetailRow = Prisma.ToiletGetPayload<{ include: typeof DETAIL_INCLUDE }>;

function mapDetail(t: DetailRow, meId: number | null, myCompletionStatus?: ToiletDetail["myCompletionStatus"]): ToiletDetail {
  const n = t.reviews.length;
  const avgP = n ? t.reviews.reduce((s, r) => s + r.proprete, 0) / n : 0;
  const avgC = n ? t.reviews.reduce((s, r) => s + r.confort, 0) / n : 0;
  const avgE = n ? t.reviews.reduce((s, r) => s + r.experience, 0) / n : 0;
  return {
    id: t.id,
    name: t.name,
    lat: t.lat,
    lng: t.lng,
    address: t.address,
    kind: KIND_TO_CLIENT[t.kind],
    price: t.price,
    description: t.description,
    status: STATUS_TO_CLIENT[t.status],
    createdById: t.createdById,
    createdByPseudo: t.createdByPseudo,
    createdAt: t.createdAt.toISOString(),
    avgP,
    avgC,
    avgE,
    score: t.avgScore,
    reviewCount: t.reviewCount,
    photos: t.photos.map((p) => ({ id: p.id, url: p.url })),
    mine: meId !== null && t.createdById === meId && t.status === "PENDING",
    ...(myCompletionStatus ? { myCompletionStatus } : {}),
  };
}

const COMPLETION_STATUS_TO_CLIENT = { PENDING: "pending", APPROVED: "approved", REJECTED: "rejected" } as const;

/**
 * Full detail for a single toilet, fetched when its detail panel opens. When `meId`
 * has an in-flight or past "compléter ce spot" submission on this toilet, its
 * status rides along so the UI can show "en attente de validation" / "refusée"
 * instead of the completion form re-appearing as if nothing was submitted.
 */
export async function getToiletDetail(id: number, meId: number | null): Promise<ToiletDetail | null> {
  const [row, myCompletion] = await Promise.all([
    prisma.toilet.findUnique({ where: { id }, include: DETAIL_INCLUDE }),
    meId !== null
      ? prisma.completion.findFirst({ where: { toiletId: id, userId: meId }, orderBy: { createdAt: "desc" }, select: { status: true } })
      : null,
  ]);
  if (!row) return null;
  return mapDetail(row, meId, myCompletion ? COMPLETION_STATUS_TO_CLIENT[myCompletion.status] : undefined);
}

/** All pending toilets, for the admin verification queue (small list — full detail is fine). */
export async function listPendingToilets(): Promise<ToiletDetail[]> {
  const rows = await prisma.toilet.findMany({
    where: { status: "PENDING" },
    include: DETAIL_INCLUDE,
    orderBy: { id: "asc" },
  });
  return rows.map((t) => mapDetail(t, null));
}

const MODERATABLE_INCLUDE = {
  photos: { select: { id: true, url: true }, orderBy: { id: "asc" as const } },
} satisfies Prisma.ToiletInclude;

/**
 * Toilets carrying a published photo and/or a user-supplied name (`nameSetById`) —
 * reviews are moderated separately (flat list, see `listReviewsForAdmin` in
 * `moderation.ts`); this stays deliberately narrow so an admin can still delete a
 * stray photo or reset a name after the fact, without re-litigating everything that
 * already went through the toilet/completion queues.
 */
export async function listModeratable(): Promise<AdminModeratableToilet[]> {
  const rows = await prisma.toilet.findMany({
    where: { status: { notIn: ["HIDDEN", "DELETED"] }, OR: [{ photos: { some: {} } }, { nameSetById: { not: null } }] },
    include: MODERATABLE_INCLUDE,
    orderBy: { id: "desc" },
    take: 200,
  });
  return rows.map((t) => ({
    id: t.id,
    name: t.name,
    nameSetById: t.nameSetById,
    kind: KIND_TO_CLIENT[t.kind],
    address: t.address,
    photos: t.photos.map((p) => ({ id: p.id, url: p.url })),
  }));
}
