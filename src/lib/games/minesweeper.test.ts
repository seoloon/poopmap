import { describe, expect, it } from "vitest";
import { buildBoard, checkWin, hasExploded, reveal, toggleFlag, CONFIG } from "./minesweeper";

describe("CONFIG", () => {
  it("has the expected size/mine counts per difficulty", () => {
    expect(CONFIG.beginner).toEqual({ rows: 9, cols: 9, mines: 10 });
    expect(CONFIG.intermediate).toEqual({ rows: 16, cols: 16, mines: 40 });
    expect(CONFIG.expert).toEqual({ rows: 16, cols: 30, mines: 99 });
  });
});

describe("buildBoard", () => {
  it("computes adjacent-mine counts for non-mine cells", () => {
    // 3x3 grid, single mine at the center.
    const mines = [
      [false, false, false],
      [false, true, false],
      [false, false, false],
    ];
    const board = buildBoard(mines);
    expect(board[0][0].adjacent).toBe(1);
    expect(board[0][1].adjacent).toBe(1);
    expect(board[1][1].mine).toBe(true);
    expect(board[2][2].adjacent).toBe(1);
  });

  it("every cell starts unrevealed and unflagged", () => {
    const board = buildBoard([[false]]);
    expect(board[0][0]).toEqual({ mine: false, revealed: false, flagged: false, adjacent: 0 });
  });
});

describe("reveal", () => {
  it("flood-fills connected zero-adjacency cells", () => {
    // No mines at all: revealing any cell should reveal the whole board.
    const board = buildBoard([
      [false, false],
      [false, false],
    ]);
    const revealed = reveal(board, 0, 0);
    expect(revealed.every((row) => row.every((cell) => cell.revealed))).toBe(true);
  });

  it("stops at the boundary of a non-zero cell (does not flood past it)", () => {
    const mines = [
      [false, false, false],
      [false, true, false],
      [false, false, false],
    ];
    const board = buildBoard(mines);
    const revealed = reveal(board, 0, 0);
    // (0,0) has adjacent=1 (touches the mine diagonally), so it reveals itself only.
    expect(revealed[0][0].revealed).toBe(true);
    expect(revealed[2][2].revealed).toBe(false);
  });

  it("does not reveal a flagged cell", () => {
    const board = toggleFlag(buildBoard([[false]]), 0, 0);
    const revealed = reveal(board, 0, 0);
    expect(revealed[0][0].revealed).toBe(false);
  });
});

describe("toggleFlag", () => {
  it("flags and unflags an unrevealed cell", () => {
    const board = buildBoard([[false]]);
    const flagged = toggleFlag(board, 0, 0);
    expect(flagged[0][0].flagged).toBe(true);
    const unflagged = toggleFlag(flagged, 0, 0);
    expect(unflagged[0][0].flagged).toBe(false);
  });

  it("does nothing on an already-revealed cell", () => {
    const board = reveal(buildBoard([[false]]), 0, 0);
    const result = toggleFlag(board, 0, 0);
    expect(result[0][0].flagged).toBe(false);
  });
});

describe("checkWin / hasExploded", () => {
  it("checkWin is true once every non-mine cell is revealed", () => {
    const mines = [[false, true]];
    const board = reveal(buildBoard(mines), 0, 0);
    expect(checkWin(board)).toBe(true);
  });

  it("checkWin is false while a non-mine cell is still hidden", () => {
    const mines = [[false, true]];
    expect(checkWin(buildBoard(mines))).toBe(false);
  });

  it("hasExploded is true once a mine cell is revealed", () => {
    const mines = [[true]];
    const revealed = reveal(buildBoard(mines), 0, 0);
    expect(hasExploded(revealed)).toBe(true);
  });

  it("hasExploded is false when no mine has been revealed", () => {
    expect(hasExploded(buildBoard([[true]]))).toBe(false);
  });
});
