"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import type { ActivityKind, PublicProfileData } from "@/lib/types";

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

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

type Props = {
  userId: number;
  onClose: () => void;
  /** Omit to render activity rows as inert (e.g. from the admin panel, which has no map to jump to). */
  onSelectToilet?: (id: number) => void;
};

/** Read-only view of another user's profile — opened by clicking a pseudo anywhere it appears. */
export default function UserProfileModal({ userId, onClose, onSelectToilet }: Props) {
  const [data, setData] = useState<PublicProfileData | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setData(null);
    setNotFound(false);
    setLoaded(false);
    fetch(`/api/users/${userId}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) setData(d);
        else setNotFound(true);
        setLoaded(true);
      })
      .catch(() => {
        setNotFound(true);
        setLoaded(true);
      });
  }, [userId]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.16 }}
      className="fixed inset-0 z-[2000] flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 24, opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={(e) => e.stopPropagation()}
        className="sticker max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-[24px] p-5 sm:rounded-[24px]"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h1 className="font-display text-xl font-extrabold tracking-tight">👤 Profil</h1>
          <button
            onClick={onClose}
            className="rounded-lg border-2 border-ink bg-white px-2.5 py-1.5 text-xs font-extrabold transition hover:bg-red-50"
            aria-label="Fermer"
          >
            ✕
          </button>
        </div>

        {!loaded ? (
          <div className="space-y-3">
            <div className="h-16 animate-pulse rounded-2xl bg-ink/10" />
            <div className="h-16 animate-pulse rounded-2xl bg-ink/10" />
          </div>
        ) : notFound || !data ? (
          <p className="rounded-2xl bg-white/60 px-4 py-6 text-center text-sm font-bold text-ink/50">
            Cet utilisateur n&apos;existe plus 👻
          </p>
        ) : (
          <>
            <div className="sticker mb-4 space-y-3 rounded-[24px] p-5">
              <p className="truncate font-display text-xl font-extrabold leading-tight">{data.pseudo}</p>
              <p className="text-xs font-bold text-ink/50">Membre depuis le {fmtDate(data.createdAt)}</p>
              <div className="grid grid-cols-3 gap-2 pt-1">
                <Stat emoji="🧻" value={data.toiletsAdded} label="Ajoutées" />
                <Stat emoji="✏️" value={data.completions} label="Complétées" />
                <Stat emoji="💩" value={data.reviews} label="Avis" />
              </div>
            </div>

            <h2 className="mb-2 font-display text-lg font-extrabold">Activité</h2>
            {data.activity.length === 0 ? (
              <p className="rounded-2xl bg-white/60 px-4 py-6 text-center text-sm font-bold text-ink/50">
                Pas encore d&apos;activité 🧻
              </p>
            ) : (
              <ul className="space-y-2">
                {data.activity.map((t) => {
                  const badge = KIND_BADGE[t.kind];
                  const row = (
                    <div className="flex w-full items-center justify-between gap-2 rounded-2xl px-4 py-3 text-left">
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
                      {onSelectToilet && (
                        <span aria-hidden className="shrink-0 text-lg">
                          🗺️
                        </span>
                      )}
                    </div>
                  );
                  return (
                    <li key={t.id} className="sticker-sm">
                      {onSelectToilet ? (
                        <button onClick={() => onSelectToilet(t.id)} className="sticker-press w-full transition hover:-translate-y-0.5">
                          {row}
                        </button>
                      ) : (
                        row
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </motion.div>
    </motion.div>
  );
}

function Stat({ emoji, value, label }: { emoji: string; value: number; label: string }) {
  return (
    <div className="rounded-2xl bg-white/60 px-2 py-3 text-center">
      <p className="text-lg leading-none">{emoji}</p>
      <p className="mt-1 font-display text-lg font-extrabold leading-none">{value}</p>
      <p className="mt-0.5 text-[10px] font-bold text-ink/50">{label}</p>
    </div>
  );
}
