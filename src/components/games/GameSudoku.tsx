"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { generateSolvedGrid, isComplete, isValidPlacement, makePuzzle, type Difficulty, type SudokuGrid } from "@/lib/games/sudoku";

export default function GameSudoku({ difficulty, onFinish }: { difficulty: Difficulty; onFinish: (seconds: number) => void }) {
  const initial = useMemo(() => {
    const solved = generateSolvedGrid();
    const puzzle = makePuzzle(solved, difficulty);
    return { puzzle, givenMask: puzzle.map((row) => row.map((v) => v !== 0)) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [difficulty]);

  const [grid, setGrid] = useState<SudokuGrid>(() => initial.puzzle.map((row) => [...row]));
  const [elapsed, setElapsed] = useState(0);
  const [done, setDone] = useState(false);
  const startRef = useRef(Date.now());
  const finishedRef = useRef(false);

  useEffect(() => {
    if (done) return;
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 1000);
    return () => clearInterval(id);
  }, [done]);

  useEffect(() => {
    if (done && !finishedRef.current) {
      finishedRef.current = true;
      onFinish(elapsed);
    }
  }, [done, elapsed, onFinish]);

  const setCell = (r: number, c: number, raw: string) => {
    if (initial.givenMask[r][c] || done) return;
    const value = raw === "" ? 0 : Number(raw);
    if (!Number.isInteger(value) || value < 0 || value > 9) return;
    const next = grid.map((row) => [...row]);
    next[r][c] = value;
    setGrid(next);
    if (isComplete(next)) setDone(true);
  };

  return (
    <div className="space-y-3">
      <p className="text-center font-display text-lg font-extrabold">⏱️ {elapsed}s</p>
      <div className="mx-auto grid w-full max-w-sm grid-cols-9 gap-[1px] rounded-2xl bg-ink p-[1px]">
        {grid.map((row, r) =>
          row.map((value, c) => {
            const given = initial.givenMask[r][c];
            const invalid = value !== 0 && !isValidPlacement(grid, r, c, value);
            return (
              <input
                key={`${r}-${c}`}
                inputMode="numeric"
                maxLength={1}
                value={value === 0 ? "" : value}
                disabled={given || done}
                onChange={(e) => setCell(r, c, e.target.value.replace(/[^1-9]/g, ""))}
                className={`grid aspect-square place-items-center text-center text-sm font-extrabold ${
                  given ? "bg-ink/10" : invalid ? "bg-red-100 text-red-700" : "bg-white"
                }`}
              />
            );
          })
        )}
      </div>
      {done && <p className="text-center text-sm font-bold text-teal">🎉 Résolu en {elapsed}s !</p>}
    </div>
  );
}
