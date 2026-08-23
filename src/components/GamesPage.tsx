"use client";

import { motion } from "framer-motion";

/** Placeholder tab — reserves the nav slot until the mini-games ship. */
export default function GamesPage() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      transition={{ duration: 0.22 }}
      className="absolute inset-0 z-[1000] overflow-y-auto bg-cream"
    >
      <div className="mx-auto max-w-lg px-4 pb-32 pt-6">
        <h1 className="mb-4 font-display text-2xl font-extrabold tracking-tight">🎮 Jeux</h1>
        <div className="sticker space-y-2 rounded-[24px] p-5 text-center">
          <p className="text-3xl" aria-hidden>
            🚧
          </p>
          <p className="text-sm font-bold text-ink/70">Bientôt disponible — de quoi s&apos;occuper aux toilettes 💩</p>
        </div>
      </div>
    </motion.div>
  );
}
