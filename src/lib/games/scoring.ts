export type GameKind = "2048" | "minesweeper" | "sudoku" | "tetris";
export type GameDifficulty = "beginner" | "intermediate" | "expert" | "easy" | "medium" | "hard";

/** null = the game has a single mode and never asks for a difficulty (2048). */
export const DIFFICULTIES_BY_GAME: Record<GameKind, GameDifficulty[] | null> = {
  "2048": null,
  minesweeper: ["beginner", "intermediate", "expert"],
  sudoku: ["easy", "medium", "hard"],
  tetris: ["easy", "medium", "hard"],
};

/** true = a higher number is a better score (points); false = lower is better (seconds to complete). */
export const HIGHER_IS_BETTER: Record<GameKind, boolean> = {
  "2048": true,
  tetris: true,
  minesweeper: false,
  sudoku: false,
};

export const GAME_TO_DB: Record<GameKind, "TWENTY48" | "MINESWEEPER" | "SUDOKU" | "TETRIS"> = {
  "2048": "TWENTY48",
  minesweeper: "MINESWEEPER",
  sudoku: "SUDOKU",
  tetris: "TETRIS",
};

export const DB_TO_GAME: Record<string, GameKind> = {
  TWENTY48: "2048",
  MINESWEEPER: "minesweeper",
  SUDOKU: "sudoku",
  TETRIS: "tetris",
};

/** Whether `candidate` improves on `current` (null current = no record yet, always true). */
export function isNewBest(game: GameKind, candidate: number, current: number | null): boolean {
  if (current === null) return true;
  return HIGHER_IS_BETTER[game] ? candidate > current : candidate < current;
}
