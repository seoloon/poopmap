export type Tile = { id: number; value: number; row: number; col: number };
export type Direction = "left" | "right" | "up" | "down";

const SIZE = 4;

function emptyCells(tiles: Tile[]): [number, number][] {
  const occupied = new Set(tiles.map((t) => `${t.row},${t.col}`));
  const cells: [number, number][] = [];
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (!occupied.has(`${r},${c}`)) cells.push([r, c]);
  return cells;
}

/** Adds one new tile (value 2 90%, 4 10%) in a random empty cell, tagged with `nextId`.
 * No-op (same array reference, same nextId) if the board is already full. */
export function spawnTile(tiles: Tile[], nextId: number, rng: () => number = Math.random): { tiles: Tile[]; nextId: number } {
  const cells = emptyCells(tiles);
  if (cells.length === 0) return { tiles, nextId };
  const [row, col] = cells[Math.floor(rng() * cells.length)];
  const value = rng() < 0.9 ? 2 : 4;
  return { tiles: [...tiles, { id: nextId, value, row, col }], nextId: nextId + 1 };
}

export function createBoard(rng: () => number = Math.random): { tiles: Tile[]; nextId: number } {
  const first = spawnTile([], 1, rng);
  return spawnTile(first.tiles, first.nextId, rng);
}

type LineCell = { id: number; value: number };

/** Slides one line's cells toward index 0, merging equal adjacent values once each.
 * The surviving id of a merge is always the one closer to index 0 (the direction the line slides toward). */
function mergeLine(cells: LineCell[]): { cells: LineCell[]; gained: number; mergedIds: number[] } {
  const result: LineCell[] = [];
  let gained = 0;
  const mergedIds: number[] = [];
  for (let i = 0; i < cells.length; i++) {
    if (i < cells.length - 1 && cells[i].value === cells[i + 1].value) {
      const value = cells[i].value * 2;
      result.push({ id: cells[i].id, value });
      gained += value;
      mergedIds.push(cells[i].id);
      i++;
    } else {
      result.push(cells[i]);
    }
  }
  return { cells: result, gained, mergedIds };
}

function sameLayout(a: Tile[], b: Tile[]): boolean {
  if (a.length !== b.length) return false;
  const key = (t: Tile) => `${t.id}:${t.row}:${t.col}:${t.value}`;
  const setA = new Set(a.map(key));
  return b.every((t) => setA.has(key(t)));
}

/** Applies one move. Every direction slides each row/column toward the edge in that
 * direction, merging equal adjacent tiles once each and keeping stable tile ids so the
 * caller can animate a tile's position change instead of re-rendering the whole board. */
export function move(
  tiles: Tile[],
  direction: Direction
): { tiles: Tile[]; moved: boolean; gained: number; mergedIds: number[] } {
  const horizontal = direction === "left" || direction === "right";
  const reversed = direction === "right" || direction === "down";
  let gained = 0;
  const mergedIds: number[] = [];
  const nextTiles: Tile[] = [];

  for (let lineIndex = 0; lineIndex < SIZE; lineIndex++) {
    const lineTiles: LineCell[] = tiles
      .filter((t) => (horizontal ? t.row === lineIndex : t.col === lineIndex))
      .sort((a, b) => {
        const posA = horizontal ? a.col : a.row;
        const posB = horizontal ? b.col : b.row;
        return reversed ? posB - posA : posA - posB;
      })
      .map((t) => ({ id: t.id, value: t.value }));

    const { cells, gained: g, mergedIds: m } = mergeLine(lineTiles);
    gained += g;
    mergedIds.push(...m);

    cells.forEach((cell, i) => {
      const pos = reversed ? SIZE - 1 - i : i;
      nextTiles.push({
        id: cell.id,
        value: cell.value,
        row: horizontal ? lineIndex : pos,
        col: horizontal ? pos : lineIndex,
      });
    });
  }

  return { tiles: nextTiles, moved: !sameLayout(tiles, nextTiles), gained, mergedIds };
}

export function isGameOver(tiles: Tile[]): boolean {
  if (tiles.length < SIZE * SIZE) return false;
  const grid = new Map<string, number>();
  for (const t of tiles) grid.set(`${t.row},${t.col}`, t.value);
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const v = grid.get(`${r},${c}`);
      if (c < SIZE - 1 && v === grid.get(`${r},${c + 1}`)) return false;
      if (r < SIZE - 1 && v === grid.get(`${r + 1},${c}`)) return false;
    }
  }
  return true;
}
