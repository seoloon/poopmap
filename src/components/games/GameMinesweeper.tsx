"use client";

import { useEffect, useRef, useState } from "react";
import {
  checkWin,
  createBoard,
  hasExploded,
  reveal,
  toggleFlag,
  type Difficulty,
  type MinesweeperBoard,
} from "@/lib/games/minesweeper";

const LONG_PRESS_MS = 500;

const NUMBER_COLORS: Record<number, string> = {
  1: "text-blue-700",
  2: "text-teal-dark",
  3: "text-terracotta-dark",
  4: "text-ink/70",
  5: "text-red-800",
  6: "text-red-800",
  7: "text-red-800",
  8: "text-red-800",
};

export default function GameMinesweeper({
  difficulty,
  onFinish,
}: {
  difficulty: Difficulty;
  onFinish: (seconds: number) => void;
}) {
  const [board, setBoard] = useState<MinesweeperBoard>(() => createBoard(difficulty));
  const [status, setStatus] = useState<"playing" | "won" | "lost">("playing");
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(Date.now());
  const finishedRef = useRef(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (status !== "playing") return;
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 1000);
    return () => clearInterval(id);
  }, [status]);

  useEffect(() => {
    if (status === "won" && !finishedRef.current) {
      finishedRef.current = true;
      onFinish(elapsed);
    }
  }, [status, elapsed, onFinish]);

  const click = (r: number, c: number) => {
    if (status !== "playing" || board[r][c].flagged) return;
    const next = reveal(board, r, c);
    setBoard(next);
    if (hasExploded(next)) setStatus("lost");
    else if (checkWin(next)) setStatus("won");
  };

  const flag = (e: React.MouseEvent, r: number, c: number) => {
    e.preventDefault();
    if (status !== "playing") return;
    setBoard(toggleFlag(board, r, c));
  };

  const clearLongPress = () => {
    if (longPressTimer.current !== null) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handleTouchStart = (r: number, c: number) => {
    clearLongPress();
    longPressTimer.current = setTimeout(() => {
      longPressTimer.current = null;
      if (status !== "playing") return;
      setBoard((current) => toggleFlag(current, r, c));
    }, LONG_PRESS_MS);
  };

  return (
    <div className="space-y-3">
      <p className="text-center font-display text-lg font-extrabold">⏱️ {elapsed}s</p>
      <div
        className="mx-auto grid w-full gap-[2px] overflow-x-auto rounded-2xl bg-ink/10 p-2"
        style={{ gridTemplateColumns: `repeat(${board[0].length}, minmax(22px, 1fr))` }}
      >
        {board.flatMap((row, r) =>
          row.map((cell, c) => (
            <button
              key={`${r}-${c}`}
              onClick={() => click(r, c)}
              onContextMenu={(e) => flag(e, r, c)}
              onTouchStart={() => handleTouchStart(r, c)}
              onTouchEnd={clearLongPress}
              onTouchMove={clearLongPress}
              disabled={status !== "playing" && !cell.revealed}
              style={{ touchAction: "manipulation", WebkitUserSelect: "none", userSelect: "none" }}
              className={`grid aspect-square select-none place-items-center rounded text-xs font-extrabold ${
                cell.revealed ? (cell.mine ? "bg-red-200" : "bg-white/70") : "bg-sage hover:bg-sage-dark"
              } ${NUMBER_COLORS[cell.adjacent] ?? ""}`}
            >
              {cell.revealed ? (cell.mine ? "💣" : cell.adjacent || "") : cell.flagged ? "🚩" : ""}
            </button>
          ))
        )}
      </div>
      {status === "lost" && <p className="text-center text-sm font-bold text-red-700">💥 Boom — retente ta chance</p>}
      {status === "won" && <p className="text-center text-sm font-bold text-teal">🎉 Gagné en {elapsed}s !</p>}
    </div>
  );
}
