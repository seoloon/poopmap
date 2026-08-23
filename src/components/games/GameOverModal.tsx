"use client";

import { motion } from "framer-motion";

type Stat = { label: string; value: string };

type Props = {
  stats: Stat[];
  onReplay: () => void;
  onQuit: () => void;
};

/** Shared loss screen for every game that can end in defeat (2048, Démineur, Tetris) —
 * Sudoku has no lose state, so it never renders this. */
export default function GameOverModal({ stats, onReplay, onQuit }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.16 }}
      className="fixed inset-0 z-[2100] flex items-center justify-center bg-ink/50 p-4"
    >
      <motion.div
        initial={{ y: 24, opacity: 0, scale: 0.92 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 24, opacity: 0, scale: 0.92 }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
        className="sticker w-full max-w-xs rounded-[24px] p-6 text-center"
      >
        <motion.h2
          initial={{ scale: 0.6, rotate: -6 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 12, delay: 0.1 }}
          className="font-display text-3xl font-extrabold uppercase tracking-tight text-red-600"
        >
          Game Over 💩
        </motion.h2>

        <div className="mt-4 space-y-1.5">
          {stats.map((s) => (
            <p key={s.label} className="text-sm font-bold text-ink/70">
              {s.label} : <span className="font-extrabold text-ink">{s.value}</span>
            </p>
          ))}
        </div>

        <div className="mt-5 space-y-2">
          <button
            onClick={onReplay}
            className="sticker-sm sticker-press w-full rounded-xl bg-signage px-4 py-2.5 text-sm font-extrabold"
          >
            🔁 Rejouer
          </button>
          <button
            onClick={onQuit}
            className="sticker-sm sticker-press w-full rounded-xl bg-white px-4 py-2.5 text-sm font-extrabold transition hover:bg-blush"
          >
            🚪 Quitter
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
