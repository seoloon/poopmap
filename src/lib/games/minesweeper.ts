export type Difficulty = "beginner" | "intermediate" | "expert";
export type Cell = { mine: boolean; revealed: boolean; flagged: boolean; adjacent: number };
export type MinesweeperBoard = Cell[][];

export const CONFIG: Record<Difficulty, { rows: number; cols: number; mines: number }> = {
  beginner: { rows: 9, cols: 9, mines: 10 },
  intermediate: { rows: 16, cols: 16, mines: 40 },
  expert: { rows: 16, cols: 30, mines: 99 },
};

function neighbors(r: number, c: number, rows: number, cols: number): [number, number][] {
  const result: [number, number][] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) result.push([nr, nc]);
    }
  }
  return result;
}

/** Turns a plain mine layout into a full board with adjacency counts precomputed. */
export function buildBoard(mines: boolean[][]): MinesweeperBoard {
  const rows = mines.length;
  const cols = mines[0].length;
  return mines.map((row, r) =>
    row.map((mine, c) => ({
      mine,
      revealed: false,
      flagged: false,
      adjacent: mine ? 0 : neighbors(r, c, rows, cols).filter(([nr, nc]) => mines[nr][nc]).length,
    }))
  );
}

export function createBoard(difficulty: Difficulty, rng: () => number = Math.random): MinesweeperBoard {
  const { rows, cols, mines: mineCount } = CONFIG[difficulty];
  const mines = Array.from({ length: rows }, () => Array(cols).fill(false));
  let placed = 0;
  while (placed < mineCount) {
    const r = Math.floor(rng() * rows);
    const c = Math.floor(rng() * cols);
    if (mines[r][c]) continue;
    mines[r][c] = true;
    placed++;
  }
  return buildBoard(mines);
}

/** Reveals a cell, flood-filling outward through connected zero-adjacency cells. */
export function reveal(board: MinesweeperBoard, r: number, c: number): MinesweeperBoard {
  const rows = board.length;
  const cols = board[0].length;
  const next = board.map((row) => row.map((cell) => ({ ...cell })));
  const stack: [number, number][] = [[r, c]];
  while (stack.length) {
    const [cr, cc] = stack.pop()!;
    const cell = next[cr][cc];
    if (cell.revealed || cell.flagged) continue;
    cell.revealed = true;
    if (cell.adjacent === 0 && !cell.mine) {
      for (const [nr, nc] of neighbors(cr, cc, rows, cols)) stack.push([nr, nc]);
    }
  }
  return next;
}

export function toggleFlag(board: MinesweeperBoard, r: number, c: number): MinesweeperBoard {
  const next = board.map((row) => row.map((cell) => ({ ...cell })));
  if (!next[r][c].revealed) next[r][c].flagged = !next[r][c].flagged;
  return next;
}

export function checkWin(board: MinesweeperBoard): boolean {
  return board.every((row) => row.every((cell) => cell.mine || cell.revealed));
}

export function hasExploded(board: MinesweeperBoard): boolean {
  return board.some((row) => row.some((cell) => cell.mine && cell.revealed));
}
