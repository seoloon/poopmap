"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import type { ActivityKind, ProfileData, SessionUser } from "@/lib/types";

const KIND_BADGE: Record<string, { txt: string; cls: string }> = {
  gratuit: { txt: "🆓 Gratuit", cls: "bg-sage-dark/20 text-sage-dark" },
  payant: { txt: "💰 Payant", cls: "bg-terracotta/20 text-terracotta" },
  commerce: { txt: "🏪 Commerce", cls: "bg-blue-100 text-blue-800" },
};

const ACTIVITY_BADGE: Record<ActivityKind, string> = {
  added: "➕ Ajout",
  review: "💩 Avis",
  completion: "✏️ Complétion",
};

const FEATURES = [
  "Laisser des avis sur les spots",
  "Compléter un spot (nom, adresse, photos)",
  "Ajouter de nouveaux petits coins",
  "Suivre tes contributions ici",
];

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

type Props = {
  me: SessionUser | null;
  onLoginClick: () => void;
  onLogout: () => void;
  onSelectToilet: (id: number) => void;
};

export default function ProfilePage({ me, onLoginClick, onLogout, onSelectToilet }: Props) {
  const [data, setData] = useState<ProfileData | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!me) return;
    setLoaded(false);
    fetch("/api/profile", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        setData(d);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [me]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      transition={{ duration: 0.22 }}
      className="absolute inset-0 z-[1000] overflow-y-auto bg-cream"
    >
      <div className="mx-auto max-w-lg px-4 pb-32 pt-6">
        <h1 className="mb-4 font-display text-2xl font-extrabold tracking-tight">👤 Profil</h1>

        {!me ? (
          <div className="sticker space-y-4 rounded-[24px] p-5">
            <p className="text-sm font-bold text-ink/70">
              Connecte-toi pour débloquer :
            </p>
            <ul className="space-y-2">
              {FEATURES.map((f) => (
                <li key={f} className="flex items-center gap-2 text-sm font-semibold">
                  <span aria-hidden>🔓</span> {f}
                </li>
              ))}
            </ul>
            <button
              onClick={onLoginClick}
              className="sticker-sm sticker-press w-full rounded-xl bg-signage px-4 py-2.5 text-sm font-extrabold"
            >
              Connexion / Inscription
            </button>
          </div>
        ) : (
          <>
            <div className="sticker mb-4 space-y-4 rounded-[24px] p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-display text-xl font-extrabold leading-tight">{me.pseudo}</p>
                  <p className="text-xs font-bold text-ink/50">@{me.username}</p>
                </div>
                <button
                  onClick={onLogout}
                  className="rounded-lg border-2 border-ink bg-white px-2.5 py-1.5 text-xs font-extrabold transition hover:bg-red-50"
                >
                  Sortir
                </button>
              </div>
              {data && (
                <p className="text-xs font-bold text-ink/50">Membre depuis le {fmtDate(data.createdAt)}</p>
              )}

              <div className="grid grid-cols-3 gap-2 pt-1">
                <Stat emoji="🧻" value={data?.toiletsAdded} label="Ajoutées" loaded={loaded} />
                <Stat emoji="✏️" value={data?.completions} label="Complétées" loaded={loaded} />
                <Stat emoji="💩" value={data?.reviews} label="Avis" loaded={loaded} />
              </div>

              {(me.role === "moderator" || me.role === "admin") && (
                <a
                  href="/admin"
                  className="sticker-sm sticker-press block w-full rounded-xl px-4 py-2.5 text-center text-sm font-extrabold transition hover:bg-blush"
                >
                  🛠️ Espace modération
                </a>
              )}
            </div>

            <h2 className="mb-2 font-display text-lg font-extrabold">Mon activité</h2>
            {!loaded ? (
              <div className="space-y-2">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-16 animate-pulse rounded-2xl bg-ink/10" />
                ))}
              </div>
            ) : !data || data.activity.length === 0 ? (
              <p className="rounded-2xl bg-white/60 px-4 py-6 text-center text-sm font-bold text-ink/50">
                Pas encore d&apos;activité — ajoute un spot ou laisse un avis pour le voir apparaître ici 🧻
              </p>
            ) : (
              <ul className="space-y-2">
                {data.activity.map((t) => {
                  const badge = KIND_BADGE[t.kind];
                  return (
                    <li key={t.id}>
                      <button
                        onClick={() => onSelectToilet(t.id)}
                        className="sticker-sm sticker-press flex w-full items-center justify-between gap-2 rounded-2xl px-4 py-3 text-left transition hover:-translate-y-0.5"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-display text-sm font-extrabold">
                            {t.name ?? <span className="italic text-ink/40">Toilette sans nom</span>}
                          </p>
                          <div className="mt-1 flex flex-wrap gap-1">
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${badge.cls}`}>{badge.txt}</span>
                            {t.activity.map((a) => (
                              <span key={a} className="rounded-full bg-ink/10 px-2 py-0.5 text-[10px] font-extrabold text-ink/70">
                                {ACTIVITY_BADGE[a]}
                              </span>
                            ))}
                          </div>
                        </div>
                        <span aria-hidden className="shrink-0 text-lg">
                          🗺️
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </div>
    </motion.div>
  );
}

function Stat({ emoji, value, label, loaded }: { emoji: string; value: number | undefined; label: string; loaded: boolean }) {
  return (
    <div className="rounded-2xl bg-white/60 px-2 py-3 text-center">
      <p className="text-lg leading-none">{emoji}</p>
      <p className="mt-1 font-display text-lg font-extrabold leading-none">{loaded ? value ?? 0 : "…"}</p>
      <p className="mt-0.5 text-[10px] font-bold text-ink/50">{label}</p>
    </div>
  );
}
