import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { getUserProfileCore } from "@/lib/profile";
import { withApiErrorHandling } from "@/lib/api-error";
import { isRateLimited } from "@/lib/rate-limit";

export const GET = withApiErrorHandling(async () => {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Connecte-toi pour voir ton profil" }, { status: 401 });

  const core = await getUserProfileCore(me.id);
  if (!core) return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 });

  return NextResponse.json({ ...core, username: me.username });
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
