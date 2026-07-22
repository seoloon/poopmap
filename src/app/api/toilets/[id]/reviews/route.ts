import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { bumpVersion } from "@/lib/toilets";
import { withApiErrorHandling } from "@/lib/api-error";

function scoreOf(n: number) {
  return Math.min(5, Math.max(1, Math.round(n)));
}

export const GET = withApiErrorHandling(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const toiletId = Number((await params).id);
  if (!Number.isInteger(toiletId)) return NextResponse.json({ error: "Id invalide" }, { status: 400 });

  const me = await getSessionUser();
  const rows = await prisma.review.findMany({
    where: { toiletId, status: "PUBLISHED" },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  return NextResponse.json({
    reviews: rows.map((r) => ({
      id: r.id,
      pseudo: r.pseudo,
      proprete: r.proprete,
      confort: r.confort,
      experience: r.experience,
      comment: r.comment,
      createdAt: r.createdAt.toISOString(),
      mine: me !== null && r.userId === me.id,
    })),
  });
});

/** Posting a review requires an account — enforced here, not just hidden in the UI. */
export const POST = withApiErrorHandling(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const toiletId = Number((await params).id);
  if (!Number.isInteger(toiletId)) return NextResponse.json({ error: "Id invalide" }, { status: 400 });

  const toilet = await prisma.toilet.findUnique({
    where: { id: toiletId },
    select: { id: true, reviewCount: true, avgScore: true },
  });
  if (!toilet) return NextResponse.json({ error: "Ce spot n'existe pas" }, { status: 404 });

  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Connecte-toi pour laisser un avis" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });

  const { proprete, confort, experience, comment } = body as Record<string, unknown>;
  if (![proprete, confort, experience].every((v) => typeof v === "number" && v >= 1 && v <= 5)) {
    return NextResponse.json({ error: "Les 3 critères doivent être notés de 1 à 5" }, { status: 400 });
  }

  const p = scoreOf(proprete as number);
  const c = scoreOf(confort as number);
  const e = scoreOf(experience as number);
  const newScore = (p + c + e) / 3;
  const newCount = toilet.reviewCount + 1;
  const newAvg = (toilet.avgScore * toilet.reviewCount + newScore) / newCount;

  // Keeps the denormalized reviewCount/avgScore (used by the lean map sync) in sync
  // with the reviews table in the same transaction as the write.
  await prisma.$transaction([
    prisma.review.create({
      data: {
        toiletId,
        userId: me.id,
        pseudo: me.pseudo,
        proprete: p,
        confort: c,
        experience: e,
        comment: typeof comment === "string" && comment.trim() ? comment.trim().slice(0, 600) : null,
      },
    }),
    prisma.toilet.update({ where: { id: toiletId }, data: { reviewCount: newCount, avgScore: newAvg } }),
  ]);

  await bumpVersion();
  return NextResponse.json({ ok: true }, { status: 201 });
});
