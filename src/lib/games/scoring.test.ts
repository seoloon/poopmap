import { describe, expect, it } from "vitest";
import { DIFFICULTIES_BY_GAME, GAME_TO_DB, DB_TO_GAME, HIGHER_IS_BETTER, isNewBest } from "./scoring";

describe("DIFFICULTIES_BY_GAME", () => {
  it("2048 has no difficulty levels", () => {
    expect(DIFFICULTIES_BY_GAME["2048"]).toBeNull();
  });

  it("the other three games each expose 3 levels", () => {
    expect(DIFFICULTIES_BY_GAME.minesweeper).toEqual(["beginner", "intermediate", "expert"]);
    expect(DIFFICULTIES_BY_GAME.sudoku).toEqual(["easy", "medium", "hard"]);
    expect(DIFFICULTIES_BY_GAME.tetris).toEqual(["easy", "medium", "hard"]);
  });
});

describe("GAME_TO_DB / DB_TO_GAME", () => {
  it("round-trip every game slug", () => {
    for (const game of ["2048", "minesweeper", "sudoku", "tetris"] as const) {
      expect(DB_TO_GAME[GAME_TO_DB[game]]).toBe(game);
    }
  });
});

describe("isNewBest", () => {
  it("any score beats no prior record", () => {
    expect(isNewBest("2048", 100, null)).toBe(true);
    expect(isNewBest("minesweeper", 42, null)).toBe(true);
  });

  it("higher-is-better games (2048, tetris): only a strictly higher score wins", () => {
    expect(isNewBest("2048", 200, 100)).toBe(true);
    expect(isNewBest("2048", 100, 200)).toBe(false);
    expect(isNewBest("2048", 100, 100)).toBe(false);
    expect(isNewBest("tetris", 500, 300)).toBe(true);
  });

  it("lower-is-better games (minesweeper, sudoku): only a strictly lower score wins", () => {
    expect(isNewBest("minesweeper", 30, 45)).toBe(true);
    expect(isNewBest("minesweeper", 45, 30)).toBe(false);
    expect(isNewBest("sudoku", 120, 120)).toBe(false);
  });
});
