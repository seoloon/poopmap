import { NextRequest, NextResponse } from "next/server";
import { getUserProfileCore } from "@/lib/profile";
import { withApiErrorHandling } from "@/lib/api-error";

/**
 * Public read-only profile — used when clicking a pseudo (in a review, "référencé
 * par", or the admin panel) to see who's behind it. Shares its data with
 * `/api/profile` but deliberately excludes the private login `username`.
 */
export const GET = withApiErrorHandling(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const userId = Number((await params).id);
  if (!Number.isInteger(userId)) return NextResponse.json({ error: "Id invalide" }, { status: 400 });

  const core = await getUserProfileCore(userId);
  if (!core) return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 });

  return NextResponse.json({ id: userId, ...core });
});
