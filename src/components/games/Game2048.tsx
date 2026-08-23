"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { createBoard, isGameOver, move, spawnTile, type Direction, type Tile } from "@/lib/games/2048";
import GameOverModal from "./GameOverModal";

const TILE_COLORS: Record<number, string> = {
  2: "bg-blush text-ink",
  4: "bg-signage text-ink",
  8: "bg-terracotta text-white",
  16: "bg-terracotta-dark text-white",
  32: "bg-sage text-ink",
  64: "bg-sage-dark text-white",
  128: "bg-teal text-white",
  256: "bg-teal-dark text-white",
};

const KEY_TO_DIRECTION: Record<string, Direction> = {
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "up",
  ArrowDown: "down",
};

const SWIPE_THRESHOLD_PX = 24;

export default function Game2048({
  onFinish,
  onQuit,
  onReplay,
}: {
  onFinish: (score: number) => void;
  onQuit: () => void;
  onReplay: () => void;
}) {
  const initial = useRef(createBoard());
  const [tiles, setTiles] = useState<Tile[]>(() => initial.current.tiles);
  const [mergedIds, setMergedIds] = useState<Set<number>>(new Set());
  const [score, setScore] = useState(0);
  const [over, setOver] = useState(false);
  const finishedRef = useRef(false);
  const nextIdRef = useRef(initial.current.nextId);
  const tilesRef = useRef(tiles);
  tilesRef.current = tiles;
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const play = useCallback(
    (direction: Direction) => {
      if (over) return;
      const result = move(tilesRef.current, direction);
      if (!result.moved) return;
      const spawned = spawnTile(result.tiles, nextIdRef.current);
      nextIdRef.current = spawned.nextId;
      setTiles(spawned.tiles);
      setMergedIds(new Set(result.mergedIds));
      setScore((s) => s + result.gained);
      if (isGameOver(spawned.tiles)) setOver(true);
    },
    [over]
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const direction = KEY_TO_DIRECTION[e.key];
      if (direction) {
        e.preventDefault();
        play(direction);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [play]);

  useEffect(() => {
    if (over && !finishedRef.current) {
      finishedRef.current = true;
      onFinish(score);
    }
  }, [over, score, onFinish]);

  return (
    <div className="space-y-3">
      <p className="text-center font-display text-2xl font-extrabold">{score} pts</p>
      {/*
        Empty-cell backgrounds and tiles share this ONE grid (rather than two
        independently-positioned grids stacked via absolute inset) so there's a single
        column/row track computation for both layers. Two separate grids with matching
        classes still drifted apart on iOS Safari, which rounds fractional gap/track
        math differently across independently-laid-out grids — Chrome didn't show it.
      */}
      <div
        className="relative mx-auto grid aspect-square w-full max-w-xs grid-cols-4 grid-rows-4 gap-2 rounded-2xl bg-ink/10 p-2"
        onTouchStart={(e) => {
          const t = e.touches[0];
          touchStart.current = { x: t.clientX, y: t.clientY };
        }}
        onTouchEnd={(e) => {
          if (!touchStart.current) return;
          const t = e.changedTouches[0];
          const dx = t.clientX - touchStart.current.x;
          const dy = t.clientY - touchStart.current.y;
          touchStart.current = null;
          if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_THRESHOLD_PX) return;
          if (Math.abs(dx) > Math.abs(dy)) play(dx > 0 ? "right" : "left");
          else play(dy > 0 ? "down" : "up");
        }}
      >
        {/* Empty-cell backgrounds — static, never animated, one per grid cell. */}
        {Array.from({ length: 16 }).map((_, i) => (
          <div key={i} className="rounded-xl bg-white/40" style={{ gridRowStart: Math.floor(i / 4) + 1, gridColumnStart: (i % 4) + 1 }} />
        ))}

        {/* Tiles, placed in the same grid cells as the backgrounds above (and painted
            on top of them by DOM order) — each keyed by its stable id so framer-motion's
            layout animation slides it from its old cell to its new one. */}
        <AnimatePresence>
          {tiles.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ scale: 0 }}
              animate={{ scale: mergedIds.has(t.id) ? [1, 1.2, 1] : 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ type: "spring", stiffness: 500, damping: 32 }}
              style={{ gridRowStart: t.row + 1, gridColumnStart: t.col + 1 }}
              className={`grid place-items-center rounded-xl font-display text-lg font-extrabold ${TILE_COLORS[t.value] ?? "bg-ink text-white"}`}
            >
              {t.value}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {over && <GameOverModal stats={[{ label: "Score", value: `${score} pts` }]} onReplay={onReplay} onQuit={onQuit} />}
    </div>
  );
}
