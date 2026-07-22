import { prisma } from "./prisma";
import { bumpVersion } from "./toilets";
import { notifyModeration, notifyToiletRemoved } from "./notifications";
import type { AdminReportGroup, ReportCategory } from "./types";

const CATEGORY_TO_DB = {
  closed: "CLOSED",
  not_existing: "NOT_EXISTING",
  wrong_info: "WRONG_INFO",
  inappropriate: "INAPPROPRIATE",
  unsafe: "UNSAFE",
  other: "OTHER",
} as const;
const CATEGORY_TO_CLIENT = {
  CLOSED: "closed",
  NOT_EXISTING: "not_existing",
  WRONG_INFO: "wrong_info",
  INAPPROPRIATE: "inappropriate",
  UNSAFE: "unsafe",
  OTHER: "other",
} as const;
const STATUS_TO_CLIENT = { PENDING: "pending", APPROVED: "approved", REJECTED: "rejected", HIDDEN: "hidden", DELETED: "deleted" } as const;

type CreateReportResult = { ok: true; id: number } | { ok: false; error: string; status: number };

/**
 * Files a report against an approved toilet. Registered users only (checked by the
 * caller). One PENDING report per user per toilet at a time — mirrors the
 * "one pending completion per toilet" guard used elsewhere, and is the "rate limit"
 * the spec asks for: it's spam-shaped abuse (the same user re-reporting) this blocks,
 * not a request-count throttle.
 */
export async function createReport(userId: number, toiletId: number, category: ReportCategory, description: string | null): Promise<CreateReportResult> {
  const toilet = await prisma.toilet.findUnique({ where: { id: toiletId }, select: { status: true } });
  if (!toilet || toilet.status !== "APPROVED") return { ok: false, error: "Ce spot n'existe pas", status: 404 };

  const existing = await prisma.report.findFirst({ where: { toiletId, userId, status: "PENDING" } });
  if (existing) return { ok: false, error: "Tu as déjà signalé ce spot — en attente de traitement", status: 409 };

  const report = await prisma.report.create({
    data: { toiletId, userId, category: CATEGORY_TO_DB[category], description },
  });
  return { ok: true, id: report.id };
}

/** Pending reports, grouped by toilet ("stacked") — the "Signalements" tab's data source. */
export async function listReportsForAdmin(): Promise<AdminReportGroup[]> {
  const rows = await prisma.report.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    include: { user: { select: { pseudo: true } }, toilet: { select: { id: true, name: true, status: true } } },
  });

  const groups = new Map<number, AdminReportGroup>();
  for (const r of rows) {
    let group = groups.get(r.toiletId);
    if (!group) {
      group = { toiletId: r.toiletId, toiletName: r.toilet.name, toiletStatus: STATUS_TO_CLIENT[r.toilet.status], reports: [] };
      groups.set(r.toiletId, group);
    }
    group.reports.push({
      id: r.id,
      userPseudo: r.user.pseudo,
      category: CATEGORY_TO_CLIENT[r.category],
      description: r.description,
      createdAt: r.createdAt.toISOString(),
    });
  }
  return [...groups.values()];
}

export function pendingReportCount(): Promise<number> {
  return prisma.report.count({ where: { status: "PENDING" } });
}

type ResolveOpts = { decision: "approve" | "reject"; resolution?: "delete" | "hide" | "keep"; modComment: string | null };

/**
 * Resolves every PENDING report on one toilet at once (they stack — see the `Report`
 * model's doc comment) with a single decision, instead of one at a time: it'd be
 * incoherent to delete a toilet for report A while report B on the same toilet is
 * left dangling in the queue. Notifies every distinct reporter, plus the toilet's
 * author when the outcome actually touches their toilet (delete/hide).
 */
export async function resolveReports(toiletId: number, moderatorId: number, opts: ResolveOpts): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const pending = await prisma.report.findMany({ where: { toiletId, status: "PENDING" } });
  if (pending.length === 0) return { ok: false, error: "Aucun signalement en attente pour ce spot", status: 404 };

  const reportStatus = opts.decision === "approve" ? "APPROVED" : "REJECTED";
  const action = opts.decision === "reject" ? "NONE" : opts.resolution === "delete" ? "TOILET_DELETED" : opts.resolution === "hide" ? "TOILET_HIDDEN" : "NONE";

  await prisma.report.updateMany({
    where: { id: { in: pending.map((r) => r.id) } },
    data: { status: reportStatus, action, modComment: opts.modComment, resolvedById: moderatorId, resolvedAt: new Date() },
  });

  let toiletAuthorId: number | null = null;
  if (action !== "NONE") {
    const toilet = await prisma.toilet.update({
      where: { id: toiletId },
      data: { status: action === "TOILET_DELETED" ? "DELETED" : "HIDDEN", deletedAt: new Date(), deletedById: moderatorId },
      select: { createdById: true },
    });
    toiletAuthorId = toilet.createdById;
    await bumpVersion();
  }

  const reporterIds = [...new Set(pending.map((r) => r.userId))];
  await Promise.all(reporterIds.map((uid) => notifyModeration(uid, "report", toiletId, reportStatus === "APPROVED" ? "approved" : "rejected")));
  if (toiletAuthorId !== null) {
    await notifyToiletRemoved(toiletAuthorId, toiletId, action === "TOILET_DELETED" ? "deleted" : "hidden", "report");
  }

  return { ok: true };
}

/** Standalone soft-delete (no report involved) — never a hard delete, kept for audit. */
export async function deleteToilet(toiletId: number, moderatorId: number): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const toilet = await prisma.toilet.findUnique({ where: { id: toiletId }, select: { createdById: true, status: true } });
  if (!toilet || toilet.status === "DELETED") return { ok: false, error: "Ce spot n'existe pas", status: 404 };

  await prisma.toilet.update({ where: { id: toiletId }, data: { status: "DELETED", deletedAt: new Date(), deletedById: moderatorId } });
  await bumpVersion();
  await notifyToiletRemoved(toilet.createdById, toiletId, "deleted", "moderator");

  return { ok: true };
}
