"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { AppNotification, SessionUser } from "@/lib/types";

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

const STATUS_EMOJI: Record<AppNotification["status"], string> = { approved: "✅", rejected: "❌", partial: "⚠️" };

export default function NotificationBell({ me }: { me: SessionUser | null }) {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/notifications?limit=20", { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    setItems(data.items);
    setUnread(data.unread);
    setLoaded(true);
  }, []);

  // Fetch on login, then a light poll while the tab is visible — moderation happens
  // out of band, so there's no other signal that a new outcome landed.
  useEffect(() => {
    if (!me) return;
    void load();
    let iv: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (iv === null) iv = setInterval(() => void load(), 45_000);
    };
    const stop = () => {
      if (iv !== null) {
        clearInterval(iv);
        iv = null;
      }
    };
    const onVis = () => (document.visibilityState === "visible" ? (void load(), start()) : stop());
    start();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [me, load]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!me) return null;

  const markAllRead = async () => {
    setItems((list) => list.map((n) => ({ ...n, read: true })));
    setUnread(0);
    await fetch("/api/notifications/read", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ all: true }) });
  };

  const markOneRead = (n: AppNotification) => {
    if (n.read) return;
    setItems((list) => list.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
    setUnread((u) => Math.max(0, u - 1));
    void fetch("/api/notifications/read", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: n.id }) });
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="sticker-sm sticker-press relative grid h-10 w-10 place-items-center rounded-xl text-lg transition hover:-translate-y-0.5"
        aria-label="Notifications"
        title="Notifications"
      >
        🔔
        {unread > 0 && (
          <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-[20px] place-items-center rounded-full border-2 border-ink bg-signage px-1 font-display text-[10px] font-extrabold leading-none">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.18 }}
            className="sticker absolute right-0 top-[calc(100%+10px)] z-[1200] flex max-h-[70dvh] w-[92vw] max-w-sm flex-col overflow-hidden"
          >
            <div className="flex items-center justify-between border-b-2 border-ink bg-blush/60 px-4 py-3">
              <p className="font-display text-base font-extrabold">🔔 Notifications</p>
              {unread > 0 && (
                <button onClick={() => void markAllRead()} className="text-[11px] font-extrabold underline decoration-dotted">
                  Tout marquer comme lu
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto">
              {!loaded ? (
                <div className="space-y-2 p-3">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="h-16 animate-pulse rounded-xl bg-ink/10" />
                  ))}
                </div>
              ) : items.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm font-bold text-ink/50">Rien à signaler pour l&apos;instant 🧻</p>
              ) : (
                <ul className="divide-y-2 divide-ink/10">
                  {items.map((n) => (
                    <li key={n.id} className={`px-4 py-3 ${n.read ? "" : "bg-signage/15"}`}>
                      <div className="flex items-start gap-2.5">
                        <span className="text-lg leading-none">{STATUS_EMOJI[n.status]}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold leading-snug text-ink/90">{n.message}</p>
                          <div className="mt-1.5 flex items-center gap-3">
                            <span className="text-[11px] font-bold text-ink/50">{relDate(n.createdAt)}</span>
                            <a
                              href={`/?focus=${n.referenceId}`}
                              onClick={() => markOneRead(n)}
                              className="text-[11px] font-extrabold text-teal-dark underline decoration-dotted"
                            >
                              🗺️ Voir
                            </a>
                            {!n.read && (
                              <button onClick={() => markOneRead(n)} className="text-[11px] font-extrabold text-ink/50 underline decoration-dotted">
                                Marquer comme lu
                              </button>
                            )}
                          </div>
                        </div>
                        {!n.read && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-terracotta" aria-hidden />}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
