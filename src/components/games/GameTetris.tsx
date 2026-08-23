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
  type Board,
  type Difficulty,
  type Piece,
} from "@/lib/games/tetris";

const PIECE_COLORS: Record<string, string> = {
  I: "bg-teal",
  O: "bg-signage",
  T: "bg-terracotta",
  S: "bg-sage",
  Z: "bg-red-300",
  J: "bg-blue-300",
  L: "bg-terracotta-dark",
};

export default function GameTetris({ difficulty, onFinish }: { difficulty: Difficulty; onFinish: (score: number) => void }) {
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

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (over) return;
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        const moved = moveHorizontal(pieceRef.current, e.key === "ArrowLeft" ? -1 : 1);
        if (isValidPosition(boardRef.current, moved)) setPiece(moved);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const rotated = rotatePiece(pieceRef.current);
        if (isValidPosition(boardRef.current, rotated)) setPiece(rotated);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        drop();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [drop, over]);

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
        className="mx-auto grid w-full max-w-xs gap-[1px] rounded-2xl bg-ink/10 p-1"
        style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)` }}
      >
        {board.map((row, r) =>
          row.map((cell, c) => {
            const active = pieceCells.has(`${r},${c}`);
            const kind = active ? piece.kind : cell;
            return <div key={`${r}-${c}`} className={`aspect-square rounded-sm ${kind ? PIECE_COLORS[kind] : "bg-white/40"}`} />;
          })
        )}
      </div>
      {over && <p className="text-center text-sm font-bold text-ink/60">Game over — {score} pts 🧻</p>}
    </div>
  );
}
