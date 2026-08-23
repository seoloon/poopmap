# Games arcade — Jeux tab

## Problem

The bottom nav now has a "Jeux" tab (placeholder, ships alongside the
leaderboard) but no games behind it. Goal: a small library of classic games
to pass the time — 2048, Démineur (Minesweeper), Sudoku, Tetris — presented
in a fun way that fits Caca'rte's toilet theme, plus the data groundwork for
a future cross-user games leaderboard (not built yet — just the storage and
the save path).

## Non-goals

- No games leaderboard UI or ranking endpoint yet — only the `GameScore`
  table and a save-on-finish endpoint. A future leaderboard reads this table
  without any backfill.
- No multiplayer, no timers/notifications, no game-specific moderation.
- No account requirement to play — only to persist a best score.
- No new difficulty levels for 2048 (single mode, as scoped).

## Design

### 1. Data model

New enum + table in `prisma/schema.prisma`. The project uses `prisma db
push` (no migrations folder — see Dockerfile's `CMD`), so this needs no
migration file, just a schema change picked up on next `db push`.

```prisma
enum GameKind {
  TWENTY48
  MINESWEEPER
  SUDOKU
  TETRIS
}

model GameScore {
  id         Int      @id @default(autoincrement())
  userId     Int      @map("user_id")
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  game       GameKind
  /// Null for 2048 (single mode). "beginner"|"intermediate"|"expert" for
  /// Démineur, "easy"|"medium"|"hard" for Sudoku and Tetris.
  difficulty String?
  bestScore  Int      @map("best_score")
  updatedAt  DateTime @updatedAt @map("updated_at")

  @@unique([userId, game, difficulty])
  @@map("game_scores")
}
```

Add `gameScores GameScore[]` to `User`. One row per (user, game,
difficulty) holding their personal best — upserted, never a history log.
This is sufficient for a future leaderboard (`ORDER BY bestScore` per
game+difficulty) with no reshaping needed.

Score direction is game-dependent:
- 2048: higher is better (points accumulated).
- Tetris: higher is better (lines-based score).
- Démineur: a completed game is win-or-loss; "score" is completion time in
  seconds, lower is better. Only a **win** is saved.
- Sudoku: same — completion time in seconds, lower is better, only a
  **completed** grid is saved.

Because "better" flips direction between games, the upsert logic (not a
raw SQL `GREATEST`) decides per game whether a new value beats the stored
one.

### 2. API

`POST /api/games/score` — body `{ game: GameKind, difficulty?: string,
score: number }`.
- 401 if not logged in (client simply doesn't call this when `me` is null —
  see "Access" below; this is a defensive check, not the primary gate).
- Validates `game` is a known enum value, `difficulty` matches the allowed
  set for that game (or is absent for TWENTY48), `score` is a positive
  integer.
- Upserts only if the new score beats the stored one for that
  (userId, game, difficulty), using the direction table above.
- Returns `{ bestScore, isNewRecord: boolean }`.

`GET /api/games/score?game=X` — returns the caller's saved bests for that
game (all difficulties) as `{ difficulty: string | null, bestScore: number
}[]`, empty array if logged out or no record yet. Powers the in-game
"Ton record" display. No cross-user data exposed by either route.

### 3. Access

Every game is playable by anyone, logged in or not (consistent with the
map itself being public). `POST /api/games/score` is only called from the
client when `me` is set; logged-out play just never persists. No dedicated
prompt-to-login inside a game — the existing login entry points (nav,
Profil tab) are enough; a subtle "Connecte-toi pour garder ton record" hint
is shown next to the score once a game ends while logged out.

### 4. Games library shell — "Salle d'arcade"

`GamesPage.tsx` is rebuilt around a toilet-stall arcade concept:
- A row of stall doors, one per game, styled with the existing sticker/ink
  palette (`--color-ink` outlines, `--color-signage` for neon accents).
- Each door carries the game's emoji/icon and a flip sign reading "LIBRE"
  (green, `--color-teal`) — there's no real occupancy state, it's pure
  flavor — clicking swings the door open (short CSS/`framer-motion`
  transition) and mounts the game full-screen (same layered pattern as
  `ProfilePage`/`LeaderboardPage`, `absolute inset-0 z-[1000]`).
- Every game screen shares a small `GameShell` wrapper: a header with a
  "🚪 Sortir" back button, the game title, and (once loaded) "Ton record"
  pulled from `GET /api/games/score`. Individual games render inside it and
  call an `onFinish(score, difficulty?)` callback; `GameShell` handles the
  `POST` and the "nouveau record 🎉" toast.
- Games needing a difficulty picker (Démineur, Sudoku, Tetris) show a small
  selector screen inside `GameShell` before the board mounts; 2048 skips
  straight to the board.

### 5. The four games

All client-only React components under `src/components/games/`, no server
dependency beyond the score save. Pure game logic (grid transforms, win
checks, collision) lives in plain functions in `src/lib/games/<name>.ts` so
it's unit-testable without mounting React.

- **2048** (`lib/games/2048.ts` + `Game2048.tsx`) — 4×4 grid, arrow
  keys/swipe, standard merge rules, score = sum of merged tile values,
  ends on no-moves-left or a toast on reaching 2048 (play continues after).
- **Démineur** (`lib/games/minesweeper.ts` + `GameMinesweeper.tsx`) — 3
  levels (beginner 9×9/10 mines, intermediate 16×16/40, expert 16×30/99),
  left-click reveal (flood-fill zero cells), right-click/long-press flag,
  timer running while playing, save on win only.
- **Sudoku** (`lib/games/sudoku.ts` + `GameSudoku.tsx`) — generate a
  solved grid then remove cells per difficulty (easy 40 given, medium 32,
  hard 26), client-side validity check per row/col/box on entry, timer,
  save on full valid completion only.
- **Tetris** (`lib/games/tetris.ts` + `GameTetris.tsx`) — 3 starting
  speeds (slow/medium/fast level), standard 7-piece set, line-clear
  scoring (single/double/triple/tetris point table), speed increases as
  lines clear, save on game-over.

### 6. Testing

Unit tests for the pure logic modules (merge/slide correctness for 2048,
flood-fill + win detection for Minesweeper, generator producing a valid
uniquely-solvable-enough grid + row/col/box validation for Sudoku,
rotation/collision/line-clear for Tetris) — same style as existing
`*.test.ts` files (Vitest, no React rendering). No automated visual/UI
tests, consistent with the rest of the app.

## Open questions resolved during brainstorming

- Score persistence: DB now (`GameScore` table), not localStorage.
- Access: playable by all, saved only when logged in.
- Difficulty: levels for Démineur/Sudoku/Tetris, single mode for 2048.
- Visual theme: toilet-stall arcade room.
