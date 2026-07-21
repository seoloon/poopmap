"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { SessionUser } from "@/lib/types";
import { toast } from "./Toasts";

type View = "login" | "register";

type Props = {
  open: boolean;
  onClose: () => void;
  onAuthed: (u: SessionUser) => void;
};

const inputCls =
  "w-full rounded-xl border-2 border-ink bg-white px-3.5 py-2.5 text-sm font-semibold outline-none transition focus:border-teal focus:ring-4 focus:ring-teal/15";

export default function AuthModal({ open, onClose, onAuthed }: Props) {
  const [view, setView] = useState<View>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [pseudo, setPseudo] = useState("");
  const [busy, setBusy] = useState(false);

  const post = async (action: string, body: Record<string, string>) => {
    const res = await fetch(`/api/auth/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "Une erreur est survenue");
    return data;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (view === "login") {
        const data = await post("login", { username, password });
        toast(`Re-bienvenue, ${data.user.pseudo} ! 👋`);
        onAuthed(data.user);
      } else {
        const data = await post("register", { username, password, pseudo });
        toast(`Compte créé — bienvenue ${data.user.pseudo} ! 🎉`);
        onAuthed(data.user);
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "Erreur inconnue", "err");
    } finally {
      setBusy(false);
    }
  };

  const titles: Record<View, string> = {
    login: "Connexion",
    register: "Créer un compte",
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[1100] flex items-end justify-center bg-ink/50 p-0 backdrop-blur-[2px] sm:items-center sm:p-6"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 56, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ duration: 0.32, ease: [0.22, 1.2, 0.36, 1] }}
            className="sticker w-full max-w-md rounded-b-none p-6 sm:rounded-b-[24px]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-2xl font-extrabold">
                <span className="mr-2 inline-block hover:animate-wiggle">🚽</span>
                {titles[view]}
              </h2>
              <button
                onClick={onClose}
                className="grid h-9 w-9 place-items-center rounded-full border-2 border-ink bg-white font-black transition hover:rotate-90 hover:bg-blush"
                aria-label="Fermer"
              >
                ✕
              </button>
            </div>

            <div className="mb-4 grid grid-cols-2 gap-2">
              {(["login", "register"] as View[]).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`rounded-xl border-2 border-ink px-3 py-2 text-sm font-extrabold transition ${
                    view === v ? "bg-signage shadow-[3px_3px_0_#1a1a1a]" : "bg-white hover:bg-blush"
                  }`}
                >
                  {v === "login" ? "J'ai un compte" : "Je m'inscris"}
                </button>
              ))}
            </div>

            <form onSubmit={submit} className="space-y-3">
              <input
                type="text"
                required
                minLength={3}
                maxLength={20}
                placeholder="Identifiant"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className={inputCls}
              />
              {view === "register" && (
                <input
                  required
                  minLength={2}
                  maxLength={24}
                  placeholder="Pseudo (visible sur tes avis)"
                  value={pseudo}
                  onChange={(e) => setPseudo(e.target.value)}
                  className={inputCls}
                />
              )}
              <input
                type="password"
                required
                minLength={view === "register" ? 8 : undefined}
                placeholder="Mot de passe"
                autoComplete={view === "login" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputCls}
              />

              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-xl border-2 border-ink bg-teal px-4 py-3 font-display text-lg font-extrabold text-white shadow-[4px_4px_0_#1a1a1a] transition hover:-translate-y-0.5 hover:bg-teal-dark active:translate-y-0 disabled:opacity-60"
              >
                {busy ? "Une seconde…" : view === "login" ? "C'est parti ! 🚀" : "Créer mon compte ✨"}
              </button>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
