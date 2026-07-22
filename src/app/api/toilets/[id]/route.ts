import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getToiletDetail } from "@/lib/toilets";
import { withApiErrorHandling } from "@/lib/api-error";

/** Full detail for one toilet — fetched on demand when its detail panel opens. */
export const GET = withApiErrorHandling(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const toiletId = Number((await params).id);
  if (!Number.isInteger(toiletId)) return NextResponse.json({ error: "Id invalide" }, { status: 400 });

  const me = await getSessionUser();
  const toilet = await getToiletDetail(toiletId, me?.id ?? null);
  if (!toilet) return NextResponse.json({ error: "Ce spot n'existe pas" }, { status: 404 });
  if (toilet.status !== "approved" && !toilet.mine && me?.role !== "admin" && me?.role !== "moderator") {
    return NextResponse.json({ error: "Ce spot n'existe pas" }, { status: 404 });
  }

  return NextResponse.json({ toilet });
});
