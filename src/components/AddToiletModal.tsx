"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { ToiletKind, SessionUser } from "@/lib/types";
import { compressImage } from "@/lib/image";
import { toast } from "./Toasts";

type Props = {
  open: boolean;
  pos: { lat: number; lng: number } | null;
  me: SessionUser | null;
  onClose: () => void;
  onDone: () => void;
  onPickOnMap: () => void;
  onUseMyLocation: () => void;
};

const inputCls =
  "w-full rounded-xl border-2 border-ink bg-white px-3.5 py-2.5 text-sm font-semibold outline-none transition focus:border-teal focus:ring-4 focus:ring-teal/15";

const KINDS: { value: ToiletKind; label: string }[] = [
  { value: "gratuit", label: "🆓 Gratuit" },
  { value: "payant", label: "💰 Payant" },
  { value: "commerce", label: "☕ Commerce" },
];

export default function AddToiletModal({ open, pos, me, onClose, onDone, onPickOnMap, onUseMyLocation }: Props) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<ToiletKind>("gratuit");
  const [price, setPrice] = useState("");
  const [address, setAddress] = useState("");
  const [description, setDescription] = useState("");
  const [pseudo, setPseudo] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const onFiles = async (files: FileList | null) => {
    if (!files) return;
    const remaining = 3 - photos.length;
    const picked = Array.from(files).slice(0, remaining);
    try {
      const compressed = await Promise.all(picked.map((f) => compressImage(f)));
      setPhotos((p) => [...p, ...compressed].slice(0, 3));
    } catch {
      toast("Impossible de lire cette image", "err");
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pos) return;
    setBusy(true);
    try {
      const res = await fetch("/api/toilets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, lat: pos.lat, lng: pos.lng, kind, price, address, description, pseudo, photos }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Erreur lors de l'ajout");
      toast("Merci ! Nos inspecteurs vérifient ton spot 🕵️✨");
      setName("");
      setPrice("");
      setAddress("");
      setDescription("");
      setPseudo("");
      setPhotos([]);
      setKind("gratuit");
      onDone();
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
          className="fixed inset-0 z-[1100] flex items-end justify-center bg-ink/50 backdrop-blur-[2px] sm:items-center sm:p-6"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 56, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ duration: 0.32, ease: [0.22, 1.2, 0.36, 1] }}
            className="sticker max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-b-none p-6 sm:rounded-b-[24px]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-2xl font-extrabold">
                <span className="mr-2 inline-block hover:animate-wiggle">🧻</span>
                Référencer un petit coin
              </h2>
              <button
                onClick={onClose}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full border-2 border-ink bg-white font-black transition hover:rotate-90 hover:bg-blush"
                aria-label="Fermer"
              >
                ✕
              </button>
            </div>

            {!pos ? (
              <div className="space-y-3">
                <p className="text-sm font-semibold text-ink/80">
                  D&apos;abord, indique où se trouve ce trésor de porcelaine :
                </p>
                <button
                  onClick={onPickOnMap}
                  className="w-full rounded-xl border-2 border-ink bg-signage px-4 py-3.5 font-display text-lg font-extrabold shadow-[4px_4px_0_#1a1a1a] transition hover:-translate-y-0.5"
                >
                  🎯 Placer le marqueur sur la carte
                </button>
                <button
                  onClick={onUseMyLocation}
                  className="w-full rounded-xl border-2 border-ink bg-white px-4 py-3.5 font-display text-lg font-extrabold shadow-[4px_4px_0_#1a1a1a] transition hover:-translate-y-0.5 hover:bg-blush"
                >
                  📍 Je suis juste devant !
                </button>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-3">
                <div className="flex items-center justify-between rounded-xl border-2 border-dashed border-teal bg-teal/10 px-3 py-2 text-xs font-bold text-teal-dark">
                  <span>
                    📍 Position : {pos.lat.toFixed(5)}, {pos.lng.toFixed(5)}
                  </span>
                  <button type="button" onClick={onPickOnMap} className="underline decoration-dotted">
                    déplacer
                  </button>
                </div>

                <input
                  required
                  minLength={3}
                  maxLength={80}
                  placeholder="Nom du spot (ex : WC de la Gare)"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={inputCls}
                />

                <div className="grid grid-cols-3 gap-2">
                  {KINDS.map((k) => (
                    <button
                      key={k.value}
                      type="button"
                      onClick={() => setKind(k.value)}
                      className={`rounded-xl border-2 border-ink px-2 py-2 text-xs font-extrabold transition ${
                        kind === k.value ? "bg-signage shadow-[3px_3px_0_#1a1a1a]" : "bg-white hover:bg-blush"
                      }`}
                    >
                      {k.label}
                    </button>
                  ))}
                </div>

                {kind === "payant" && (
                  <input
                    maxLength={32}
                    placeholder="Prix (ex : 0,70 € — les pièces de 5 ct acceptées ?)"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    className={inputCls}
                  />
                )}

                <input
                  maxLength={160}
                  placeholder="Adresse / point de repère (optionnel)"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className={inputCls}
                />
                <textarea
                  rows={2}
                  maxLength={600}
                  placeholder="Petits conseils d'accès, code porte, anecdotes…"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className={`${inputCls} resize-none`}
                />

                <div>
                  <p className="mb-1.5 text-xs font-extrabold uppercase tracking-wide text-ink/60">
                    Photos du spot ({photos.length}/3) — par toi, le référençeur 📸
                  </p>
                  <div className="flex gap-2">
                    {photos.map((p, i) => (
                      <div key={i} className="relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={p} alt={`photo ${i + 1}`} className="h-20 w-20 rounded-xl border-2 border-ink object-cover" />
                        <button
                          type="button"
                          onClick={() => setPhotos((arr) => arr.filter((_, j) => j !== i))}
                          className="absolute -right-2 -top-2 grid h-6 w-6 place-items-center rounded-full border-2 border-ink bg-red-500 text-[10px] font-black text-white"
                          aria-label="Supprimer la photo"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                    {photos.length < 3 && (
                      <button
                        type="button"
                        onClick={() => fileRef.current?.click()}
                        className="grid h-20 w-20 place-items-center rounded-xl border-2 border-dashed border-ink/50 text-2xl transition hover:border-ink hover:bg-blush"
                        aria-label="Ajouter une photo"
                      >
                        +
                      </button>
                    )}
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/*"
                      multiple
                      hidden
                      onChange={(e) => {
                        void onFiles(e.target.files);
                        e.target.value = "";
                      }}
                    />
                  </div>
                </div>

                {!me && (
                  <input
                    required
                    minLength={2}
                    maxLength={24}
                    placeholder="Ton pseudo de référençeur"
                    value={pseudo}
                    onChange={(e) => setPseudo(e.target.value)}
                    className={inputCls}
                  />
                )}

                <button
                  type="submit"
                  disabled={busy}
                  className="w-full rounded-xl border-2 border-ink bg-teal px-4 py-3 font-display text-lg font-extrabold text-white shadow-[4px_4px_0_#1a1a1a] transition hover:-translate-y-0.5 hover:bg-teal-dark active:translate-y-0 disabled:opacity-60"
                >
                  {busy ? "Envoi en cours…" : "Envoyer en validation 🚀"}
                </button>
                <p className="text-center text-[11px] font-semibold text-ink/60">
                  Ton spot apparaîtra pour tout le monde après validation par l&apos;équipe 🕵️
                </p>
              </form>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
