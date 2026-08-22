import { prisma } from "./prisma";
import type { ActivityKind, ProfileActivityToilet } from "./types";

const KIND_TO_CLIENT = { GRATUIT: "gratuit", PAYANT: "payant", COMMERCE: "commerce" } as const;
const STATUS_TO_CLIENT = { PENDING: "pending", APPROVED: "approved", REJECTED: "rejected", HIDDEN: "hidden", DELETED: "deleted" } as const;

export type UserProfileCore = {
  pseudo: string;
  createdAt: string;
  toiletsAdded: number;
  completions: number;
  reviews: number;
  activity: ProfileActivityToilet[];
};

/**
 * Shared by `/api/profile` ("my profile") and `/api/users/[id]` (viewing someone
 * else's) — merges a user's three activity sources (added/reviewed/completed) into
 * one row per toilet. Returns null if the user doesn't exist.
 */
export async function getUserProfileCore(userId: number): Promise<UserProfileCore | null> {
  const [user, toiletsAdded, completions, reviews, addedRows, reviewRows, completionRows] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { pseudo: true, createdAt: true } }),
    prisma.toilet.count({ where: { createdById: userId, status: { not: "DELETED" } } }),
    prisma.completion.count({ where: { userId } }),
    prisma.review.count({ where: { userId } }),
    prisma.toilet.findMany({
      where: { createdById: userId, status: { not: "DELETED" } },
      select: { id: true, name: true, kind: true, status: true, createdAt: true },
    }),
    prisma.review.findMany({
      where: { userId, toilet: { status: { not: "DELETED" } } },
      select: { createdAt: true, toilet: { select: { id: true, name: true, kind: true, status: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.completion.findMany({
      where: { userId, toilet: { status: { not: "DELETED" } } },
      select: { createdAt: true, toilet: { select: { id: true, name: true, kind: true, status: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  if (!user) return null;

  // Merge the three activity sources into one row per toilet, keeping every activity
  // kind that applies and the most recent timestamp across them.
  const byToilet = new Map<number, ProfileActivityToilet>();
  const touch = (
    toilet: { id: number; name: string | null; kind: keyof typeof KIND_TO_CLIENT; status: keyof typeof STATUS_TO_CLIENT },
    at: Date,
    kind: ActivityKind
  ) => {
    const iso = at.toISOString();
    const existing = byToilet.get(toilet.id);
    if (existing) {
      if (!existing.activity.includes(kind)) existing.activity.push(kind);
      if (iso > existing.lastActivityAt) existing.lastActivityAt = iso;
    } else {
      byToilet.set(toilet.id, {
        id: toilet.id,
        name: toilet.name,
        kind: KIND_TO_CLIENT[toilet.kind],
        status: STATUS_TO_CLIENT[toilet.status],
        activity: [kind],
        lastActivityAt: iso,
      });
    }
  };

  for (const t of addedRows) touch(t, t.createdAt, "added");
  for (const r of reviewRows) touch(r.toilet, r.createdAt, "review");
  for (const c of completionRows) touch(c.toilet, c.createdAt, "completion");

  const activity = [...byToilet.values()].sort((a, b) => (a.lastActivityAt < b.lastActivityAt ? 1 : -1));

  return {
    pseudo: user.pseudo,
    createdAt: user.createdAt.toISOString(),
    toiletsAdded,
    completions,
    reviews,
    activity,
  };
}
