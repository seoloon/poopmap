import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, hashPassword } from "@/lib/auth";
import { bumpVersion, listModeratable, listPendingToilets } from "@/lib/toilets";
import { withApiErrorHandling } from "@/lib/api-error";

async function requireAdmin() {
  const me = await getSessionUser();
  if (!me || me.role !== "admin") return null;
  return me;
}

export const GET = withApiErrorHandling(async () => {
  const me = await requireAdmin();
  if (!me) return NextResponse.json({ error: "Accès réservé aux admins" }, { status: 403 });

  const [pending, moderation, users, approved, rejected, userCount, reviewCount] = await Promise.all([
    listPendingToilets(),
    listModeratable(),
    prisma.user.findMany({
      orderBy: { id: "asc" },
      include: { _count: { select: { reviews: true } } },
    }),
    prisma.toilet.count({ where: { status: "APPROVED" } }),
    prisma.toilet.count({ where: { status: "REJECTED" } }),
    prisma.user.count(),
    prisma.review.count(),
  ]);

  return NextResponse.json({
    pending,
    moderation,
    users: users.map((u) => ({
      id: u.id,
      pseudo: u.pseudo,
      username: u.username,
      role: u.role.toLowerCase(),
      status: u.status.toLowerCase(),
      createdAt: u.createdAt.toISOString(),
      reviewCount: u._count.reviews,
    })),
    stats: {
      pending: pending.length,
      approved,
      rejected,
      users: userCount,
      reviews: reviewCount,
    },
  });
});

export const POST = withApiErrorHandling(async (req: NextRequest) => {
  const me = await requireAdmin();
  if (!me) return NextResponse.json({ error: "Accès réservé aux admins" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const { action, id } = body;
  const targetId = Number(id);
  if (!Number.isInteger(targetId)) return NextResponse.json({ error: "Id invalide" }, { status: 400 });

  switch (action) {
    case "approve": {
      await prisma.toilet.update({ where: { id: targetId }, data: { status: "APPROVED" } });
      await bumpVersion();
      return NextResponse.json({ ok: true });
    }
    case "reject": {
      await prisma.toilet.update({ where: { id: targetId }, data: { status: "REJECTED" } });
      await bumpVersion();
      return NextResponse.json({ ok: true });
    }
    case "ban": {
      await prisma.user.update({ where: { id: targetId }, data: { status: "BANNED" } });
      return NextResponse.json({ ok: true });
    }
    case "unban": {
      await prisma.user.update({ where: { id: targetId }, data: { status: "ACTIVE" } });
      return NextResponse.json({ ok: true });
    }
    case "deleteuser": {
      if (targetId === me.id) return NextResponse.json({ error: "Impossible de supprimer ton propre compte" }, { status: 400 });
      await prisma.user.delete({ where: { id: targetId } });
      return NextResponse.json({ ok: true });
    }
    case "resetpw": {
      const { password } = body;
      if (typeof password !== "string" || password.length < 8) {
        return NextResponse.json({ error: "Mot de passe trop court (8 caractères min)" }, { status: 400 });
      }
      const passwordHash = await hashPassword(password);
      // Also kill existing sessions: otherwise a session stolen before the reset
      // (e.g. a compromised account) would keep working right through it.
      await prisma.$transaction([
        prisma.user.update({ where: { id: targetId }, data: { passwordHash } }),
        prisma.session.deleteMany({ where: { userId: targetId } }),
      ]);
      return NextResponse.json({ ok: true });
    }
    case "deletereview": {
      const review = await prisma.review.findUnique({
        where: { id: targetId },
        select: { toiletId: true, proprete: true, confort: true, experience: true },
      });
      if (!review) return NextResponse.json({ error: "Avis introuvable" }, { status: 404 });

      const toilet = await prisma.toilet.findUniqueOrThrow({
        where: { id: review.toiletId },
        select: { reviewCount: true, avgScore: true },
      });
      const removedScore = (review.proprete + review.confort + review.experience) / 3;
      const newCount = Math.max(0, toilet.reviewCount - 1);
      const newAvg = newCount > 0 ? (toilet.avgScore * toilet.reviewCount - removedScore) / newCount : 0;

      // Keeps the denormalized reviewCount/avgScore (used by the lean map sync) in
      // sync with the reviews table, same as posting a review does.
      await prisma.$transaction([
        prisma.review.delete({ where: { id: targetId } }),
        prisma.toilet.update({ where: { id: review.toiletId }, data: { reviewCount: newCount, avgScore: newAvg } }),
      ]);
      await bumpVersion();
      return NextResponse.json({ ok: true });
    }
    case "deletephoto": {
      const photo = await prisma.photo.findUnique({ where: { id: targetId }, select: { id: true } });
      if (!photo) return NextResponse.json({ error: "Photo introuvable" }, { status: 404 });
      await prisma.photo.delete({ where: { id: targetId } });
      return NextResponse.json({ ok: true });
    }
    case "resetname": {
      // Clears a user-supplied name back to null, reopening the toilet for a fresh
      // "first come, first served" naming. Only meaningful for toilets whose name was
      // set this way (nameSetById) — original OSM tags or user-submitted toilets never
      // go through this action.
      await prisma.toilet.update({ where: { id: targetId }, data: { name: null, nameSetById: null } });
      return NextResponse.json({ ok: true });
    }
    default:
      return NextResponse.json({ error: "Action inconnue" }, { status: 400 });
  }
});
