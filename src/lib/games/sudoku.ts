export type SudokuGrid = number[][];
export type Difficulty = "easy" | "medium" | "hard";

export const GIVENS_BY_DIFFICULTY: Record<Difficulty, number> = { easy: 40, medium: 32, hard: 26 };

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function isSafe(grid: SudokuGrid, r: number, c: number, value: number): boolean {
  for (let i = 0; i < 9; i++) {
    if (grid[r][i] === value || grid[i][c] === value) return false;
  }
  const br = Math.floor(r / 3) * 3;
  const bc = Math.floor(c / 3) * 3;
  for (let dr = 0; dr < 3; dr++) {
    for (let dc = 0; dc < 3; dc++) {
      if (grid[br + dr][bc + dc] === value) return false;
    }
  }
  return true;
}

/** Backtracking fill of an empty 9x9 grid into a complete, valid solution. */
export function generateSolvedGrid(rng: () => number = Math.random): SudokuGrid {
  const grid: SudokuGrid = Array.from({ length: 9 }, () => Array(9).fill(0));

  function fill(pos: number): boolean {
    if (pos === 81) return true;
    const r = Math.floor(pos / 9);
    const c = pos % 9;
    for (const value of shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9], rng)) {
      if (isSafe(grid, r, c, value)) {
        grid[r][c] = value;
        if (fill(pos + 1)) return true;
        grid[r][c] = 0;
      }
    }
    return false;
  }

  fill(0);
  return grid;
}

/** Removes cells from a solved grid at random down to `difficulty`'s given count. */
export function makePuzzle(solved: SudokuGrid, difficulty: Difficulty, rng: () => number = Math.random): SudokuGrid {
  const toRemove = 81 - GIVENS_BY_DIFFICULTY[difficulty];
  const positions = shuffle(
    Array.from({ length: 81 }, (_, i) => i),
    rng
  ).slice(0, toRemove);
  const puzzle = solved.map((row) => [...row]);
  for (const pos of positions) puzzle[Math.floor(pos / 9)][pos % 9] = 0;
  return puzzle;
}

/** True if `value` doesn't already appear elsewhere in `(r, c)`'s row, column, or 3x3 box. */
export function isValidPlacement(grid: SudokuGrid, r: number, c: number, value: number): boolean {
  for (let i = 0; i < 9; i++) {
    if (i !== c && grid[r][i] === value) return false;
    if (i !== r && grid[i][c] === value) return false;
  }
  const br = Math.floor(r / 3) * 3;
  const bc = Math.floor(c / 3) * 3;
  for (let dr = 0; dr < 3; dr++) {
    for (let dc = 0; dc < 3; dc++) {
      const rr = br + dr;
      const cc = bc + dc;
      if ((rr !== r || cc !== c) && grid[rr][cc] === value) return false;
    }
  }
  return true;
}

/** True once every cell is filled and no row/column/box has a duplicate. */
export function isComplete(grid: SudokuGrid): boolean {
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const value = grid[r][c];
      if (value === 0 || !isValidPlacement(grid, r, c, value)) return false;
    }
  }
  return true;
}
