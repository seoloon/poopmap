import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { withApiErrorHandling } from "@/lib/api-error";
import { isRateLimited } from "@/lib/rate-limit";
import type { ActivityKind, ProfileActivityToilet } from "@/lib/types";

const KIND_TO_CLIENT = { GRATUIT: "gratuit", PAYANT: "payant", COMMERCE: "commerce" } as const;
const STATUS_TO_CLIENT = { PENDING: "pending", APPROVED: "approved", REJECTED: "rejected", HIDDEN: "hidden", DELETED: "deleted" } as const;

export const GET = withApiErrorHandling(async () => {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Connecte-toi pour voir ton profil" }, { status: 401 });

  const [user, toiletsAdded, completions, reviews, addedRows, reviewRows, completionRows] = await Promise.all([
    prisma.user.findUnique({ where: { id: me.id }, select: { createdAt: true } }),
    prisma.toilet.count({ where: { createdById: me.id, status: { not: "DELETED" } } }),
    prisma.completion.count({ where: { userId: me.id } }),
    prisma.review.count({ where: { userId: me.id } }),
    prisma.toilet.findMany({
      where: { createdById: me.id, status: { not: "DELETED" } },
      select: { id: true, name: true, kind: true, status: true, createdAt: true },
    }),
    prisma.review.findMany({
      where: { userId: me.id, toilet: { status: { not: "DELETED" } } },
      select: { createdAt: true, toilet: { select: { id: true, name: true, kind: true, status: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.completion.findMany({
      where: { userId: me.id, toilet: { status: { not: "DELETED" } } },
      select: { createdAt: true, toilet: { select: { id: true, name: true, kind: true, status: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  if (!user) return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 });

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

  return NextResponse.json({
    pseudo: me.pseudo,
    username: me.username,
    createdAt: user.createdAt.toISOString(),
    toiletsAdded,
    completions,
    reviews,
    activity,
  });
});

/**
 * Changes the user's public display name. Propagates retroactively to the
 * denormalized copies on their past contributions (`Toilet.createdByPseudo`,
 * `Review.pseudo`) — those are stored separately from `User.pseudo` for
 * cheap reads elsewhere, so they'd otherwise keep showing the old name.
 */
export const PATCH = withApiErrorHandling(async (req: NextRequest) => {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Connecte-toi pour modifier ton profil" }, { status: 401 });
  if (isRateLimited(`profile-pseudo:${me.id}`, 10)) {
    return NextResponse.json({ error: "Doucement — réessaie dans quelques minutes" }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });

  const { pseudo } = body as Record<string, unknown>;
  if (typeof pseudo !== "string" || pseudo.trim().length < 2 || pseudo.trim().length > 24) {
    return NextResponse.json({ error: "Le pseudo doit faire entre 2 et 24 caractères" }, { status: 400 });
  }
  const trimmed = pseudo.trim();

  await prisma.$transaction([
    prisma.user.update({ where: { id: me.id }, data: { pseudo: trimmed } }),
    prisma.toilet.updateMany({ where: { createdById: me.id }, data: { createdByPseudo: trimmed } }),
    prisma.review.updateMany({ where: { userId: me.id }, data: { pseudo: trimmed } }),
  ]);

  return NextResponse.json({ pseudo: trimmed });
});
