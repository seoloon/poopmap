import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { deleteToilet } from "@/lib/reports";
import { withApiErrorHandling } from "@/lib/api-error";

/** Standalone moderator/admin toilet deletion (soft), independent of the report flow. */
export const DELETE = withApiErrorHandling(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const me = await requireRole(["moderator", "admin"]);
  if (!me) return NextResponse.json({ error: "Accès réservé aux modérateurs" }, { status: 403 });

  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Id invalide" }, { status: 400 });

  const result = await deleteToilet(id, me.id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json({ ok: true });
});
