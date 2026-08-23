export type PieceKind = "I" | "O" | "T" | "S" | "Z" | "J" | "L";
export type Cell = PieceKind | null;
export type Board = Cell[][];
export type Piece = { kind: PieceKind; shape: number[][]; row: number; col: number };
export type Difficulty = "easy" | "medium" | "hard";

export const ROWS = 20;
export const COLS = 10;

const SHAPES: Record<PieceKind, number[][]> = {
  I: [
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
  O: [
    [0, 0, 0, 0],
    [0, 1, 1, 0],
    [0, 1, 1, 0],
    [0, 0, 0, 0],
  ],
  T: [
    [0, 0, 0, 0],
    [1, 1, 1, 0],
    [0, 1, 0, 0],
    [0, 0, 0, 0],
  ],
  S: [
    [0, 0, 0, 0],
    [0, 1, 1, 0],
    [1, 1, 0, 0],
    [0, 0, 0, 0],
  ],
  Z: [
    [0, 0, 0, 0],
    [1, 1, 0, 0],
    [0, 1, 1, 0],
    [0, 0, 0, 0],
  ],
  J: [
    [0, 0, 0, 0],
    [1, 0, 0, 0],
    [1, 1, 1, 0],
    [0, 0, 0, 0],
  ],
  L: [
    [0, 0, 0, 0],
    [0, 0, 1, 0],
    [1, 1, 1, 0],
    [0, 0, 0, 0],
  ],
};

const PIECE_ORDER: PieceKind[] = ["I", "O", "T", "S", "Z", "J", "L"];

function rotateMatrix(m: number[][]): number[][] {
  const size = m.length;
  const next = Array.from({ length: size }, () => Array(size).fill(0));
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) next[c][size - 1 - r] = m[r][c];
  return next;
}

export function emptyBoard(): Board {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

export function randomPieceKind(rng: () => number = Math.random): PieceKind {
  return PIECE_ORDER[Math.floor(rng() * PIECE_ORDER.length)];
}

/** row: -2 so a piece whose filled cells sit on template rows 1-2 (every shape here)
 * emerges from above the board rather than appearing fully-formed at row 0. */
export function spawnPiece(kind: PieceKind, cols: number): Piece {
  return { kind, shape: SHAPES[kind], row: -2, col: Math.floor(cols / 2) - 2 };
}

function cellsOf(piece: Piece): { r: number; c: number }[] {
  const cells: { r: number; c: number }[] = [];
  for (let r = 0; r < piece.shape.length; r++) {
    for (let c = 0; c < piece.shape[r].length; c++) {
      if (piece.shape[r][c]) cells.push({ r: piece.row + r, c: piece.col + c });
    }
  }
  return cells;
}

/** A cell above the board (r < 0) is allowed — pieces spawn partially off the top. */
export function isValidPosition(board: Board, piece: Piece): boolean {
  return cellsOf(piece).every(({ r, c }) => c >= 0 && c < COLS && r < ROWS && (r < 0 || board[r][c] === null));
}

export function rotatePiece(piece: Piece): Piece {
  return { ...piece, shape: rotateMatrix(piece.shape) };
}

export function moveHorizontal(piece: Piece, dx: number): Piece {
  return { ...piece, col: piece.col + dx };
}

export function moveDown(piece: Piece): Piece {
  return { ...piece, row: piece.row + 1 };
}

/** Writes a piece's cells permanently into the board (cells still above row 0 are dropped). */
export function lockPiece(board: Board, piece: Piece): Board {
  const next = board.map((row) => [...row]);
  for (const { r, c } of cellsOf(piece)) {
    if (r >= 0) next[r][c] = piece.kind;
  }
  return next;
}

const LINE_SCORES = [0, 100, 300, 500, 800];

/** Removes every full row, shifting the rest down and inserting empty rows at the top. */
export function clearLines(board: Board): { board: Board; cleared: number; gained: number } {
  const remaining = board.filter((row) => row.some((cell) => cell === null));
  const cleared = board.length - remaining.length;
  const empties: Board = Array.from({ length: cleared }, () => Array(COLS).fill(null));
  return { board: [...empties, ...remaining], cleared, gained: LINE_SCORES[cleared] ?? 0 };
}

const BASE_SPEED_MS: Record<Difficulty, number> = { easy: 800, medium: 500, hard: 300 };
const MIN_SPEED_MS = 100;
const SPEEDUP_PER_LINE_MS = 40;

/** Speeds up as lines clear, starting from the difficulty's base drop interval. */
export function speedForLines(difficulty: Difficulty, linesCleared: number): number {
  return Math.max(MIN_SPEED_MS, BASE_SPEED_MS[difficulty] - linesCleared * SPEEDUP_PER_LINE_MS);
}
