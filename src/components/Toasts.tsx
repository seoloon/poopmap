"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

type Toast = { id: number; text: string; kind: "ok" | "err" };

let pushToast: (t: Toast) => void = () => {};

/** Global emitter, usable from any client module. */
export function toast(text: string, kind: "ok" | "err" = "ok") {
  pushToast({ id: Date.now() + Math.random(), text, kind });
}

export default function Toasts() {
  const [list, setList] = useState<Toast[]>([]);

  useEffect(() => {
    pushToast = (t) => {
      setList((l) => [...l.slice(-3), t]);
      setTimeout(() => setList((l) => l.filter((x) => x.id !== t.id)), 3800);
    };
    return () => {
      pushToast = () => {};
    };
  }, []);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[1200] flex flex-col items-center gap-2 px-4">
      <AnimatePresence>
        {list.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: -18, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.95 }}
            transition={{ duration: 0.25, ease: [0.22, 1.2, 0.36, 1] }}
            className={`sticker-sm max-w-[92vw] px-4 py-2.5 text-sm font-bold shadow-lg ${
              t.kind === "err" ? "bg-red-50 text-red-800" : "bg-white text-ink"
            }`}
            style={t.kind === "err" ? { borderColor: "#b91c1c", boxShadow: "4px 4px 0 rgba(185,28,28,.8)" } : undefined}
          >
            {t.kind === "ok" ? "💩 " : "⚠️ "}
            {t.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
