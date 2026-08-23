import { describe, expect, it } from "vitest";
import { GIVENS_BY_DIFFICULTY, generateSolvedGrid, isComplete, isValidPlacement, makePuzzle } from "./sudoku";

// Small deterministic PRNG so generation is reproducible in tests (mulberry32).
function seededRng(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("generateSolvedGrid", () => {
  it("produces a complete, valid 9x9 grid", () => {
    const grid = generateSolvedGrid(seededRng(1));
    expect(grid.length).toBe(9);
    expect(grid.every((row) => row.length === 9 && row.every((v) => v >= 1 && v <= 9))).toBe(true);
    expect(isComplete(grid)).toBe(true);
  });
});

describe("makePuzzle", () => {
  it("removes exactly enough cells to reach the difficulty's given count", () => {
    const solved = generateSolvedGrid(seededRng(2));
    for (const difficulty of ["easy", "medium", "hard"] as const) {
      const puzzle = makePuzzle(solved, difficulty, seededRng(3));
      const givens = puzzle.flat().filter((v) => v !== 0).length;
      expect(givens).toBe(GIVENS_BY_DIFFICULTY[difficulty]);
    }
  });

  it("never alters the cells it keeps", () => {
    const solved = generateSolvedGrid(seededRng(4));
    const puzzle = makePuzzle(solved, "easy", seededRng(5));
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (puzzle[r][c] !== 0) expect(puzzle[r][c]).toBe(solved[r][c]);
      }
    }
  });
});

describe("isValidPlacement", () => {
  const grid: number[][] = Array.from({ length: 9 }, () => Array(9).fill(0));
  grid[0][0] = 5;
  grid[0][1] = 3;
  grid[3][0] = 7;

  it("rejects a duplicate in the same row", () => {
    expect(isValidPlacement(grid, 0, 8, 5)).toBe(false);
  });

  it("rejects a duplicate in the same column", () => {
    expect(isValidPlacement(grid, 8, 0, 7)).toBe(false);
  });

  it("rejects a duplicate in the same 3x3 box", () => {
    expect(isValidPlacement(grid, 1, 1, 3)).toBe(false);
  });

  it("accepts a value with no conflict", () => {
    expect(isValidPlacement(grid, 4, 4, 9)).toBe(true);
  });
});

describe("isComplete", () => {
  it("is true for a fully solved valid grid", () => {
    expect(isComplete(generateSolvedGrid(seededRng(6)))).toBe(true);
  });

  it("is false when a cell is still empty", () => {
    const grid = generateSolvedGrid(seededRng(7));
    grid[0][0] = 0;
    expect(isComplete(grid)).toBe(false);
  });

  it("is false when a duplicate has been introduced", () => {
    const grid = generateSolvedGrid(seededRng(8));
    grid[0][0] = grid[0][1];
    expect(isComplete(grid)).toBe(false);
  });
});
