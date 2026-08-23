import { describe, expect, it } from "vitest";
import { createBoard, isGameOver, move, spawnTile } from "./2048";

function boardWithRow(row: number[]): number[][] {
  return [row, [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
}

function boardWithColumn(col: number[]): number[][] {
  return col.map((v) => [v, 0, 0, 0]);
}

describe("move", () => {
  it("merges equal adjacent tiles leftward", () => {
    const result = move(boardWithRow([2, 2, 0, 0]), "left");
    expect(result.board[0]).toEqual([4, 0, 0, 0]);
    expect(result.gained).toBe(4);
    expect(result.moved).toBe(true);
  });

  it("merges equal adjacent tiles rightward", () => {
    const result = move(boardWithRow([2, 0, 0, 2]), "right");
    expect(result.board[0]).toEqual([0, 0, 0, 4]);
    expect(result.gained).toBe(4);
  });

  it("merges equal adjacent tiles upward", () => {
    const result = move(boardWithColumn([2, 0, 2, 0]), "up");
    expect(result.board.map((row) => row[0])).toEqual([4, 0, 0, 0]);
    expect(result.gained).toBe(4);
  });

  it("merges equal adjacent tiles downward", () => {
    const result = move(boardWithColumn([2, 0, 2, 0]), "down");
    expect(result.board.map((row) => row[0])).toEqual([0, 0, 0, 4]);
    expect(result.gained).toBe(4);
  });

  it("does not merge unequal tiles, and reports no movement when already flush", () => {
    const result = move(boardWithRow([2, 4, 0, 0]), "left");
    expect(result.board[0]).toEqual([2, 4, 0, 0]);
    expect(result.moved).toBe(false);
    expect(result.gained).toBe(0);
  });

  it("only merges once per pair per move (three equal tiles)", () => {
    const result = move(boardWithRow([2, 2, 2, 0]), "left");
    expect(result.board[0]).toEqual([4, 2, 0, 0]);
    expect(result.gained).toBe(4);
  });
});

describe("spawnTile", () => {
  it("places a tile in an empty cell using the provided rng", () => {
    const empty = [
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ];
    // rng() = 0 picks the first empty cell (0,0) and the "< 0.9" branch (value 2).
    const result = spawnTile(empty, () => 0);
    expect(result[0][0]).toBe(2);
    const nonZero = result.flat().filter((v) => v !== 0);
    expect(nonZero).toEqual([2]);
  });
});

describe("createBoard", () => {
  it("starts with exactly two tiles", () => {
    const board = createBoard();
    const nonZero = board.flat().filter((v) => v !== 0);
    expect(nonZero.length).toBe(2);
  });
});

describe("isGameOver", () => {
  it("is false when an empty cell remains", () => {
    expect(isGameOver(boardWithRow([2, 4, 8, 0]))).toBe(false);
  });

  it("is false when an adjacent merge is still possible", () => {
    const full = [
      [2, 4, 2, 4],
      [4, 2, 4, 2],
      [2, 4, 2, 4],
      [4, 2, 4, 2],
    ];
    full[0][0] = 4; // creates a horizontal 4,4 pair at row 0
    expect(isGameOver(full)).toBe(false);
  });

  it("is true when full with no possible merges", () => {
    const full = [
      [2, 4, 2, 4],
      [4, 2, 4, 2],
      [2, 4, 2, 4],
      [4, 2, 4, 2],
    ];
    expect(isGameOver(full)).toBe(true);
  });
});
