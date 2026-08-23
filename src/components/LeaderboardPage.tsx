"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import type { LeaderboardEntry, SessionUser } from "@/lib/types";

const MEDAL: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

type Props = {
  me: SessionUser | null;
  onSelectUser: (id: number) => void;
};

export default function LeaderboardPage({ me, onSelectUser }: Props) {
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/leaderboard", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        setEntries(d?.entries ?? []);
        setLoaded(true);
      })
      .catch(() => {
        setEntries([]);
        setLoaded(true);
      });
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      transition={{ duration: 0.22 }}
      className="absolute inset-0 z-[1000] overflow-y-auto bg-cream"
    >
      <div className="mx-auto max-w-lg px-4 pb-32 pt-6">
        <h1 className="mb-1 font-display text-2xl font-extrabold tracking-tight">🏆 Classement</h1>
        <p className="mb-4 text-xs font-bold text-ink/50">
          💩 Avis 50 pts · ✏️ Complétion 100 pts · 🧻 Toilette référencée 200 pts
        </p>

        {!loaded ? (
          <div className="space-y-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-2xl bg-ink/10" />
            ))}
          </div>
        ) : !entries || entries.length === 0 ? (
          <p className="rounded-2xl bg-white/60 px-4 py-6 text-center text-sm font-bold text-ink/50">
            Personne au classement pour l&apos;instant — sois le premier 🧻
          </p>
        ) : (
          <ul className="space-y-2">
            {entries.map((e, i) => {
              const rank = i + 1;
              const mine = e.userId === me?.id;
              return (
                <li key={e.userId}>
                  <button
                    onClick={() => onSelectUser(e.userId)}
                    className={`sticker-sm sticker-press flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition hover:-translate-y-0.5 ${
                      mine ? "ring-2 ring-teal" : ""
                    }`}
                  >
                    <span className="w-7 shrink-0 text-center font-display text-base font-extrabold text-ink/60">
                      {MEDAL[rank] ?? rank}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-display text-sm font-extrabold">
                        {e.pseudo}
                        {mine && <span className="ml-1 text-xs font-bold text-teal">(toi)</span>}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        <span className="rounded-full bg-ink/10 px-2 py-0.5 text-[10px] font-extrabold text-ink/70">
                          🧻 {e.toiletsAdded}
                        </span>
                        <span className="rounded-full bg-ink/10 px-2 py-0.5 text-[10px] font-extrabold text-ink/70">
                          ✏️ {e.completions}
                        </span>
                        <span className="rounded-full bg-ink/10 px-2 py-0.5 text-[10px] font-extrabold text-ink/70">
                          💩 {e.reviews}
                        </span>
                      </div>
                    </div>
                    <span className="shrink-0 font-display text-base font-extrabold text-teal">{e.points} pts</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </motion.div>
  );
}
