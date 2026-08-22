"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type {
  AdminCompletion,
  AdminModeratableToilet,
  AdminReport,
  AdminReportGroup,
  AdminReviewRow,
  AdminStats,
  AdminUserRow,
  Role,
  SessionUser,
  ToiletDetail,
} from "@/lib/types";
import { REPORT_CATEGORIES } from "@/lib/types";
import { toast } from "./Toasts";
import UserProfileModal from "./UserProfileModal";

type Data = {
  pending: ToiletDetail[];
  moderation: AdminModeratableToilet[];
  reviews: AdminReviewRow[];
  completions: AdminCompletion[];
  reports: AdminReportGroup[];
  users: AdminUserRow[];
  stats: AdminStats;
};

type Tab = "queue" | "avis" | "completions" | "reports" | "users";

const CATEGORY_LABEL: Record<AdminReport["category"], string> = Object.fromEntries(REPORT_CATEGORIES.map((c) => [c.value, c.label])) as Record<
  AdminReport["category"],
  string
>;

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

const btnPrimary =
  "flex-1 rounded-xl border-2 border-ink bg-teal px-3 py-2 text-xs font-extrabold text-white shadow-[3px_3px_0_#1a1a1a] transition hover:-translate-y-0.5";
const btnDanger =
  "flex-1 rounded-xl border-2 border-ink bg-red-600 px-3 py-2 text-xs font-extrabold text-white shadow-[3px_3px_0_#1a1a1a] transition hover:-translate-y-0.5";
const btnGhost = "sticker-sm rounded-lg px-2.5 py-1.5 text-xs font-extrabold transition hover:-translate-y-0.5 hover:bg-blush";
const fieldCls = "w-full rounded-lg border-2 border-ink/25 bg-white px-2.5 py-1.5 text-sm font-semibold outline-none focus:border-teal";
/** Status pill — same shape/position (top-right of the card) everywhere it's used. */
const pillCls = (colorCls: string) => `shrink-0 rounded-full px-2.5 py-1 text-[10px] font-extrabold ${colorCls}`;

export default function AdminPanel({ me }: { me: SessionUser }) {
  const [data, setData] = useState<Data | null>(null);
  const [tab, setTab] = useState<Tab>("queue");
  const [resetFor, setResetFor] = useState<number | null>(null);
  const [newPw, setNewPw] = useState("");
  const [viewedUserId, setViewedUserId] = useState<number | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin", { cache: "no-store" });
    if (res.ok) setData(await res.json());
    else toast("Chargement du panneau impossible", "err");
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** Simple one-shot admin actions (ban, delete photo, reset password…). */
  const act = async (action: string, id: number, extra?: Record<string, string>, msg?: string) => {
    const res = await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, id, ...extra }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast(d.error ?? "Erreur", "err");
      return;
    }
    toast(msg ?? "C'est fait ✅");
    await load();
  };

  /** Granular moderation: approve (with optional field edits/drops) or reject outright. */
  const partial = async (
    type: "toilet" | "review" | "completion",
    id: number,
    opts: { rejectedFields?: string[]; approveRest: boolean; edits?: Record<string, string> },
    msg?: string
  ) => {
    const res = await fetch(`/api/admin/submissions/${id}/partial`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, rejectedFields: opts.rejectedFields ?? [], approveRest: opts.approveRest, edits: opts.edits ?? {} }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast(d.error ?? "Erreur", "err");
      return;
    }
    toast(msg ?? "C'est fait ✅");
    await load();
  };

  /** Standalone soft-delete — a distinct REST endpoint, not one of the POST /api/admin actions. */
  const del = async (toiletId: number, msg?: string) => {
    const res = await fetch(`/api/admin/toilets/${toiletId}`, { method: "DELETE" });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast(d.error ?? "Erreur", "err");
      return;
    }
    toast(msg ?? "Toilette supprimée 🗑️");
    await load();
  };

  /** Resolves every pending report on one toilet at once (they stack). */
  const resolveReport = async (
    toiletId: number,
    decision: "approve" | "reject",
    resolution?: "delete" | "hide" | "keep",
    modComment?: string
  ) => {
    const res = await fetch("/api/admin/reports", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toiletId, decision, resolution, modComment }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast(d.error ?? "Erreur", "err");
      return;
    }
    toast(decision === "reject" ? "Signalement rejeté 🚫" : "Signalement traité ✅");
    await load();
  };

  return (
    <div className="min-h-dvh bg-cream pb-16">
      <header className="sticky top-0 z-10 border-b-2 border-ink bg-cream/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="sticker-sm grid h-10 w-10 place-items-center rounded-xl text-xl transition hover:-translate-y-0.5">
              🚽
            </Link>
            <div>
              <h1 className="font-display text-2xl font-extrabold leading-none">QG des admins</h1>
              <p className="text-[11px] font-bold text-ink/60">
                Connecté en tant que {me.pseudo} · {me.role === "admin" ? "👑 admin" : "🛡️ modérateur"}
              </p>
            </div>
          </div>
          <Link href="/" className="sticker-sm rounded-xl px-3 py-2 text-sm font-extrabold transition hover:-translate-y-0.5 hover:bg-blush">
            ← Carte
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 pt-5">
        {data && (
          <div className="mb-5 grid grid-cols-3 gap-2.5 sm:grid-cols-6">
            {[
              { label: "En attente", v: data.stats.pending, e: "⏳" },
              { label: "Approuvés", v: data.stats.approved, e: "✅" },
              { label: "Rejetés", v: data.stats.rejected, e: "🚫" },
              { label: "Signalements", v: data.stats.reports, e: "🚩" },
              { label: "Comptes", v: data.stats.users, e: "👥" },
              { label: "Avis", v: data.stats.reviews, e: "💬" },
            ].map((s) => (
              <div key={s.label} className="sticker-sm px-3 py-2.5 text-center transition hover:-translate-y-0.5">
                <p className="font-display text-2xl font-extrabold leading-none">
                  {s.e} {s.v}
                </p>
                <p className="mt-1 text-[10px] font-extrabold uppercase tracking-wide text-ink/60">{s.label}</p>
              </div>
            ))}
          </div>
        )}

        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {(
            [
              { v: "queue", label: `🕵️ Requêtes${data && data.stats.pending > 0 ? ` (${data.stats.pending})` : ""}` },
              { v: "avis", label: `💬 Avis${data ? ` (${data.reviews.length})` : ""}` },
              { v: "completions", label: `🧩 Complétions${data && data.stats.completions > 0 ? ` (${data.stats.completions})` : ""}` },
              { v: "reports", label: `🚩 Signalements${data && data.stats.reports > 0 ? ` (${data.stats.reports})` : ""}` },
              { v: "users", label: "👥 Comptes" },
            ] as const
          ).map((t) => (
            <button
              key={t.v}
              onClick={() => setTab(t.v)}
              className={`rounded-xl border-2 border-ink px-3 py-2.5 text-sm font-extrabold shadow-[3px_3px_0_#1a1a1a] transition ${
                tab === t.v ? "bg-signage" : "bg-white hover:bg-blush"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {!data ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-28 animate-pulse rounded-2xl bg-ink/10" />
            ))}
          </div>
        ) : tab === "queue" ? (
          <QueueTab pending={data.pending} act={act} partial={partial} del={del} onSelectUser={setViewedUserId} />
        ) : tab === "avis" ? (
          <AvisTab reviews={data.reviews} partial={partial} onSelectUser={setViewedUserId} />
        ) : tab === "completions" ? (
          <CompletionsTab completions={data.completions} moderation={data.moderation} partial={partial} act={act} del={del} onSelectUser={setViewedUserId} />
        ) : tab === "reports" ? (
          <ReportsTab groups={data.reports} onResolve={resolveReport} />
        ) : (
          <ul className="space-y-3">
            {data.users.map((u) => (
              <li key={u.id} className="sticker p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border-2 border-ink bg-blush font-display font-extrabold">
                      {u.pseudo[0]?.toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <p className="font-display text-base font-extrabold leading-tight">
                        <button onClick={() => setViewedUserId(u.id)} className="underline decoration-dotted underline-offset-2">
                          {u.pseudo}
                        </button>
                        {u.id === me.id && <span className="ml-1.5 text-[10px] font-bold text-ink/50">(toi)</span>}
                      </p>
                      <p className="truncate font-mono text-[11px] font-bold text-ink/60">{u.username}</p>
                      <p className="text-[10px] font-bold text-ink/50">
                        {u.reviewCount} avis · inscrit le {fmtDate(u.createdAt)}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {me.role === "admin" ? (
                      <select
                        value={u.role}
                        onChange={(e) => void act("setrole", u.id, { role: e.target.value }, "Rôle mis à jour 👑")}
                        className="rounded-full border-2 border-ink bg-white px-2 py-1 text-[10px] font-extrabold"
                      >
                        <option value="user">utilisateur</option>
                        <option value="moderator">🛡️ modérateur</option>
                        <option value="admin">👑 admin</option>
                      </select>
                    ) : (
                      <span className={pillCls(roleBadgeCls(u.role))}>{roleLabel(u.role)}</span>
                    )}
                    <span className={pillCls(u.status === "active" ? "bg-sage/40 text-teal-dark" : "bg-red-100 text-red-700")}>
                      {u.status === "active" ? "actif" : "suspendu"}
                    </span>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {me.role !== "admin" && (
                    <span className="text-[11px] font-bold text-ink/50">Gestion des comptes réservée aux admins</span>
                  )}
                  {me.role === "admin" && (
                    <>
                      <button
                        onClick={() =>
                          void act(
                            u.status === "active" ? "ban" : "unban",
                            u.id,
                            undefined,
                            u.status === "active" ? "Compte suspendu 🚫" : "Compte réactivé ✅"
                          )
                        }
                        className="rounded-lg border-2 border-ink bg-white px-3 py-1.5 text-xs font-extrabold transition hover:bg-blush"
                      >
                        {u.status === "active" ? "⛔ Suspendre" : "✅ Réactiver"}
                      </button>
                      <button
                        onClick={() => {
                          setResetFor(resetFor === u.id ? null : u.id);
                          setNewPw("");
                        }}
                        className="rounded-lg border-2 border-ink bg-white px-3 py-1.5 text-xs font-extrabold transition hover:bg-blush"
                      >
                        🔑 Réinitialiser le mdp
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Supprimer définitivement le compte de ${u.pseudo} ?`)) void act("deleteuser", u.id, undefined, "Compte supprimé 🗑️");
                        }}
                        className="rounded-lg border-2 border-ink bg-white px-3 py-1.5 text-xs font-extrabold text-red-700 transition hover:bg-red-50"
                      >
                        🗑️ Supprimer
                      </button>
                    </>
                  )}
                  {me.role === "admin" && resetFor === u.id && (
                    <form
                      className="flex w-full gap-2 sm:w-auto sm:flex-1"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void act("resetpw", u.id, { password: newPw }, "Mot de passe réinitialisé 🔑");
                        setResetFor(null);
                        setNewPw("");
                      }}
                    >
                      <input
                        autoFocus
                        required
                        minLength={8}
                        type="text"
                        placeholder="Nouveau mot de passe (8 car. min)"
                        value={newPw}
                        onChange={(e) => setNewPw(e.target.value)}
                        className="min-w-0 flex-1 rounded-lg border-2 border-ink px-2.5 py-1.5 text-xs font-bold outline-none focus:border-teal"
                      />
                      <button type="submit" className="rounded-lg border-2 border-ink bg-teal px-3 py-1.5 text-xs font-extrabold text-white">
                        OK
                      </button>
                    </form>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>

      {viewedUserId !== null && <UserProfileModal userId={viewedUserId} onClose={() => setViewedUserId(null)} />}
    </div>
  );
}

function roleLabel(role: Role) {
  return role === "admin" ? "👑 admin" : role === "moderator" ? "🛡️ modérateur" : "utilisateur";
}
function roleBadgeCls(role: Role) {
  return role === "admin" ? "bg-signage" : role === "moderator" ? "bg-teal/30" : "bg-ink/10";
}

type PartialFn = (
  type: "toilet" | "review" | "completion",
  id: number,
  opts: { rejectedFields?: string[]; approveRest: boolean; edits?: Record<string, string> },
  msg?: string
) => Promise<void>;
type ActFn = (action: string, id: number, extra?: Record<string, string>, msg?: string) => Promise<void>;
type DelFn = (toiletId: number, msg?: string) => Promise<void>;

/** Small centered confirm dialog for destructive actions — D.A.-matched, not the browser's native confirm(). */
function ConfirmModal({
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-ink/50 p-4" onClick={onCancel}>
      <div className="sticker w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
        <p className="font-display text-lg font-extrabold">{title}</p>
        <p className="mt-1.5 text-sm font-semibold text-ink/70">{body}</p>
        <div className="mt-4 flex gap-2">
          <button onClick={onCancel} className={btnGhost}>
            Annuler
          </button>
          <button onClick={onConfirm} className={btnDanger}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function DeleteToiletButton({ toiletId, toiletName, del }: { toiletId: number; toiletName: string; del: DelFn }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <>
      <button onClick={() => setConfirming(true)} className={`${btnGhost} text-red-700`}>
        🗑️ Supprimer
      </button>
      {confirming && (
        <ConfirmModal
          title="🗑️ Supprimer cette toilette ?"
          body={`« ${toiletName} » sera retirée de la carte pour tout le monde (suppression réversible en base, pour audit).`}
          confirmLabel="Supprimer"
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            void del(toiletId, "Toilette supprimée 🗑️");
            setConfirming(false);
          }}
        />
      )}
    </>
  );
}

function QueueTab({
  pending,
  act,
  partial,
  del,
  onSelectUser,
}: {
  pending: ToiletDetail[];
  act: ActFn;
  partial: PartialFn;
  del: DelFn;
  onSelectUser: (id: number) => void;
}) {
  if (pending.length === 0) {
    return (
      <div className="sticker px-6 py-10 text-center">
        <p className="text-4xl">🎉</p>
        <p className="mt-2 font-display text-xl font-extrabold">File vide, chef !</p>
        <p className="text-sm font-bold text-ink/60">Tous les petits coins sont à jour.</p>
      </div>
    );
  }
  return (
    <ul className="space-y-3">
      {pending.map((t) => (
        <PendingToiletCard key={t.id} t={t} act={act} partial={partial} del={del} onSelectUser={onSelectUser} />
      ))}
    </ul>
  );
}

function PendingToiletCard({
  t,
  act,
  partial,
  del,
  onSelectUser,
}: {
  t: ToiletDetail;
  act: ActFn;
  partial: PartialFn;
  del: DelFn;
  onSelectUser: (id: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(t.name ?? "");
  const [address, setAddress] = useState(t.address ?? "");
  const [description, setDescription] = useState(t.description ?? "");
  const [price, setPrice] = useState(t.price ?? "");

  const approveEdited = () => {
    const rejectedFields: string[] = [];
    if (!name.trim()) rejectedFields.push("name");
    if (!address.trim()) rejectedFields.push("address");
    if (!description.trim()) rejectedFields.push("description");
    if (!price.trim()) rejectedFields.push("price");
    void partial("toilet", t.id, { approveRest: true, rejectedFields, edits: { name, address, description, price } }, "Petit coin approuvé ✅");
    setEditing(false);
  };

  return (
    <li className="sticker p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-display text-lg font-extrabold leading-tight">{t.name}</p>
          <p className="text-xs font-bold text-ink/60">
            {t.kind} · proposé par{" "}
            {t.createdById !== null ? (
              <button onClick={() => onSelectUser(t.createdById!)} className="underline decoration-dotted underline-offset-2">
                {t.createdByPseudo}
              </button>
            ) : (
              t.createdByPseudo
            )}{" "}
            · {fmtDate(t.createdAt)}
          </p>
          {t.address && <p className="mt-0.5 text-xs font-bold text-ink/60">📍 {t.address}</p>}
          {t.description && <p className="mt-1 text-sm font-semibold italic text-ink/80">&ldquo;{t.description}&rdquo;</p>}
          <p className="mt-1 font-mono text-[10px] font-bold text-ink/50">
            {t.lat.toFixed(5)}, {t.lng.toFixed(5)}
          </p>
        </div>
        <span className={pillCls("bg-blue-100 text-blue-800")}>⏳ en attente</span>
      </div>

      {t.photos.length > 0 && (
        <div className="no-scrollbar mt-2.5 flex gap-2 overflow-x-auto">
          {t.photos.map((p) => (
            <div key={p.id} className="relative shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt="" className="h-20 w-28 rounded-lg border-2 border-ink object-cover" />
              <button
                onClick={() => void act("deletephoto", p.id, undefined, "Photo supprimée 🗑️")}
                className="absolute -right-1.5 -top-1.5 grid h-6 w-6 place-items-center rounded-full border-2 border-ink bg-red-500 text-[10px] font-black text-white"
                aria-label="Supprimer la photo"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div className="mt-3 space-y-2 rounded-xl border-2 border-dashed border-teal bg-teal/5 p-3">
          <p className="text-[10px] font-extrabold uppercase tracking-wide text-teal-dark">
            Vide un champ pour l&apos;exclure de l&apos;approbation
          </p>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom" className={fieldCls} />
          <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Adresse" className={fieldCls} />
          <input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Prix" className={fieldCls} />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description"
            rows={2}
            className={`${fieldCls} resize-none`}
          />
        </div>
      )}

      {/* Action row — same order/position on every card in this panel: Éditer, Approuver, Rejeter, Carte. */}
      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={() => setEditing((e) => !e)} className={btnGhost}>
          ✏️ {editing ? "Fermer" : "Éditer"}
        </button>
        {editing ? (
          <>
            <button onClick={approveEdited} className={btnPrimary}>
              ✅ Approuver ces champs
            </button>
            <button onClick={() => void act("reject", t.id, undefined, "Spot recalé 🚫")} className={btnDanger}>
              🚫 Tout rejeter
            </button>
          </>
        ) : (
          <>
            <button onClick={() => void act("approve", t.id, undefined, "Petit coin approuvé — visible pour tous ✅")} className={btnPrimary}>
              ✅ Approuver
            </button>
            <button onClick={() => void act("reject", t.id, undefined, "Spot recalé 🚫")} className={btnDanger}>
              🚫 Rejeter
            </button>
          </>
        )}
        <a href={`/?focus=${t.id}`} className={btnGhost}>
          🗺️ Carte
        </a>
        <DeleteToiletButton toiletId={t.id} toiletName={t.name ?? "Toilette sans nom"} del={del} />
      </div>
    </li>
  );
}

function AvisTab({ reviews, partial, onSelectUser }: { reviews: AdminReviewRow[]; partial: PartialFn; onSelectUser: (id: number) => void }) {
  if (reviews.length === 0) {
    return (
      <div className="sticker px-6 py-10 text-center">
        <p className="text-4xl">🧼</p>
        <p className="mt-2 font-display text-xl font-extrabold">Aucun avis à modérer</p>
      </div>
    );
  }
  return (
    <ul className="space-y-3">
      {reviews.map((r) => (
        <ReviewCard key={r.id} r={r} partial={partial} onSelectUser={onSelectUser} />
      ))}
    </ul>
  );
}

function ReviewCard({ r, partial, onSelectUser }: { r: AdminReviewRow; partial: PartialFn; onSelectUser: (id: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [comment, setComment] = useState(r.comment ?? "");

  return (
    <li className="sticker p-3.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-extrabold">
            {r.userId !== null ? (
              <button onClick={() => onSelectUser(r.userId!)} className="underline decoration-dotted underline-offset-2">
                {r.pseudo}
              </button>
            ) : (
              r.pseudo
            )}{" "}
            <span className="font-normal text-ink/50">· {fmtDate(r.createdAt)}</span>
          </p>
          <p className="text-[11px] font-bold text-ink/60">
            🧼{r.proprete} 🛋️{r.confort} ✨{r.experience} · sur {r.toiletName ?? "toilette sans nom"}
          </p>
          {!editing && r.comment && <p className="mt-1 text-sm font-semibold text-ink/85">{r.comment}</p>}
        </div>
        <span className={pillCls(r.status === "published" ? "bg-sage/40 text-teal-dark" : "bg-red-100 text-red-700")}>
          {r.status === "published" ? "publié" : "rejeté"}
        </span>
      </div>

      {editing && (
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Commentaire (vide = supprimé)"
          rows={2}
          className={`${fieldCls} mt-2 resize-none`}
        />
      )}

      {/* Action row — same order/position on every card in this panel: Éditer, Approuver, Rejeter, Carte. */}
      <div className="mt-2.5 flex flex-wrap gap-2">
        {r.comment !== null && (
          <button onClick={() => setEditing((e) => !e)} className={btnGhost}>
            ✏️ {editing ? "Fermer" : "Éditer le commentaire"}
          </button>
        )}
        <button onClick={() => void partial("review", r.id, { approveRest: true, edits: { comment } }, "Avis publié ✅")} className={btnPrimary}>
          ✅ Publier
        </button>
        <button onClick={() => void partial("review", r.id, { approveRest: false }, "Avis rejeté 🚫")} className={btnDanger}>
          🚫 Rejeter
        </button>
        <a href={`/?focus=${r.toiletId}`} className={btnGhost}>
          🗺️ Carte
        </a>
      </div>
    </li>
  );
}

function CompletionsTab({
  completions,
  moderation,
  partial,
  act,
  del,
  onSelectUser,
}: {
  completions: AdminCompletion[];
  moderation: AdminModeratableToilet[];
  partial: PartialFn;
  act: ActFn;
  del: DelFn;
  onSelectUser: (id: number) => void;
}) {
  return (
    <div className="space-y-5">
      {completions.length === 0 ? (
        <div className="sticker px-6 py-10 text-center">
          <p className="text-4xl">🧩</p>
          <p className="mt-2 font-display text-xl font-extrabold">Aucune complétion</p>
          <p className="text-sm font-bold text-ink/60">Personne n&apos;a proposé d&apos;info manquante pour l&apos;instant.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {completions.map((c) => (
            <CompletionCard key={c.id} c={c} partial={partial} onSelectUser={onSelectUser} />
          ))}
        </ul>
      )}

      {moderation.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-extrabold uppercase tracking-wide text-ink/60">
            🖼️ Noms & photos publiés <span className="normal-case text-ink/40">(complétions déjà fondues dans la fiche, photos libres de droits incluses)</span>
          </p>
          <ul className="space-y-2.5">
            {moderation.map((t) => (
              <li key={t.id} className="sticker p-3.5">
                <div>
                  <p className="font-display text-base font-extrabold leading-tight">
                    {t.name ?? <span className="italic text-ink/40">Toilette sans nom</span>}
                  </p>
                  <p className="text-xs font-bold text-ink/60">
                    {t.kind}
                    {t.address && ` · 📍 ${t.address}`}
                  </p>
                </div>
                {t.photos.length > 0 && (
                  <div className="no-scrollbar mt-2.5 flex gap-2 overflow-x-auto">
                    {t.photos.map((p) => (
                      <div key={p.id} className="relative shrink-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={p.url} alt="" className="h-20 w-28 rounded-lg border-2 border-ink object-cover" />
                        <button
                          onClick={() => void act("deletephoto", p.id, undefined, "Photo supprimée 🗑️")}
                          className="absolute -right-1.5 -top-1.5 grid h-6 w-6 place-items-center rounded-full border-2 border-ink bg-red-500 text-[10px] font-black text-white"
                          aria-label="Supprimer la photo"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {t.nameSetById !== null && (
                    <button
                      onClick={() => {
                        if (confirm("Réinitialiser le nom de ce spot ? Il redeviendra proposable par quelqu'un d'autre."))
                          void act("resetname", t.id, undefined, "Nom réinitialisé 🔄");
                      }}
                      className={btnGhost}
                    >
                      🔄 Nom
                    </button>
                  )}
                  <a href={`/?focus=${t.id}`} className={btnGhost}>
                    🗺️ Carte
                  </a>
                  <DeleteToiletButton toiletId={t.id} toiletName={t.name ?? "Toilette sans nom"} del={del} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function CompletionCard({ c, partial, onSelectUser }: { c: AdminCompletion; partial: PartialFn; onSelectUser: (id: number) => void }) {
  const [name, setName] = useState(c.name ?? "");
  const [address, setAddress] = useState(c.address ?? "");
  const [comment, setComment] = useState(c.comment ?? "");
  const [includeName, setIncludeName] = useState(c.name !== null);
  const [includeAddress, setIncludeAddress] = useState(c.address !== null);
  const [includeComment, setIncludeComment] = useState(c.comment !== null);
  const [includePhotos, setIncludePhotos] = useState(c.photos.length > 0);

  const approve = () => {
    const rejectedFields: string[] = [];
    if (c.name !== null && !includeName) rejectedFields.push("name");
    if (c.address !== null && !includeAddress) rejectedFields.push("address");
    if (c.comment !== null && !includeComment) rejectedFields.push("comment");
    if (c.photos.length > 0 && !includePhotos) rejectedFields.push("photos");
    void partial("completion", c.id, { approveRest: true, rejectedFields, edits: { name, address, comment } }, "Complétion appliquée ✅");
  };

  return (
    <li className="sticker p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-bold text-ink/60">
            <button onClick={() => onSelectUser(c.userId)} className="underline decoration-dotted underline-offset-2">
              {c.userPseudo}
            </button>{" "}
            propose de compléter {c.toiletName ?? "toilette sans nom"} · {fmtDate(c.createdAt)}
          </p>
        </div>
        <span
          className={pillCls(
            c.status === "pending" ? "bg-blue-100 text-blue-800" : c.status === "approved" ? "bg-sage/40 text-teal-dark" : "bg-red-100 text-red-700"
          )}
        >
          {c.status === "pending" ? "en attente" : c.status === "approved" ? "approuvée" : "rejetée"}
        </span>
      </div>

      {c.status === "pending" && (
        <div className="mt-3 space-y-2">
          {c.name !== null && (
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={includeName} onChange={(e) => setIncludeName(e.target.checked)} />
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom" className={fieldCls} disabled={!includeName} />
            </label>
          )}
          {c.address !== null && (
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={includeAddress} onChange={(e) => setIncludeAddress(e.target.checked)} />
              <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Adresse" className={fieldCls} disabled={!includeAddress} />
            </label>
          )}
          {c.comment !== null && (
            <label className="flex items-start gap-2">
              <input type="checkbox" checked={includeComment} onChange={(e) => setIncludeComment(e.target.checked)} className="mt-2" />
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Commentaire"
                rows={2}
                className={`${fieldCls} resize-none`}
                disabled={!includeComment}
              />
            </label>
          )}
          {c.photos.length > 0 && (
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={includePhotos} onChange={(e) => setIncludePhotos(e.target.checked)} />
              <span className="text-xs font-bold text-ink/70">Inclure les {c.photos.length} photo(s) ci-dessous</span>
            </label>
          )}
          {c.photos.length > 0 && (
            <div className="no-scrollbar flex gap-2 overflow-x-auto">
              {c.photos.map((p) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={p.id} src={p.url} alt="" className="h-20 w-28 shrink-0 rounded-lg border-2 border-ink object-cover" />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Action row — same order/position on every card in this panel: Approuver, Rejeter, Carte. */}
      <div className="mt-3 flex flex-wrap gap-2">
        {c.status === "pending" && (
          <>
            <button onClick={approve} className={btnPrimary}>
              ✅ Approuver
            </button>
            <button onClick={() => void partial("completion", c.id, { approveRest: false }, "Complétion rejetée 🚫")} className={btnDanger}>
              🚫 Tout rejeter
            </button>
          </>
        )}
        <a href={`/?focus=${c.toiletId}`} className={btnGhost}>
          🗺️ Carte
        </a>
      </div>
    </li>
  );
}

type ResolveFn = (toiletId: number, decision: "approve" | "reject", resolution?: "delete" | "hide" | "keep", modComment?: string) => Promise<void>;

const RESOLUTIONS = [
  { v: "delete", label: "🗑️ Supprimer la toilette" },
  { v: "hide", label: "🙈 Masquer temporairement" },
  { v: "keep", label: "✅ Conserver (aucune action destructive)" },
] as const;

/** The "Approuver" action chooser — pick what happens to the toilet, plus an optional mod comment. */
function ResolveReportModal({
  toiletName,
  onResolve,
  onCancel,
}: {
  toiletName: string;
  onResolve: (resolution: "delete" | "hide" | "keep", modComment?: string) => void;
  onCancel: () => void;
}) {
  const [resolution, setResolution] = useState<"delete" | "hide" | "keep">("keep");
  const [modComment, setModComment] = useState("");

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-ink/50 p-4" onClick={onCancel}>
      <div className="sticker w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
        <p className="font-display text-lg font-extrabold">✅ Approuver le signalement</p>
        <p className="mt-0.5 text-xs font-bold text-ink/60">{toiletName}</p>
        <div className="mt-3 space-y-2">
          {RESOLUTIONS.map((o) => (
            <button
              key={o.v}
              onClick={() => setResolution(o.v)}
              className={`w-full rounded-xl border-2 border-ink px-3 py-2.5 text-left text-sm font-extrabold transition ${
                resolution === o.v ? "bg-signage shadow-[3px_3px_0_#1a1a1a]" : "bg-white hover:bg-blush"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
        <textarea
          value={modComment}
          onChange={(e) => setModComment(e.target.value)}
          placeholder="Commentaire de modération (optionnel)"
          rows={2}
          className={`${fieldCls} mt-3 resize-none`}
        />
        <div className="mt-3 flex gap-2">
          <button onClick={onCancel} className={btnGhost}>
            Annuler
          </button>
          <button onClick={() => onResolve(resolution, modComment.trim() || undefined)} className={btnPrimary}>
            Valider
          </button>
        </div>
      </div>
    </div>
  );
}

function ReportsTab({ groups, onResolve }: { groups: AdminReportGroup[]; onResolve: ResolveFn }) {
  if (groups.length === 0) {
    return (
      <div className="sticker px-6 py-10 text-center">
        <p className="text-4xl">🕊️</p>
        <p className="mt-2 font-display text-xl font-extrabold">Aucun signalement</p>
        <p className="text-sm font-bold text-ink/60">Personne n&apos;a rien à signaler pour l&apos;instant.</p>
      </div>
    );
  }
  return (
    <ul className="space-y-3">
      {groups.map((g) => (
        <ReportGroupCard key={g.toiletId} group={g} onResolve={onResolve} />
      ))}
    </ul>
  );
}

function ReportGroupCard({ group, onResolve }: { group: AdminReportGroup; onResolve: ResolveFn }) {
  const [showChooser, setShowChooser] = useState(false);
  const toiletName = group.toiletName ?? "Toilette sans nom";

  return (
    <li className="sticker p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="font-display text-lg font-extrabold leading-tight">{toiletName}</p>
        <span className={pillCls("bg-red-100 text-red-700")}>
          🚩 {group.reports.length} signalement{group.reports.length > 1 ? "s" : ""}
        </span>
      </div>

      <ul className="mt-2.5 space-y-2">
        {group.reports.map((r) => (
          <li key={r.id} className="rounded-xl border-2 border-ink/15 bg-white p-2.5">
            <p className="text-xs font-extrabold">{CATEGORY_LABEL[r.category]}</p>
            {r.description && <p className="mt-0.5 text-sm font-semibold text-ink/80">{r.description}</p>}
            <p className="mt-1 text-[10px] font-bold text-ink/50">
              par {r.userPseudo} · {fmtDate(r.createdAt)}
            </p>
          </li>
        ))}
      </ul>

      {/* Action row — same order/position on every card in this panel: Approuver, Rejeter, Carte. */}
      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={() => setShowChooser(true)} className={btnPrimary}>
          ✅ Approuver
        </button>
        <button onClick={() => void onResolve(group.toiletId, "reject")} className={btnDanger}>
          🚫 Rejeter
        </button>
        <a href={`/?focus=${group.toiletId}`} className={btnGhost}>
          🗺️ Carte
        </a>
      </div>

      {showChooser && (
        <ResolveReportModal
          toiletName={toiletName}
          onCancel={() => setShowChooser(false)}
          onResolve={(resolution, modComment) => {
            void onResolve(group.toiletId, "approve", resolution, modComment);
            setShowChooser(false);
          }}
        />
      )}
    </li>
  );
}
