import { describe, expect, it } from "vitest";
import {
  clearLines,
  emptyBoard,
  isValidPosition,
  lockPiece,
  moveDown,
  moveHorizontal,
  rotatePiece,
  spawnPiece,
  speedForLines,
  COLS,
  ROWS,
} from "./tetris";

describe("spawnPiece / isValidPosition", () => {
  it("spawns a piece centered near the top, valid on an empty board", () => {
    const piece = spawnPiece("O", COLS);
    expect(isValidPosition(emptyBoard(), piece)).toBe(true);
  });

  it("is invalid once moved past the left edge", () => {
    const piece = moveHorizontal(spawnPiece("O", COLS), -100);
    expect(isValidPosition(emptyBoard(), piece)).toBe(false);
  });

  it("is invalid once moved past the bottom", () => {
    let piece = spawnPiece("O", COLS);
    for (let i = 0; i < ROWS + 5; i++) piece = moveDown(piece);
    expect(isValidPosition(emptyBoard(), piece)).toBe(false);
  });

  it("is invalid when overlapping an already-locked cell", () => {
    const board = emptyBoard();
    board[5][5] = "I"; // the O piece at row:4,col:4 fills (5,5),(5,6),(6,5),(6,6) — this overlaps (5,5)
    const piece = { kind: "O" as const, shape: spawnPiece("O", COLS).shape, row: 4, col: 4 };
    expect(isValidPosition(board, piece)).toBe(false);
  });
});

describe("rotatePiece", () => {
  it("rotates the T piece's shape 90 degrees clockwise", () => {
    const piece = spawnPiece("T", COLS);
    const rotated = rotatePiece(piece);
    expect(rotated.shape).not.toEqual(piece.shape);
    // Rotating 4 times returns to the original shape.
    const fullCircle = rotatePiece(rotatePiece(rotatePiece(rotated)));
    expect(fullCircle.shape).toEqual(piece.shape);
  });
});

describe("lockPiece", () => {
  it("writes the piece's cells into the board using its kind", () => {
    const piece = { kind: "O" as const, shape: spawnPiece("O", COLS).shape, row: 0, col: 0 };
    const locked = lockPiece(emptyBoard(), piece);
    const filled = locked.flat().filter((c) => c !== null);
    expect(filled.length).toBe(4); // O piece is a 2x2 block
    expect(filled.every((c) => c === "O")).toBe(true);
  });

  it("ignores cells above the board (negative row)", () => {
    // O's filled cells sit on template rows 1-2; spawning at row:-2 puts the first
    // of those at absolute row -1 (clipped) and the second at row 0 (kept).
    const piece = spawnPiece("O", COLS);
    const locked = lockPiece(emptyBoard(), piece);
    const filled = locked.flat().filter((c) => c !== null);
    expect(filled.length).toBeLessThan(4);
  });
});

describe("clearLines", () => {
  it("removes full rows and shifts the rest down, scoring by lines cleared", () => {
    const board = emptyBoard();
    board[ROWS - 1] = Array(COLS).fill("I");
    board[ROWS - 2][0] = "T"; // not full

    const result = clearLines(board);
    expect(result.cleared).toBe(1);
    expect(result.gained).toBe(100);
    expect(result.board.length).toBe(ROWS);
    expect(result.board[ROWS - 1][0]).toBe("T"); // shifted down into the cleared slot
    expect(result.board[0].every((c) => c === null)).toBe(true); // new empty row inserted at top
  });

  it("scores 0 for no cleared lines", () => {
    const result = clearLines(emptyBoard());
    expect(result.cleared).toBe(0);
    expect(result.gained).toBe(0);
  });
});

describe("speedForLines", () => {
  it("starts at each difficulty's base speed and floors at 100ms", () => {
    expect(speedForLines("easy", 0)).toBe(800);
    expect(speedForLines("hard", 0)).toBe(300);
    expect(speedForLines("hard", 100)).toBe(100);
  });
});
