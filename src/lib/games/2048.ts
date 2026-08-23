export type Board2048 = number[][];
export type Direction = "left" | "right" | "up" | "down";

const SIZE = 4;

export function emptyBoard(): Board2048 {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
}

/** Fills one random empty cell with 2 (90%) or 4 (10%). No-op if the board is full. */
export function spawnTile(board: Board2048, rng: () => number = Math.random): Board2048 {
  const empties: [number, number][] = [];
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (board[r][c] === 0) empties.push([r, c]);
  const next = board.map((row) => [...row]);
  if (empties.length === 0) return next;
  const [r, c] = empties[Math.floor(rng() * empties.length)];
  next[r][c] = rng() < 0.9 ? 2 : 4;
  return next;
}

export function createBoard(rng: () => number = Math.random): Board2048 {
  return spawnTile(spawnTile(emptyBoard(), rng), rng);
}

/** Slides a line of 4 values toward index 0, merging equal adjacent values once each. */
function slideAndMergeLine(line: number[]): { line: number[]; gained: number } {
  const values = line.filter((v) => v !== 0);
  const merged: number[] = [];
  let gained = 0;
  for (let i = 0; i < values.length; i++) {
    if (i < values.length - 1 && values[i] === values[i + 1]) {
      const value = values[i] * 2;
      merged.push(value);
      gained += value;
      i++;
    } else {
      merged.push(values[i]);
    }
  }
  while (merged.length < line.length) merged.push(0);
  return { line: merged, gained };
}

/** Applies one move. Every direction is implemented as "slide toward index 0",
 * reversing the row/column first for "right"/"down" and reversing the result back. */
export function move(board: Board2048, direction: Direction): { board: Board2048; moved: boolean; gained: number } {
  const next = emptyBoard();
  let gained = 0;

  if (direction === "left" || direction === "right") {
    for (let r = 0; r < SIZE; r++) {
      const reversed = direction === "right";
      const source = reversed ? [...board[r]].reverse() : board[r];
      const { line, gained: g } = slideAndMergeLine(source);
      gained += g;
      next[r] = reversed ? line.reverse() : line;
    }
  } else {
    for (let c = 0; c < SIZE; c++) {
      const column = board.map((row) => row[c]);
      const reversed = direction === "down";
      const source = reversed ? column.reverse() : column;
      const { line, gained: g } = slideAndMergeLine(source);
      gained += g;
      const result = reversed ? line.reverse() : line;
      for (let r = 0; r < SIZE; r++) next[r][c] = result[r];
    }
  }

  const moved = JSON.stringify(next) !== JSON.stringify(board);
  return { board: next, moved, gained };
}

export function isGameOver(board: Board2048): boolean {
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (board[r][c] === 0) return false;
      if (c < SIZE - 1 && board[r][c] === board[r][c + 1]) return false;
      if (r < SIZE - 1 && board[r][c] === board[r + 1][c]) return false;
    }
  }
  return true;
}
