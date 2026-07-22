"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { REPORT_CATEGORIES } from "@/lib/types";
import type { ReportCategory } from "@/lib/types";
import { toast } from "./Toasts";

type Props = {
  open: boolean;
  toiletId: number;
  toiletName: string | null;
  onClose: () => void;
};

const inputCls =
  "w-full rounded-xl border-2 border-ink bg-white px-3.5 py-2.5 text-sm font-semibold outline-none transition focus:border-teal focus:ring-4 focus:ring-teal/15";

export default function ReportModal({ open, toiletId, toiletName, onClose }: Props) {
  const [category, setCategory] = useState<ReportCategory | null>(null);
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  const requiresDescription = category === "other";
  const canSubmit = category !== null && (!requiresDescription || description.trim().length >= 3);

  const reset = () => {
    setCategory(null);
    setDescription("");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!category) return;
    setBusy(true);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toiletId, category, description: description.trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Erreur lors du signalement");
      toast("Merci, notre équipe va vérifier ça 🕵️");
      reset();
      onClose();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Erreur inconnue", "err");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[1150] flex items-end justify-center bg-ink/50 backdrop-blur-[2px] sm:items-center sm:p-6"
          onClick={() => {
            reset();
            onClose();
          }}
        >
          <motion.div
            initial={{ y: 56, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ duration: 0.32, ease: [0.22, 1.2, 0.36, 1] }}
            className="sticker max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-b-none p-6 sm:rounded-b-[24px]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-2xl font-extrabold">
                <span className="mr-2 inline-block">🚩</span>
                Signaler ce spot
              </h2>
              <button
                onClick={() => {
                  reset();
                  onClose();
                }}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full border-2 border-ink bg-white font-black transition hover:rotate-90 hover:bg-blush"
                aria-label="Fermer"
              >
                ✕
              </button>
            </div>

            {toiletName && <p className="mb-3 text-xs font-bold text-ink/60">📍 {toiletName}</p>}

            <form onSubmit={submit} className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                {REPORT_CATEGORIES.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setCategory(c.value)}
                    className={`rounded-xl border-2 border-ink px-2.5 py-2.5 text-left text-xs font-extrabold leading-tight transition ${
                      category === c.value ? "bg-signage shadow-[3px_3px_0_#1a1a1a]" : "bg-white hover:bg-blush"
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>

              <textarea
                rows={3}
                maxLength={600}
                placeholder={requiresDescription ? "Explique un peu ce qui se passe (requis pour « Autre »)" : "Détails (optionnel)"}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className={`${inputCls} resize-none`}
              />

              <button
                type="submit"
                disabled={busy || !canSubmit}
                className="w-full rounded-xl border-2 border-ink bg-red-600 px-4 py-3 font-display text-lg font-extrabold text-white shadow-[4px_4px_0_#1a1a1a] transition hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60"
              >
                {busy ? "Envoi…" : "🚩 Envoyer le signalement"}
              </button>
              <p className="text-center text-[11px] font-semibold text-ink/60">Notre équipe de modération vérifie chaque signalement.</p>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
