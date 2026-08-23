"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { generateSolvedGrid, isComplete, isValidPlacement, makePuzzle, type Difficulty, type SudokuGrid } from "@/lib/games/sudoku";

export default function GameSudoku({ difficulty, onFinish }: { difficulty: Difficulty; onFinish: (seconds: number) => void }) {
  const initial = useMemo(() => {
    const solved = generateSolvedGrid();
    const puzzle = makePuzzle(solved, difficulty);
    return { puzzle, givenMask: puzzle.map((row) => row.map((v) => v !== 0)) };
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
      {/*
        Cell separators are real per-cell borders, not the usual "1px gap over a black
        parent background" trick: that hairline gap measures correctly in the DOM (checked
        via getBoundingClientRect) but doesn't reliably paint on this rendering pipeline,
        especially once overflow-hidden + rounded-2xl below forces a clipped compositing
        layer — the exact same class of paint bug as the given-digit background earlier.
        Real borders (like the box dividers already use) don't have that problem.
      */}
      <div className="mx-auto grid w-full max-w-sm grid-cols-9 overflow-hidden rounded-2xl border-2 border-ink">
        {grid.map((row, r) =>
          row.map((value, c) => {
            const given = initial.givenMask[r][c];
            const invalid = value !== 0 && !isValidPlacement(grid, r, c, value);
            // Thicker border after every 3rd row/column so the nine 3x3 boxes read
            // clearly against the grid's thin 1px cell borders.
            const boxBorder = `${c % 3 === 2 && c !== 8 ? "border-r-2" : c !== 8 ? "border-r" : ""} ${
              r % 3 === 2 && r !== 8 ? "border-b-2" : r !== 8 ? "border-b" : ""
            }`;
            return (
              <input
                key={`${r}-${c}`}
                inputMode="numeric"
                maxLength={1}
                value={value === 0 ? "" : value}
                // Given cells use readOnly rather than disabled: iOS Safari renders
                // disabled inputs with its own washed-out gray text via a `:disabled`
                // UA-stylesheet rule that inline styles can't override (no !important
                // support in React's style object), so the digits stayed invisible on
                // iPhone no matter what color was set. readOnly blocks edits the same
                // way without ever triggering that native disabled appearance.
                readOnly={given}
                disabled={!given && done}
                onChange={(e) => setCell(r, c, e.target.value.replace(/[^1-9]/g, ""))}
                // An opaque color, not bg-ink/10: a translucent background on an
                // <input> hits a real GPU-paint bug on some devices where the alpha
                // channel is dropped and the color renders fully opaque (black),
                // hiding the digit — reproducible even outside React with a plain
                // <input style="background: rgba(26,26,26,.1)">. Opaque colors never
                // triggered it in testing, hence baking in the equivalent solid tone.
                className={`aspect-square appearance-none border-ink text-center text-sm font-extrabold ${boxBorder} ${
                  given ? "bg-[#e8e6df] text-ink" : invalid ? "bg-red-100 text-red-700" : "bg-white text-ink"
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
