import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { createReport } from "@/lib/reports";
import { payloadTooLarge, withApiErrorHandling } from "@/lib/api-error";
import { isRateLimited } from "@/lib/rate-limit";
import { REPORT_CATEGORIES } from "@/lib/types";
import type { ReportCategory } from "@/lib/types";

const VALID_CATEGORIES = new Set(REPORT_CATEGORIES.map((c) => c.value));

/** Files a report against an approved toilet. Registered users only. */
export const POST = withApiErrorHandling(async (req: NextRequest) => {
  const tooBig = payloadTooLarge(req, 16_384);
  if (tooBig) return tooBig;

  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Connecte-toi pour signaler ce spot" }, { status: 401 });
  if (isRateLimited(`report:${me.id}`, 5)) {
    return NextResponse.json({ error: "Doucement — trop de signalements d'un coup, réessaie dans quelques minutes" }, { status: 429 });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const { toiletId, category, description } = body;

  const id = Number(toiletId);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Id invalide" }, { status: 400 });
  if (typeof category !== "string" || !VALID_CATEGORIES.has(category as ReportCategory)) {
    return NextResponse.json({ error: "Catégorie invalide" }, { status: 400 });
  }

  // "Autre" is too vague to act on without a detail — required there, optional everywhere else.
  const desc = typeof description === "string" ? description.trim() : "";
  if (category === "other" && desc.length < 3) {
    return NextResponse.json({ error: "Précise un peu la raison (3 caractères min)" }, { status: 400 });
  }

  const result = await createReport(me.id, id, category as ReportCategory, desc.length > 0 ? desc.slice(0, 600) : null);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json({ ok: true, id: result.id }, { status: 201 });
});
