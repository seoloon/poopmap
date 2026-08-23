import { describe, expect, it } from "vitest";
import { createBoard, isGameOver, move, spawnTile, type Tile } from "./2048";

function tile(id: number, value: number, row: number, col: number): Tile {
  return { id, value, row, col };
}

describe("move", () => {
  it("merges equal adjacent tiles leftward, keeping the leftmost tile's id", () => {
    const result = move([tile(1, 2, 0, 0), tile(2, 2, 0, 1)], "left");
    expect(result.tiles).toEqual([tile(1, 4, 0, 0)]);
    expect(result.gained).toBe(4);
    expect(result.moved).toBe(true);
    expect(result.mergedIds).toEqual([1]);
  });

  it("merges equal adjacent tiles rightward, keeping the tile closer to the target edge", () => {
    const result = move([tile(1, 2, 0, 0), tile(2, 2, 0, 3)], "right");
    expect(result.tiles).toEqual([tile(2, 4, 0, 3)]);
    expect(result.gained).toBe(4);
  });

  it("merges equal adjacent tiles upward", () => {
    const result = move([tile(1, 2, 0, 0), tile(2, 2, 2, 0)], "up");
    expect(result.tiles).toEqual([tile(1, 4, 0, 0)]);
    expect(result.gained).toBe(4);
  });

  it("merges equal adjacent tiles downward, keeping the tile closer to the target edge", () => {
    const result = move([tile(1, 2, 0, 0), tile(2, 2, 2, 0)], "down");
    expect(result.tiles).toEqual([tile(2, 4, 3, 0)]);
    expect(result.gained).toBe(4);
  });

  it("slides without merging unequal tiles, and reports no movement when already flush", () => {
    const tiles = [tile(1, 2, 0, 0), tile(2, 4, 0, 1)];
    const result = move(tiles, "left");
    expect(result.tiles.sort((a, b) => a.id - b.id)).toEqual(tiles);
    expect(result.moved).toBe(false);
    expect(result.gained).toBe(0);
    expect(result.mergedIds).toEqual([]);
  });

  it("only merges once per pair per move (three equal tiles)", () => {
    const result = move([tile(1, 2, 0, 0), tile(2, 2, 0, 1), tile(3, 2, 0, 2)], "left");
    const sorted = result.tiles.sort((a, b) => a.col - b.col);
    expect(sorted).toEqual([tile(1, 4, 0, 0), tile(3, 2, 0, 1)]);
    expect(result.gained).toBe(4);
    expect(result.mergedIds).toEqual([1]);
  });

  it("preserves tile identity across a pure slide (no merge)", () => {
    const result = move([tile(7, 2, 0, 3)], "left");
    expect(result.tiles).toEqual([tile(7, 2, 0, 0)]);
    expect(result.moved).toBe(true);
  });
});

describe("spawnTile", () => {
  it("places a tile in an empty cell using the provided rng, and returns the incremented id", () => {
    const result = spawnTile([], 5, () => 0);
    expect(result.tiles).toEqual([{ id: 5, value: 2, row: 0, col: 0 }]);
    expect(result.nextId).toBe(6);
  });

  it("is a no-op (same nextId) when the board is already full", () => {
    const full: Tile[] = [];
    let id = 1;
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) full.push(tile(id++, 2, r, c));
    const result = spawnTile(full, id);
    expect(result.tiles).toBe(full);
    expect(result.nextId).toBe(id);
  });
});

describe("createBoard", () => {
  it("starts with exactly two tiles and a nextId past both", () => {
    const { tiles, nextId } = createBoard();
    expect(tiles.length).toBe(2);
    expect(nextId).toBe(3);
  });
});

describe("isGameOver", () => {
  it("is false when fewer than 16 tiles are on the board", () => {
    expect(isGameOver([tile(1, 2, 0, 0)])).toBe(false);
  });

  it("is false when a full board still has an adjacent equal pair", () => {
    const tiles: Tile[] = [];
    let id = 1;
    const values = [
      [4, 4, 2, 4],
      [4, 2, 4, 2],
      [2, 4, 2, 4],
      [4, 2, 4, 2],
    ];
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) tiles.push(tile(id++, values[r][c], r, c));
    expect(isGameOver(tiles)).toBe(false);
  });

  it("is true when full with no possible merges", () => {
    const tiles: Tile[] = [];
    let id = 1;
    const values = [
      [2, 4, 2, 4],
      [4, 2, 4, 2],
      [2, 4, 2, 4],
      [4, 2, 4, 2],
    ];
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) tiles.push(tile(id++, values[r][c], r, c));
    expect(isGameOver(tiles)).toBe(true);
  });
});
