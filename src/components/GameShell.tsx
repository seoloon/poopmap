"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import type { SessionUser } from "@/lib/types";
import { DIFFICULTIES_BY_GAME, HIGHER_IS_BETTER, type GameDifficulty, type GameKind } from "@/lib/games/scoring";
import { toast } from "./Toasts";

const DIFFICULTY_LABEL: Record<GameDifficulty, string> = {
  beginner: "🌱 Débutant",
  intermediate: "🔥 Intermédiaire",
  expert: "💀 Expert",
  easy: "🌱 Facile",
  medium: "🔥 Moyen",
  hard: "💀 Difficile",
};

function formatScore(game: GameKind, value: number): string {
  if (HIGHER_IS_BETTER[game]) return `${value} pts`;
  const minutes = Math.floor(value / 60);
  const seconds = value % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

type RenderCtx = { difficulty: GameDifficulty | null; finish: (score: number) => void };

type Props = {
  title: string;
  emoji: string;
  game: GameKind;
  me: SessionUser | null;
  onExit: () => void;
  children: (ctx: RenderCtx) => React.ReactNode;
};

/**
 * Shared wrapper for every game: back button, difficulty picker (for games that
 * have one), personal-record display, and score persistence on finish. Individual
 * games only render their board and call `finish(score)` when the game ends.
 */
export default function GameShell({ title, emoji, game, me, onExit, children }: Props) {
  const difficulties = DIFFICULTIES_BY_GAME[game];
  const [difficulty, setDifficulty] = useState<GameDifficulty | null>(null);
  const [record, setRecord] = useState<number | null>(null);
  const ready = difficulties === null || difficulty !== null;

  useEffect(() => {
    if (!me || !ready) return;
    let cancelled = false;
    fetch(`/api/games/score?game=${game}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d) return;
        const row = (d.bests as { difficulty: string | null; bestScore: number }[]).find(
          (b) => b.difficulty === difficulty
        );
        setRecord(row?.bestScore ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [me, game, difficulty, ready]);

  const finish = (score: number) => {
    if (!me) {
      toast("Connecte-toi pour garder ton record 🔒");
      return;
    }
    void fetch("/api/games/score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ game, difficulty: difficulty ?? undefined, score }),
    })
      .then((r) => r.json())
      .then((body) => {
        if (body?.isNewRecord) {
          setRecord(body.bestScore);
          toast("Nouveau record ! 🎉");
        }
      })
      .catch(() => {
        /* non-fatal — the game already ended client-side */
      });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      transition={{ duration: 0.22 }}
      className="absolute inset-0 z-[1000] overflow-y-auto bg-cream"
    >
      <div className="mx-auto max-w-lg px-4 pb-32 pt-6">
        <div className="mb-4 flex items-center gap-3">
          <button
            onClick={onExit}
            className="sticker-sm sticker-press shrink-0 rounded-xl px-3 py-2 text-xs font-extrabold transition hover:bg-blush"
          >
            🚪 Sortir
          </button>
          <h1 className="flex-1 text-center font-display text-xl font-extrabold tracking-tight">
            {emoji} {title}
          </h1>
        </div>

        {record !== null && (
          <p className="mb-3 text-center text-xs font-bold text-ink/50">Ton record : {formatScore(game, record)}</p>
        )}

        {!ready && difficulties ? (
          <div className="sticker space-y-3 rounded-[24px] p-5">
            <p className="text-center text-sm font-bold text-ink/70">Choisis ta difficulté</p>
            {difficulties.map((d) => (
              <button
                key={d}
                onClick={() => setDifficulty(d)}
                className="sticker-sm sticker-press block w-full rounded-xl px-4 py-2.5 text-sm font-extrabold transition hover:bg-blush"
              >
                {DIFFICULTY_LABEL[d]}
              </button>
            ))}
          </div>
        ) : (
          children({ difficulty, finish })
        )}
      </div>
    </motion.div>
  );
}
