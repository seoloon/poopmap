import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, requireRole } from "@/lib/auth";
import { bumpVersion, listModeratable, listPendingToilets } from "@/lib/toilets";
import { listCompletionsForAdmin, listReviewsForAdmin } from "@/lib/moderation";
import { notifyModeration } from "@/lib/notifications";
import { withApiErrorHandling } from "@/lib/api-error";
import type { Role } from "@/lib/types";

const DB_ROLE: Record<Role, "USER" | "MODERATOR" | "ADMIN"> = { user: "USER", moderator: "MODERATOR", admin: "ADMIN" };

// Allow-list, not a deny-list: content moderation (toilets/photos/names) is open to
// moderators, but every action that touches an account — including resetpw, which
// hands whoever calls it a working password for the target account — is admin-only.
// A deny-list here is one missed case away from a moderator resetting an admin's
// password and logging in as them.
const MODERATOR_ACTIONS = new Set(["approve", "reject", "deletephoto", "resetname"]);
const ADMIN_ACTIONS = new Set([...MODERATOR_ACTIONS, "ban", "unban", "deleteuser", "resetpw", "setrole"]);

export const GET = withApiErrorHandling(async () => {
  const me = await requireRole(["moderator", "admin"]);
  if (!me) return NextResponse.json({ error: "Accès réservé aux modérateurs" }, { status: 403 });

  const [pending, moderation, reviews, completions, users, approved, rejected, userCount, reviewCount] = await Promise.all([
    listPendingToilets(),
    listModeratable(),
    listReviewsForAdmin(),
    listCompletionsForAdmin(),
    prisma.user.findMany({
      orderBy: { id: "asc" },
      include: { _count: { select: { reviews: true } } },
    }),
    prisma.toilet.count({ where: { status: "APPROVED" } }),
    prisma.toilet.count({ where: { status: "REJECTED" } }),
    prisma.user.count(),
    prisma.review.count({ where: { status: "PUBLISHED" } }),
  ]);

  return NextResponse.json({
    pending,
    moderation,
    reviews,
    completions,
    users: users.map((u) => ({
      id: u.id,
      pseudo: u.pseudo,
      username: u.username,
      role: u.role === "ADMIN" ? "admin" : u.role === "MODERATOR" ? "moderator" : "user",
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
      completions: completions.filter((c) => c.status === "pending").length,
    },
    me,
  });
});

export const POST = withApiErrorHandling(async (req: NextRequest) => {
  const me = await requireRole(["moderator", "admin"]);
  if (!me) return NextResponse.json({ error: "Accès réservé aux modérateurs" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const { action, id } = body;
  const targetId = Number(id);
  if (!Number.isInteger(targetId)) return NextResponse.json({ error: "Id invalide" }, { status: 400 });

  const allowed = me.role === "admin" ? ADMIN_ACTIONS : MODERATOR_ACTIONS;
  if (typeof action !== "string" || !allowed.has(action)) {
    return NextResponse.json({ error: "Action non autorisée" }, { status: 403 });
  }

  switch (action) {
    case "approve": {
      const t = await prisma.toilet.update({ where: { id: targetId }, data: { status: "APPROVED" }, select: { createdById: true } });
      await bumpVersion();
      await notifyModeration(t.createdById, "toilet", targetId, "approved");
      return NextResponse.json({ ok: true });
    }
    case "reject": {
      const t = await prisma.toilet.update({ where: { id: targetId }, data: { status: "REJECTED" }, select: { createdById: true } });
      await bumpVersion();
      await notifyModeration(t.createdById, "toilet", targetId, "rejected");
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
    case "setrole": {
      const { role } = body;
      if (typeof role !== "string" || !(role in DB_ROLE)) {
        return NextResponse.json({ error: "Rôle invalide" }, { status: 400 });
      }
      if (targetId === me.id && role !== "admin") {
        return NextResponse.json({ error: "Impossible de te retirer tes propres droits admin" }, { status: 400 });
      }
      await prisma.user.update({ where: { id: targetId }, data: { role: DB_ROLE[role as Role] } });
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
