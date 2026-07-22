import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { moderateCompletion, moderateReview, moderateToilet } from "@/lib/moderation";
import { withApiErrorHandling } from "@/lib/api-error";

const TYPES = ["toilet", "review", "completion"] as const;
type SubmissionType = (typeof TYPES)[number];

/**
 * Granular moderation for any submission (a pending toilet, a review, or a
 * completion): reject the whole thing, approve it as-is, or approve it with
 * specific fields dropped/edited first — e.g. keep the photos and address a user
 * submitted but drop their comment, then approve the rest.
 */
export const PATCH = withApiErrorHandling(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const me = await requireRole(["moderator", "admin"]);
  if (!me) return NextResponse.json({ error: "Accès réservé aux modérateurs" }, { status: 403 });

  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Id invalide" }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const { type, approveRest } = body;
  const rejectedFields = Array.isArray(body.rejectedFields) ? body.rejectedFields.filter((f): f is string => typeof f === "string") : [];
  const edits = typeof body.edits === "object" && body.edits !== null ? (body.edits as Record<string, unknown>) : {};
  const cleanEdits: Record<string, string> = {};
  for (const [k, v] of Object.entries(edits)) if (typeof v === "string") cleanEdits[k] = v;

  if (!TYPES.includes(type as SubmissionType)) return NextResponse.json({ error: "Type de soumission invalide" }, { status: 400 });
  if (typeof approveRest !== "boolean") return NextResponse.json({ error: "approveRest doit être un booléen" }, { status: 400 });

  const opts = { rejectedFields, approveRest, edits: cleanEdits };
  const result =
    type === "toilet"
      ? await moderateToilet(id, opts)
      : type === "completion"
        ? await moderateCompletion(id, me.id, opts)
        : await moderateReview(id, opts);

  if (!result) return NextResponse.json({ error: "Introuvable ou déjà traité" }, { status: 404 });
  return NextResponse.json({ ok: true, ...result });
});
