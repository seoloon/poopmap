"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { AdminModeratableToilet, AdminStats, AdminUserRow, SessionUser, ToiletDetail } from "@/lib/types";
import { toast } from "./Toasts";

type Data = { pending: ToiletDetail[]; moderation: AdminModeratableToilet[]; users: AdminUserRow[]; stats: AdminStats };

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function AdminPanel({ me }: { me: SessionUser }) {
  const [data, setData] = useState<Data | null>(null);
  const [tab, setTab] = useState<"queue" | "moderation" | "users">("queue");
  const [resetFor, setResetFor] = useState<number | null>(null);
  const [newPw, setNewPw] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/admin", { cache: "no-store" });
    if (res.ok) setData(await res.json());
    else toast("Chargement du panneau impossible", "err");
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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
              <p className="text-[11px] font-bold text-ink/60">Connecté en tant que {me.pseudo}</p>
            </div>
          </div>
          <Link href="/" className="sticker-sm rounded-xl px-3 py-2 text-sm font-extrabold transition hover:-translate-y-0.5 hover:bg-blush">
            ← Carte
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 pt-5">
        {data && (
          <div className="mb-5 grid grid-cols-2 gap-2.5 sm:grid-cols-5">
            {[
              { label: "En attente", v: data.stats.pending, e: "⏳" },
              { label: "Approuvés", v: data.stats.approved, e: "✅" },
              { label: "Rejetés", v: data.stats.rejected, e: "🚫" },
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

        <div className="mb-4 grid grid-cols-3 gap-2">
          {(
            [
              { v: "queue", label: `🕵️ File${data && data.stats.pending > 0 ? ` (${data.stats.pending})` : ""}` },
              { v: "moderation", label: `🛡️ Modération${data && data.moderation.length > 0 ? ` (${data.moderation.length})` : ""}` },
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
          data.pending.length === 0 ? (
            <div className="sticker px-6 py-10 text-center">
              <p className="text-4xl">🎉</p>
              <p className="mt-2 font-display text-xl font-extrabold">File vide, chef !</p>
              <p className="text-sm font-bold text-ink/60">Tous les petits coins sont à jour.</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {data.pending.map((t) => (
                <li key={t.id} className="sticker p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-display text-lg font-extrabold leading-tight">{t.name}</p>
                      <p className="text-xs font-bold text-ink/60">
                        {t.kind} · proposé par {t.createdByPseudo} · {fmtDate(t.createdAt)}
                      </p>
                      {t.address && <p className="mt-0.5 text-xs font-bold text-ink/60">📍 {t.address}</p>}
                      {t.description && <p className="mt-1 text-sm font-semibold italic text-ink/80">&ldquo;{t.description}&rdquo;</p>}
                      <p className="mt-1 font-mono text-[10px] font-bold text-ink/50">
                        {t.lat.toFixed(5)}, {t.lng.toFixed(5)}
                      </p>
                    </div>
                    <a href={`/?focus=${t.id}`} className="sticker-sm rounded-lg px-2.5 py-1.5 text-xs font-extrabold transition hover:-translate-y-0.5 hover:bg-blush">
                      🗺️ Voir sur la carte
                    </a>
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
                            title="Supprimer cette photo"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => void act("approve", t.id, undefined, "Petit coin approuvé — visible pour tous ✅")}
                      className="flex-1 rounded-xl border-2 border-ink bg-teal px-3 py-2.5 font-display font-extrabold text-white shadow-[3px_3px_0_#1a1a1a] transition hover:-translate-y-0.5"
                    >
                      ✅ Approuver
                    </button>
                    <button
                      onClick={() => void act("reject", t.id, undefined, "Spot recalé 🚫")}
                      className="flex-1 rounded-xl border-2 border-ink bg-red-600 px-3 py-2.5 font-display font-extrabold text-white shadow-[3px_3px_0_#1a1a1a] transition hover:-translate-y-0.5"
                    >
                      🚫 Rejeter
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )
        ) : tab === "moderation" ? (
          data.moderation.length === 0 ? (
            <div className="sticker px-6 py-10 text-center">
              <p className="text-4xl">🧼</p>
              <p className="mt-2 font-display text-xl font-extrabold">Rien à modérer</p>
              <p className="text-sm font-bold text-ink/60">Aucun avis ni photo publié pour l&apos;instant.</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {data.moderation.map((t) => (
                <li key={t.id} className="sticker p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-display text-lg font-extrabold leading-tight">
                        {t.name ?? <span className="italic text-ink/40">Toilette sans nom</span>}
                      </p>
                      <p className="text-xs font-bold text-ink/60">
                        {t.kind}
                        {t.address && ` · 📍 ${t.address}`}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {t.nameSetById !== null && (
                        <button
                          onClick={() => {
                            if (confirm("Réinitialiser le nom de ce spot ? Il redeviendra proposable par quelqu'un d'autre."))
                              void act("resetname", t.id, undefined, "Nom réinitialisé 🔄");
                          }}
                          className="sticker-sm rounded-lg px-2.5 py-1.5 text-xs font-extrabold transition hover:-translate-y-0.5 hover:bg-blush"
                        >
                          🔄 Nom
                        </button>
                      )}
                      <a href={`/?focus=${t.id}`} className="sticker-sm rounded-lg px-2.5 py-1.5 text-xs font-extrabold transition hover:-translate-y-0.5 hover:bg-blush">
                        🗺️ Carte
                      </a>
                    </div>
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
                            title="Supprimer cette photo"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {t.reviews.length > 0 && (
                    <ul className="mt-3 space-y-2">
                      {t.reviews.map((r) => (
                        <li key={r.id} className="flex items-start justify-between gap-2 rounded-xl border-2 border-ink/15 bg-white p-2.5">
                          <div className="min-w-0">
                            <p className="text-xs font-extrabold">
                              {r.pseudo} <span className="font-normal text-ink/50">· {fmtDate(r.createdAt)}</span>
                            </p>
                            <p className="text-[11px] font-bold text-ink/60">
                              🧼{r.proprete} 🛋️{r.confort} ✨{r.experience}
                            </p>
                            {r.comment && <p className="mt-0.5 text-sm font-semibold text-ink/85">{r.comment}</p>}
                          </div>
                          <button
                            onClick={() => {
                              if (confirm(`Supprimer l'avis de ${r.pseudo} ?`)) void act("deletereview", r.id, undefined, "Avis supprimé 🗑️");
                            }}
                            className="shrink-0 rounded-lg border-2 border-ink bg-white px-2.5 py-1.5 text-xs font-extrabold text-red-700 transition hover:bg-red-50"
                          >
                            🗑️ Supprimer
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )
        ) : (
          <ul className="space-y-3">
            {data.users.map((u) => (
              <li key={u.id} className="sticker p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="grid h-9 w-9 place-items-center rounded-full border-2 border-ink bg-blush font-display font-extrabold">
                    {u.pseudo[0]?.toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <p className="font-display text-base font-extrabold leading-tight">
                      {u.pseudo}
                      {u.id === me.id && <span className="ml-1.5 text-[10px] font-bold text-ink/50">(toi)</span>}
                    </p>
                    <p className="truncate font-mono text-[11px] font-bold text-ink/60">{u.username}</p>
                  </div>
                  <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-extrabold ${u.role === "admin" ? "bg-signage" : "bg-ink/10"}`}>
                    {u.role === "admin" ? "👑 admin" : "utilisateur"}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
                      u.status === "active" ? "bg-sage/40 text-teal-dark" : "bg-red-100 text-red-700"
                    }`}
                  >
                    {u.status === "active" ? "actif" : "suspendu"}
                  </span>
                  <span className="text-[10px] font-bold text-ink/50">
                    {u.reviewCount} avis · inscrit le {fmtDate(u.createdAt)}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    onClick={() =>
                      void act(u.status === "active" ? "ban" : "unban", u.id, undefined, u.status === "active" ? "Compte suspendu 🚫" : "Compte réactivé ✅")
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
                  {resetFor === u.id && (
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
    </div>
  );
}
