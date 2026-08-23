"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createBoard, isGameOver, move, spawnTile, type Board2048, type Direction } from "@/lib/games/2048";

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

export default function Game2048({ onFinish }: { onFinish: (score: number) => void }) {
  const [board, setBoard] = useState<Board2048>(() => createBoard());
  const [score, setScore] = useState(0);
  const [over, setOver] = useState(false);
  const finishedRef = useRef(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const play = useCallback(
    (direction: Direction) => {
      if (over) return;
      setBoard((current) => {
        const result = move(current, direction);
        if (!result.moved) return current;
        const spawned = spawnTile(result.board);
        setScore((s) => s + result.gained);
        if (isGameOver(spawned)) setOver(true);
        return spawned;
      });
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
      <div
        className="mx-auto grid aspect-square w-full max-w-xs grid-cols-4 gap-2 rounded-2xl bg-ink/10 p-2"
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
        {board.flat().map((value, i) => (
          <div
            key={i}
            className={`grid place-items-center rounded-xl font-display text-lg font-extrabold ${
              value === 0 ? "bg-white/40" : (TILE_COLORS[value] ?? "bg-ink text-white")
            }`}
          >
            {value !== 0 && value}
          </div>
        ))}
      </div>
      {over && <p className="text-center text-sm font-bold text-ink/60">Partie terminée 🧻</p>}
    </div>
  );
}
