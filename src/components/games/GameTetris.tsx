"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  clearLines,
  emptyBoard,
  isValidPosition,
  lockPiece,
  moveDown,
  moveHorizontal,
  randomPieceKind,
  rotatePiece,
  spawnPiece,
  speedForLines,
  COLS,
  ROWS,
  type Board,
  type Difficulty,
  type Piece,
} from "@/lib/games/tetris";
import GameOverModal from "./GameOverModal";

const SWIPE_THRESHOLD_PX = 24;

const PIECE_COLORS: Record<string, string> = {
  I: "bg-teal",
  O: "bg-signage",
  T: "bg-terracotta",
  S: "bg-sage",
  Z: "bg-red-300",
  J: "bg-blue-300",
  L: "bg-terracotta-dark",
};

export default function GameTetris({
  difficulty,
  onFinish,
  onQuit,
  onReplay,
}: {
  difficulty: Difficulty;
  onFinish: (score: number) => void;
  onQuit: () => void;
  onReplay: () => void;
}) {
  const [board, setBoard] = useState<Board>(() => emptyBoard());
  const [piece, setPiece] = useState<Piece>(() => spawnPiece(randomPieceKind(), COLS));
  const [score, setScore] = useState(0);
  const [lines, setLines] = useState(0);
  const [over, setOver] = useState(false);
  const finishedRef = useRef(false);
  const boardRef = useRef(board);
  const pieceRef = useRef(piece);
  boardRef.current = board;
  pieceRef.current = piece;
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const drop = useCallback(() => {
    if (over) return;
    const moved = moveDown(pieceRef.current);
    if (isValidPosition(boardRef.current, moved)) {
      setPiece(moved);
      return;
    }
    const locked = lockPiece(boardRef.current, pieceRef.current);
    const { board: cleared, cleared: n, gained } = clearLines(locked);
    setBoard(cleared);
    setScore((s) => s + gained);
    setLines((l) => l + n);

    const next = spawnPiece(randomPieceKind(), COLS);
    if (!isValidPosition(cleared, next)) {
      setOver(true);
      return;
    }
    setPiece(next);
  }, [over]);

  useEffect(() => {
    if (over) return;
    const id = setInterval(drop, speedForLines(difficulty, lines));
    return () => clearInterval(id);
  }, [drop, over, difficulty, lines]);

  const shiftHorizontal = useCallback(
    (dir: -1 | 1) => {
      if (over) return;
      const moved = moveHorizontal(pieceRef.current, dir);
      if (isValidPosition(boardRef.current, moved)) setPiece(moved);
    },
    [over]
  );

  const moveLeft = useCallback(() => shiftHorizontal(-1), [shiftHorizontal]);
  const moveRight = useCallback(() => shiftHorizontal(1), [shiftHorizontal]);

  const rotate = useCallback(() => {
    if (over) return;
    const rotated = rotatePiece(pieceRef.current);
    if (isValidPosition(boardRef.current, rotated)) setPiece(rotated);
  }, [over]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (over) return;
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        shiftHorizontal(e.key === "ArrowLeft" ? -1 : 1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        rotate();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        drop();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [drop, over, shiftHorizontal, rotate]);

  useEffect(() => {
    if (over && !finishedRef.current) {
      finishedRef.current = true;
      onFinish(score);
    }
  }, [over, score, onFinish]);

  const pieceCells = new Set<string>();
  for (let r = 0; r < piece.shape.length; r++) {
    for (let c = 0; c < piece.shape[r].length; c++) {
      if (piece.shape[r][c]) pieceCells.add(`${piece.row + r},${piece.col + c}`);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-center font-display text-lg font-extrabold">
        {score} pts · {lines} lignes
      </p>
      <div
        className="mx-auto grid max-h-[48vh] w-auto gap-[1px] rounded-2xl bg-ink/10 p-1"
        style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)`, aspectRatio: `${COLS} / ${ROWS}` }}
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
          if (Math.abs(dx) > Math.abs(dy)) shiftHorizontal(dx > 0 ? 1 : -1);
          else if (dy > 0) drop();
        }}
      >
        {board.map((row, r) =>
          row.map((cell, c) => {
            const active = pieceCells.has(`${r},${c}`);
            const kind = active ? piece.kind : cell;
            return <div key={`${r}-${c}`} className={`aspect-square rounded-sm ${kind ? PIECE_COLORS[kind] : "bg-white/40"}`} />;
          })
        )}
      </div>
      <div className="mx-auto grid w-full max-w-xs grid-cols-4 gap-2">
        <button
          type="button"
          onClick={moveLeft}
          disabled={over}
          aria-label="Déplacer à gauche"
          className="sticker-sm sticker-press rounded-xl py-3 text-lg font-extrabold transition hover:bg-blush disabled:opacity-50"
        >
          ◀
        </button>
        <button
          type="button"
          onClick={moveRight}
          disabled={over}
          aria-label="Déplacer à droite"
          className="sticker-sm sticker-press rounded-xl py-3 text-lg font-extrabold transition hover:bg-blush disabled:opacity-50"
        >
          ▶
        </button>
        <button
          type="button"
          onClick={rotate}
          disabled={over}
          aria-label="Tourner"
          className="sticker-sm sticker-press rounded-xl py-3 text-lg font-extrabold transition hover:bg-blush disabled:opacity-50"
        >
          ↻
        </button>
        <button
          type="button"
          onClick={drop}
          disabled={over}
          aria-label="Descente rapide"
          className="sticker-sm sticker-press rounded-xl py-3 text-lg font-extrabold transition hover:bg-blush disabled:opacity-50"
        >
          ▼
        </button>
      </div>
      {over && (
        <GameOverModal
          stats={[
            { label: "Score", value: `${score} pts` },
            { label: "Lignes", value: `${lines}` },
          ]}
          onReplay={onReplay}
          onQuit={onQuit}
        />
      )}
    </div>
  );
}
