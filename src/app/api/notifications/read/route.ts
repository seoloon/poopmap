import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { payloadTooLarge, withApiErrorHandling } from "@/lib/api-error";

/**
 * Marks one notification (`{ id }`) or all of them (`{ all: true }`) as read.
 * Scoped to `userId: me.id` in the query itself — not just checked beforehand — so
 * there's no window where passing someone else's notification id touches their row.
 */
export const PATCH = withApiErrorHandling(async (req: NextRequest) => {
  const tooBig = payloadTooLarge(req, 4_096);
  if (tooBig) return tooBig;

  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Connecte-toi pour gérer tes notifications" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  if (body.all === true) {
    await prisma.notification.updateMany({ where: { userId: me.id, read: false }, data: { read: true } });
    return NextResponse.json({ ok: true });
  }

  const id = Number(body.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Id invalide" }, { status: 400 });

  await prisma.notification.updateMany({ where: { id, userId: me.id }, data: { read: true } });
  return NextResponse.json({ ok: true });
});
