import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import type { AppNotification, NotificationKind, NotificationOutcome } from "./types";

const TYPE_TO_DB = { toilet: "TOILET", review: "REVIEW", completion: "COMPLETION", report: "REPORT" } as const;
const TYPE_TO_CLIENT = { TOILET: "toilet", REVIEW: "review", COMPLETION: "completion", REPORT: "report" } as const;
const STATUS_TO_DB = { approved: "APPROVED", rejected: "REJECTED", partial: "PARTIAL" } as const;
const STATUS_TO_CLIENT = { APPROVED: "approved", REJECTED: "rejected", PARTIAL: "partial" } as const;

const SUBJECT: Record<NotificationKind, string> = {
  toilet: "Ta demande de référencement",
  review: "Ton avis",
  completion: "Ta complétion",
  report: "Ton signalement",
};

/** Grammatical gender of each SUBJECT noun, for participle agreement ("approuvée" vs "approuvé"). */
const FEMININE: Record<NotificationKind, boolean> = { toilet: true, review: false, completion: true, report: false };
const agree = (participle: string, type: NotificationKind) => (FEMININE[type] ? `${participle}e` : participle);

const FIELD_LABEL: Record<string, string> = {
  name: "le nom",
  address: "l'adresse",
  description: "la description",
  comment: "le commentaire",
  price: "le prix",
  photos: "les photos",
};

const fieldsToText = (fields: string[]) => fields.map((f) => FIELD_LABEL[f] ?? f).join(", ");

function buildMessage(type: NotificationKind, status: NotificationOutcome, kept: string[], rejected: string[]): string {
  const subject = SUBJECT[type];
  if (status === "approved") return `${subject} a été ${agree("approuvé", type)} ✅`;
  if (status === "rejected") return `${subject} a été ${agree("rejeté", type)} ❌`;
  const parts: string[] = [];
  if (kept.length) parts.push(`conservé : ${fieldsToText(kept)}`);
  if (rejected.length) parts.push(`retiré : ${fieldsToText(rejected)}`);
  return `${subject} a été ${agree("partiellement approuvé", type)} ⚠️${parts.length ? ` — ${parts.join(" · ")}` : ""}.`;
}

/**
 * Records a moderation outcome for the user whose submission it was. Called from the
 * moderation endpoints only (`lib/moderation.ts`, `/api/admin`) — the message is
 * always generated here, server-side, never trusted from the client. A no-op when
 * `userId` is null (legacy anonymous content predating the registered-only rule).
 */
export async function notifyModeration(
  userId: number | null,
  type: NotificationKind,
  referenceId: number,
  status: NotificationOutcome,
  opts: { kept?: string[]; rejected?: string[] } = {}
): Promise<void> {
  if (userId === null) return;
  const kept = opts.kept ?? [];
  const rejected = opts.rejected ?? [];
  const message = buildMessage(type, status, kept, rejected);
  const details: Prisma.InputJsonValue | undefined = status === "partial" ? { keptFields: kept, rejectedFields: rejected } : undefined;

  await prisma.notification.create({
    data: {
      userId,
      type: TYPE_TO_DB[type],
      referenceId,
      status: STATUS_TO_DB[status],
      message,
      details,
    },
  });
}

export async function listNotifications(userId: number, cursor: number | null, take: number): Promise<{ items: AppNotification[]; nextCursor: number | null }> {
  const rows = await prisma.notification.findMany({
    where: { userId },
    orderBy: { id: "desc" },
    take: take + 1,
    ...(cursor !== null ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > take;
  const page = hasMore ? rows.slice(0, take) : rows;
  return {
    items: page.map((n) => ({
      id: n.id,
      type: TYPE_TO_CLIENT[n.type],
      referenceId: n.referenceId,
      status: STATUS_TO_CLIENT[n.status],
      message: n.message,
      details: n.details as AppNotification["details"],
      read: n.read,
      createdAt: n.createdAt.toISOString(),
    })),
    nextCursor: hasMore ? page[page.length - 1].id : null,
  };
}

export function unreadCount(userId: number): Promise<number> {
  return prisma.notification.count({ where: { userId, read: false } });
}

/**
 * Notifies a toilet's original author that their (previously live) toilet was hidden
 * or deleted — distinct from `notifyModeration` because this isn't "your submission
 * was judged", it's "something happened to content you already had approved". Uses
 * the "toilet" type + "rejected" status so it renders with the same ❌ treatment as
 * other negative outcomes; `reason` picks accurate wording for the two triggers.
 */
export async function notifyToiletRemoved(userId: number | null, toiletId: number, action: "deleted" | "hidden", reason: "report" | "moderator"): Promise<void> {
  if (userId === null) return;
  const cause = reason === "report" ? "suite à un signalement validé" : "par la modération";
  const message =
    action === "deleted" ? `Ta toilette a été retirée ${cause} 🗑️` : `Ta toilette a été temporairement masquée ${cause} ⚠️`;

  await prisma.notification.create({
    data: { userId, type: "TOILET", referenceId: toiletId, status: "REJECTED", message },
  });
}
