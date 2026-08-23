import { prisma } from "./prisma";

/** Points awarded per validated contribution — see the leaderboard design doc. */
export const POINTS_PER_REVIEW = 50;
export const POINTS_PER_COMPLETION = 100;
export const POINTS_PER_TOILET = 200;

export type LeaderboardEntry = {
  userId: number;
  pseudo: string;
  points: number;
  toiletsAdded: number;
  completions: number;
  reviews: number;
};

const TOP_N = 100;

/**
 * Ranks users by points: reviews count as soon as posted (moderation there is
 * opt-out — only a later REJECTED drops them), while completions and toilets only
 * count once explicitly APPROVED (moderation there is mandatory up front).
 */
export async function getLeaderboard(): Promise<LeaderboardEntry[]> {
  const [toiletGroups, completionGroups, reviewGroups] = await Promise.all([
    prisma.toilet.groupBy({
      by: ["createdById"],
      where: { createdById: { not: null }, status: "APPROVED" },
      _count: { _all: true },
    }),
    prisma.completion.groupBy({
      by: ["userId"],
      where: { status: "APPROVED" },
      _count: { _all: true },
    }),
    prisma.review.groupBy({
      by: ["userId"],
      where: { userId: { not: null }, status: { not: "REJECTED" } },
      _count: { _all: true },
    }),
  ]);

  const byUser = new Map<number, { toiletsAdded: number; completions: number; reviews: number }>();
  const bump = (userId: number | null, field: "toiletsAdded" | "completions" | "reviews", count: number) => {
    if (userId === null) return;
    const existing = byUser.get(userId) ?? { toiletsAdded: 0, completions: 0, reviews: 0 };
    existing[field] += count;
    byUser.set(userId, existing);
  };

  for (const g of toiletGroups) bump(g.createdById, "toiletsAdded", g._count._all);
  for (const g of completionGroups) bump(g.userId, "completions", g._count._all);
  for (const g of reviewGroups) bump(g.userId, "reviews", g._count._all);

  const userIds = [...byUser.keys()];
  if (userIds.length === 0) return [];

  const users = await prisma.user.findMany({
    where: { id: { in: userIds }, status: "ACTIVE" },
    select: { id: true, pseudo: true },
  });

  const entries: LeaderboardEntry[] = users.map((u) => {
    const stats = byUser.get(u.id)!;
    return {
      userId: u.id,
      pseudo: u.pseudo,
      points: stats.toiletsAdded * POINTS_PER_TOILET + stats.completions * POINTS_PER_COMPLETION + stats.reviews * POINTS_PER_REVIEW,
      ...stats,
    };
  });

  entries.sort((a, b) => b.points - a.points || a.userId - b.userId);
  return entries.filter((e) => e.points > 0).slice(0, TOP_N);
}
