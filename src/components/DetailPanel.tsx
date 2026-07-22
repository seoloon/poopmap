"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Review, SessionUser, ToiletDetail, ToiletPin } from "@/lib/types";
import { compressImage } from "@/lib/image";
import { directionsUrl } from "@/lib/navigation";
import { toast } from "./Toasts";

const NAV_LABELS = [
  "🚀 Lancer l'opération",
  "👑 En route vers le trône",
  "💨 Mode turbo : on fonce !",
  "🧻 Mission délivrance",
  "⚓ Larguer les amarres",
  "🐎 Au galop, cowboy !",
  "🚨 Urgence niveau 4 : GO !",
];

const CRITERIA = [
  { key: "proprete", label: "Propreté", emoji: "🧼", bar: "bg-sage-dark", hint: ["biohazard", "douteux", "correct", "propre", "bloc opératoire"] },
  { key: "confort", label: "Confort", emoji: "🛋️", bar: "bg-terracotta", hint: ["spartiate", "bof", "ok", "cozy", "palace royal"] },
  { key: "experience", label: "Expérience", emoji: "✨", bar: "bg-teal", hint: ["traumatisante", "anecdotique", "neutre", "agréable", "extatique"] },
] as const;

function relDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  return `il y a ${d} j`;
}

function PoopScale({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className={`text-xl transition-transform hover:scale-125 ${n <= value ? "" : "opacity-25 grayscale"}`}
          aria-label={`${n} sur 5`}
        >
          💩
        </button>
      ))}
    </div>
  );
}

const avatarColors = ["#0e7c66", "#e58c6a", "#b91c1c", "#2563eb", "#7c3aed", "#db2777", "#8fc26a"];
const colorFor = (name: string) => avatarColors[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % avatarColors.length];

type Props = {
  /** Lean pin data — already available instantly, no fetch needed for these fields. */
  pin: ToiletPin;
  me: SessionUser | null;
  onClose: () => void;
  onPosted: () => void;
  onLoginClick: () => void;
};

export default function DetailPanel({ pin, me, onClose, onPosted, onLoginClick }: Props) {
  const [detail, setDetail] = useState<ToiletDetail | null>(null);
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [notes, setNotes] = useState({ proprete: 0, confort: 0, experience: 0 });
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [completeName, setCompleteName] = useState("");
  const [completeAddress, setCompleteAddress] = useState("");
  const [completeComment, setCompleteComment] = useState("");
  const [completePhotos, setCompletePhotos] = useState<string[]>([]);
  const [completeBusy, setCompleteBusy] = useState(false);
  const completeFileRef = useRef<HTMLInputElement>(null);

  const navLabel = useMemo(
    () => NAV_LABELS[Math.floor(Math.random() * NAV_LABELS.length)],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pin.id]
  );

  const load = useCallback(async () => {
    const [detailRes, reviewsRes] = await Promise.all([
      fetch(`/api/toilets/${pin.id}`),
      fetch(`/api/toilets/${pin.id}/reviews`),
    ]);
    if (detailRes.ok) setDetail((await detailRes.json()).toilet);
    if (reviewsRes.ok) setReviews((await reviewsRes.json()).reviews);
  }, [pin.id]);

  useEffect(() => {
    setDetail(null);
    setReviews(null);
    setShowForm(false);
    setNotes({ proprete: 0, confort: 0, experience: 0 });
    setComment("");
    setCompleteName("");
    setCompleteAddress("");
    setCompleteComment("");
    setCompletePhotos([]);
    void load();
  }, [load]);

  const submitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch(`/api/toilets/${pin.id}/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...notes, comment }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Erreur");
      toast("Merci pour ton avis, la communauté te remercie 💩✨");
      setNotes({ proprete: 0, confort: 0, experience: 0 });
      setComment("");
      setShowForm(false);
      await load();
      onPosted();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Erreur inconnue", "err");
    } finally {
      setBusy(false);
    }
  };

  const needsName = detail !== null && detail.name === null;
  const needsAddress = detail !== null && detail.address === null;
  const needsComment = detail !== null && detail.description === null;
  const needsPhotos = detail !== null && detail.photos.length === 0;
  const needsAnything = needsName || needsAddress || needsComment || needsPhotos;

  const onCompleteFiles = async (files: FileList | null) => {
    if (!files) return;
    const remaining = 3 - completePhotos.length;
    const picked = Array.from(files).slice(0, remaining);
    try {
      const compressed = await Promise.all(picked.map((f) => compressImage(f)));
      setCompletePhotos((p) => [...p, ...compressed].slice(0, 3));
    } catch {
      toast("Impossible de lire cette image", "err");
    }
  };

  const canSubmitComplete =
    (needsName && completeName.trim().length >= 3) ||
    (needsAddress && completeAddress.trim().length > 0) ||
    (needsComment && completeComment.trim().length > 0) ||
    (needsPhotos && completePhotos.length > 0);

  const submitComplete = async (e: React.FormEvent) => {
    e.preventDefault();
    setCompleteBusy(true);
    try {
      const body: Record<string, unknown> = {};
      if (needsName && completeName.trim().length >= 3) body.name = completeName.trim();
      if (needsAddress && completeAddress.trim()) body.address = completeAddress.trim();
      if (needsComment && completeComment.trim()) body.comment = completeComment.trim();
      if (needsPhotos && completePhotos.length > 0) body.photos = completePhotos;
      const res = await fetch(`/api/toilets/${pin.id}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Erreur");
      toast("Merci, ta complétion part en modération 🕵️");
      setCompleteName("");
      setCompleteAddress("");
      setCompleteComment("");
      setCompletePhotos([]);
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Erreur inconnue", "err");
    } finally {
      setCompleteBusy(false);
    }
  };

  const kindBadge =
    pin.kind === "gratuit"
      ? { txt: "🆓 Gratuit", cls: "bg-sage/40 text-teal-dark" }
      : pin.kind === "payant"
        ? { txt: `💰 Payant${detail?.price ? ` · ${detail.price}` : ""}`, cls: "bg-terracotta/25 text-terracotta-dark" }
        : { txt: "☕ Commerce", cls: "bg-sky-100 text-sky-800" };

  const filled = Math.round(pin.score);
  const allNoted = notes.proprete > 0 && notes.confort > 0 && notes.experience > 0;

  return (
    <motion.aside
      initial={{ y: 56, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 40, opacity: 0 }}
      transition={{ duration: 0.32, ease: [0.22, 1.2, 0.36, 1] }}
      className="sticker fixed inset-x-0 bottom-0 z-[1001] flex max-h-[80dvh] flex-col rounded-b-none md:inset-x-auto md:bottom-4 md:right-4 md:top-20 md:max-h-none md:w-[400px] md:rounded-[24px]"
    >
      {/* Mobile drag handle */}
      <div className="flex justify-center pt-2 md:hidden">
        <div className="h-1.5 w-14 rounded-full bg-ink/20" />
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            {detail ? (
              <h2 className="font-display text-[22px] font-extrabold leading-tight">
                {detail.name ?? <span className="italic text-ink/40">Toilette sans nom</span>}
              </h2>
            ) : (
              <div className="h-6 w-40 animate-pulse rounded-lg bg-ink/10" />
            )}
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-extrabold ${kindBadge.cls}`}>{kindBadge.txt}</span>
              {pin.mine && (
                <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-[11px] font-extrabold text-blue-800">
                  ⏳ En attente de validation
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border-2 border-ink bg-white font-black transition hover:rotate-90 hover:bg-blush"
            aria-label="Fermer"
          >
            ✕
          </button>
        </div>

        {/* Overall score */}
        <div className="flex items-center gap-3 rounded-xl border-2 border-ink bg-blush/70 px-4 py-3">
          <span className="font-display text-4xl font-extrabold leading-none">
            {pin.reviewCount > 0 ? pin.score.toFixed(1) : "—"}
          </span>
          <div>
            <div className="text-sm leading-none tracking-tight">
              {[1, 2, 3, 4, 5].map((n) => (
                <span key={n} className={n <= filled ? "" : "opacity-25 grayscale"}>
                  💩
                </span>
              ))}
            </div>
            <p className="mt-1 text-[11px] font-bold text-ink/60">
              {pin.reviewCount > 0
                ? `${pin.reviewCount} avis · moyenne des 3 critères`
                : "Aucun avis — la porcelaine est encore tiède"}
            </p>
          </div>
        </div>

        {/* Segmented rating bars, one color per criterion */}
        <div className="space-y-2">
          {CRITERIA.map((c) => {
            const val = detail ? (c.key === "proprete" ? detail.avgP : c.key === "confort" ? detail.avgC : detail.avgE) : null;
            return (
              <div key={c.key} className="flex items-center gap-2.5">
                <span className="w-6 text-center text-lg">{c.emoji}</span>
                <span className="w-24 text-xs font-extrabold uppercase tracking-wide text-ink/70">{c.label}</span>
                <div className="h-3 flex-1 overflow-hidden rounded-full border-2 border-ink/20 bg-white">
                  {val !== null && (
                    <motion.div
                      className={`h-full rounded-full ${c.bar}`}
                      initial={{ width: 0 }}
                      animate={{ width: `${(val / 5) * 100}%` }}
                      transition={{ duration: 0.7, ease: "easeOut" }}
                    />
                  )}
                </div>
                <span className="w-8 text-right text-xs font-black">{val ? val.toFixed(1) : val === 0 ? "—" : ""}</span>
              </div>
            );
          })}
        </div>

        {/* Fun navigation button */}
        <a
          href={directionsUrl(pin.lat, pin.lng)}
          target="_blank"
          rel="noreferrer"
          className="block w-full rounded-xl border-2 border-ink bg-signage px-4 py-3.5 text-center font-display text-lg font-extrabold shadow-[4px_4px_0_#1a1a1a] transition hover:-translate-y-0.5 hover:shadow-[6px_6px_0_#1a1a1a] active:translate-y-0"
        >
          {navLabel}
        </a>

        {detail && detail.photos.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-extrabold uppercase tracking-wide text-ink/60">📸 Photos du référençeur</p>
            <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
              {detail.photos.map((p, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={p.id}
                  src={p.url}
                  alt={`${detail.name ?? "Toilette"} — photo ${i + 1}`}
                  className="h-28 w-40 shrink-0 rounded-xl border-2 border-ink object-cover transition hover:scale-[1.03] hover:rotate-1"
                />
              ))}
            </div>
          </div>
        )}

        {detail && needsAnything && detail.myCompletionStatus === "pending" && (
          <div className="rounded-xl border-2 border-dashed border-blue-400 bg-blue-50 p-3.5 text-center">
            <p className="text-xs font-extrabold text-blue-800">⏳ Ta complétion est en attente de validation</p>
          </div>
        )}
        {detail && needsAnything && detail.myCompletionStatus !== "pending" && (
          <div className="rounded-xl border-2 border-dashed border-teal bg-teal/5 p-3.5">
            {detail.myCompletionStatus === "rejected" && (
              <p className="mb-2 text-xs font-extrabold text-red-700">
                🚫 Ta dernière complétion a été refusée par la modération — tu peux réessayer ci-dessous.
              </p>
            )}
              <p className="mb-2 text-xs font-extrabold uppercase tracking-wide text-teal-dark">
                🧩 Aide à compléter ce spot
              </p>
              {!me ? (
                <p className="text-xs font-bold text-ink/60">
                  <button onClick={onLoginClick} className="underline decoration-dotted">
                    Connecte-toi
                  </button>{" "}
                  pour compléter ce spot — ta proposition sera vérifiée par la modération.
                </p>
              ) : (
                <form onSubmit={submitComplete} className="space-y-2.5">
                  {needsName && (
                    <input
                      minLength={3}
                      maxLength={80}
                      placeholder="Nom de ce petit coin"
                      value={completeName}
                      onChange={(e) => setCompleteName(e.target.value)}
                      className="w-full rounded-xl border-2 border-ink bg-white px-3 py-2 text-sm font-semibold outline-none focus:border-teal"
                    />
                  )}
                  {needsAddress && (
                    <input
                      maxLength={160}
                      placeholder="Adresse / point de repère"
                      value={completeAddress}
                      onChange={(e) => setCompleteAddress(e.target.value)}
                      className="w-full rounded-xl border-2 border-ink bg-white px-3 py-2 text-sm font-semibold outline-none focus:border-teal"
                    />
                  )}
                  {needsComment && (
                    <textarea
                      rows={2}
                      maxLength={600}
                      placeholder="Un commentaire utile (accès, code porte…)"
                      value={completeComment}
                      onChange={(e) => setCompleteComment(e.target.value)}
                      className="w-full resize-none rounded-xl border-2 border-ink bg-white px-3 py-2 text-sm font-semibold outline-none focus:border-teal"
                    />
                  )}
                  {needsPhotos && (
                  <div className="flex gap-2">
                    {completePhotos.map((p, i) => (
                      <div key={i} className="relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={p} alt="" className="h-16 w-16 rounded-lg border-2 border-ink object-cover" />
                        <button
                          type="button"
                          onClick={() => setCompletePhotos((arr) => arr.filter((_, j) => j !== i))}
                          className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full border-2 border-ink bg-red-500 text-[9px] font-black text-white"
                          aria-label="Supprimer la photo"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                    {completePhotos.length < 3 && (
                      <button
                        type="button"
                        onClick={() => completeFileRef.current?.click()}
                        className="grid h-16 w-16 place-items-center rounded-lg border-2 border-dashed border-ink/50 text-xl transition hover:border-ink hover:bg-blush"
                        aria-label="Ajouter une photo"
                      >
                        +
                      </button>
                    )}
                    <input
                      ref={completeFileRef}
                      type="file"
                      accept="image/*"
                      multiple
                      hidden
                      onChange={(e) => {
                        void onCompleteFiles(e.target.files);
                        e.target.value = "";
                      }}
                    />
                  </div>
                )}
                <button
                  type="submit"
                  disabled={completeBusy || !canSubmitComplete}
                  className="w-full rounded-xl border-2 border-ink bg-teal px-3 py-2 text-sm font-extrabold text-white shadow-[3px_3px_0_#1a1a1a] transition hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0"
                >
                  {completeBusy ? "Envoi…" : "Compléter ✅"}
                </button>
              </form>
            )}
          </div>
        )}

        {detail?.address && <p className="text-xs font-bold text-ink/70">📍 {detail.address}</p>}
        {detail?.description && (
          <p className="rounded-xl border-2 border-dashed border-ink/30 bg-white px-3 py-2 text-sm font-semibold italic text-ink/80">
            &ldquo;{detail.description}&rdquo;
          </p>
        )}
        {detail ? (
          <p className="text-[11px] font-bold text-ink/50">
            Référencé par <span className="text-ink/80">{detail.createdByPseudo}</span> · {relDate(detail.createdAt)}
          </p>
        ) : (
          <div className="h-3 w-32 animate-pulse rounded bg-ink/10" />
        )}

        <div>
          <p className="mb-2 text-xs font-extrabold uppercase tracking-wide text-ink/60">🗣️ Les 5 derniers avis</p>
          {reviews === null ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-xl bg-ink/10" />
              ))}
            </div>
          ) : reviews.length === 0 ? (
            <p className="rounded-xl bg-white px-3 py-3 text-center text-sm font-bold text-ink/50">
              Personne n&apos;a encore tiré la chasse ici… sois le premier ! 🫵
            </p>
          ) : (
            <ul className="space-y-2.5">
              {reviews.map((r) => {
                const avg = (r.proprete + r.confort + r.experience) / 3;
                return (
                  <li key={r.id} className="rounded-xl border-2 border-ink/15 bg-white p-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="grid h-7 w-7 shrink-0 place-items-center rounded-full font-display text-sm font-extrabold text-white"
                        style={{ background: colorFor(r.pseudo) }}
                      >
                        {r.pseudo[0]?.toUpperCase()}
                      </span>
                      <span className="text-sm font-extrabold">{r.pseudo}</span>
                      {r.mine && <span className="rounded-full bg-blush px-1.5 text-[10px] font-extrabold">toi</span>}
                      <span className="ml-auto text-[10px] font-bold text-ink/50">{relDate(r.createdAt)}</span>
                    </div>
                    <p className="mt-1 text-xs font-bold">
                      <span className="tracking-tight">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <span key={n} className={n <= Math.round(avg) ? "" : "opacity-20 grayscale"}>
                            💩
                          </span>
                        ))}
                      </span>
                      <span className="ml-1.5 text-ink/60">
                        🧼{r.proprete} 🛋️{r.confort} ✨{r.experience}
                      </span>
                    </p>
                    {r.comment && <p className="mt-1 text-sm font-semibold text-ink/85">{r.comment}</p>}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <AnimatePresence mode="wait">
          {showForm ? (
            <motion.form
              key="form"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              onSubmit={submitReview}
              className="space-y-3 overflow-hidden rounded-xl border-2 border-ink bg-blush/50 p-3.5"
            >
              <p className="font-display text-lg font-extrabold">Note ce petit coin</p>
              {CRITERIA.map((c) => (
                <div key={c.key} className="flex items-center justify-between gap-2">
                  <span className="text-xs font-extrabold uppercase tracking-wide text-ink/70">
                    {c.emoji} {c.label}
                  </span>
                  <div className="flex flex-col items-end">
                    <PoopScale value={notes[c.key]} onChange={(v) => setNotes((s) => ({ ...s, [c.key]: v }))} />
                    <span className="text-[10px] font-bold text-ink/50">
                      {notes[c.key] > 0 ? c.hint[notes[c.key] - 1] : "…"}
                    </span>
                  </div>
                </div>
              ))}
              <textarea
                rows={2}
                maxLength={600}
                placeholder="Ton verdict (optionnel) : « papier doux, vue imprenable… »"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                className="w-full resize-none rounded-xl border-2 border-ink bg-white px-3 py-2 text-sm font-semibold outline-none focus:border-teal"
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={busy || !allNoted}
                  className="flex-1 rounded-xl border-2 border-ink bg-teal px-4 py-2.5 font-display font-extrabold text-white shadow-[3px_3px_0_#1a1a1a] transition hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0"
                >
                  {busy ? "Envoi…" : "Publier mon avis 💩"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="rounded-xl border-2 border-ink bg-white px-3 font-extrabold hover:bg-blush"
                >
                  ✕
                </button>
              </div>
            </motion.form>
          ) : (
            <motion.button
              key="cta"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => (me ? setShowForm(true) : onLoginClick())}
              className="w-full rounded-xl border-2 border-ink bg-white px-4 py-3 font-display text-lg font-extrabold shadow-[4px_4px_0_#1a1a1a] transition hover:-translate-y-0.5 hover:bg-blush"
            >
              ✍️ Laisser un avis
            </motion.button>
          )}
        </AnimatePresence>
        {!me && !showForm && (
          <p className="-mt-2 text-center text-[11px] font-bold text-ink/50">
            <button onClick={onLoginClick} className="underline decoration-dotted">
              Connecte-toi
            </button>{" "}
            pour laisser un avis
          </p>
        )}
      </div>
    </motion.aside>
  );
}
