import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { listReportsForAdmin, resolveReports } from "@/lib/reports";
import { withApiErrorHandling } from "@/lib/api-error";

export const GET = withApiErrorHandling(async () => {
  const me = await requireRole(["moderator", "admin"]);
  if (!me) return NextResponse.json({ error: "Accès réservé aux modérateurs" }, { status: 403 });

  const groups = await listReportsForAdmin();
  return NextResponse.json({ groups });
});

const RESOLUTIONS = new Set(["delete", "hide", "keep"]);

/**
 * Resolves every pending report on one toilet at once (they stack). Content
 * moderation, same as the rest of this route family — open to moderators, not
 * admin-only.
 */
export const PATCH = withApiErrorHandling(async (req: NextRequest) => {
  const me = await requireRole(["moderator", "admin"]);
  if (!me) return NextResponse.json({ error: "Accès réservé aux modérateurs" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const { toiletId, decision, resolution, modComment } = body;

  const id = Number(toiletId);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Id invalide" }, { status: 400 });
  if (decision !== "approve" && decision !== "reject") return NextResponse.json({ error: "Décision invalide" }, { status: 400 });
  if (decision === "approve" && (typeof resolution !== "string" || !RESOLUTIONS.has(resolution))) {
    return NextResponse.json({ error: "Résolution invalide" }, { status: 400 });
  }

  const comment = typeof modComment === "string" && modComment.trim() ? modComment.trim().slice(0, 300) : null;
  const result = await resolveReports(id, me.id, {
    decision,
    resolution: decision === "approve" ? (resolution as "delete" | "hide" | "keep") : undefined,
    modComment: comment,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json({ ok: true });
});
