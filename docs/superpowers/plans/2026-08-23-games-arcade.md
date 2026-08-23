# Games Arcade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a "Jeux" tab with a toilet-arcade lobby leading to four playable mini-games (2048, Démineur, Sudoku, Tetris), plus the DB-backed personal-best storage a future leaderboard will read.

**Architecture:** Every game's rules live as plain, framework-free functions in `src/lib/games/<name>.ts` (unit-tested, no React). Each game gets a thin React component (`src/components/games/Game<Name>.tsx`) that holds UI state and calls the pure functions. A shared `GameShell` component (back button, difficulty picker, personal-record display, score POST) wraps every game so score persistence is written once. `GamesPage.tsx` is the lobby: a grid of stall doors, each opening its game inside `GameShell`.

**Tech Stack:** Next.js App Router, React (client components), Prisma/Postgres, Vitest, Tailwind (existing sticker/pastel palette), framer-motion (existing pattern for full-screen tab views).

**Spec:** `docs/superpowers/specs/2026-08-23-games-arcade-design.md`

## Global Constraints

- Games are playable by anyone, logged in or not; score is only persisted (`POST /api/games/score`) when a session exists — no login prompt blocks play.
- No games leaderboard UI/endpoint in this plan — only `GameScore` storage and the save/read routes a future leaderboard will use.
- 2048 has a single mode (no difficulty). Démineur, Sudoku, and Tetris each expose 3 difficulty levels.
- The project uses `prisma db push` (no `prisma/migrations` folder) — schema changes need no migration file, just editing `prisma/schema.prisma`.
- French copy throughout (matches the rest of the app), same sticker/pastel Tailwind classes and `font-display` headings used elsewhere (see `src/components/ProfilePage.tsx`, `src/components/LeaderboardPage.tsx` for reference).
- Every game screen mounts full-screen the same way `ProfilePage`/`LeaderboardPage` do: `className="absolute inset-0 z-[1000] overflow-y-auto bg-cream"` wrapped in a `framer-motion` fade/slide.

---

## Task 1: Data model — `GameScore`

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Produces: Prisma enum `GameKind` (`TWENTY48`, `MINESWEEPER`, `SUDOKU`, `TETRIS`) and model `GameScore { id, userId, game, difficulty: String, bestScore: Int, updatedAt }` with `@@unique([userId, game, difficulty])` (Prisma's generated compound-unique key name is `userId_game_difficulty` — later tasks rely on that exact name). `difficulty` is **never null** — 2048 stores the literal string `"none"` — because Postgres treats `NULL` as distinct from `NULL` in unique constraints, which would silently break "one best score per user+game" for the no-difficulty case.

- [ ] **Step 1: Add the enum and model to `prisma/schema.prisma`**

Add this enum near the other enums (e.g. after `NotificationStatus`):

```prisma
enum GameKind {
  TWENTY48
  MINESWEEPER
  SUDOKU
  TETRIS
}
```

Add this model near the end of the file (after `Meta`):

```prisma
/// One row per (user, game, difficulty) holding their personal best — upserted,
/// never a history log. `difficulty` is always a real string, never null: Postgres
/// doesn't enforce uniqueness across NULLs, so 2048 (which has no difficulty)
/// stores the sentinel "none" instead of null to keep `@@unique` meaningful.
model GameScore {
  id         Int      @id @default(autoincrement())
  userId     Int      @map("user_id")
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  game       GameKind
  difficulty String
  bestScore  Int      @map("best_score")
  updatedAt  DateTime @updatedAt @map("updated_at")

  @@unique([userId, game, difficulty])
  @@map("game_scores")
}
```

Add the back-relation to `User` (in the relations block alongside `notifications`, `reports`, etc.):

```prisma
  gameScores          GameScore[]
```

- [ ] **Step 2: Regenerate the Prisma client**

Run: `npx prisma generate`
Expected: `✔ Generated Prisma Client` with no errors — this only reads the schema file, no DB connection needed.

- [ ] **Step 3: Verify the project still typechecks**

Run: `npx tsc --noEmit`
Expected: no errors (nothing references the new model yet, so this just confirms the generate didn't break anything).

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "Add GameScore model for per-user best game scores"
```

---

## Task 2: Shared scoring logic

**Files:**
- Create: `src/lib/games/scoring.ts`
- Test: `src/lib/games/scoring.test.ts`

**Interfaces:**
- Consumes: nothing (pure module).
- Produces:
  - `type GameKind = "2048" | "minesweeper" | "sudoku" | "tetris"`
  - `type GameDifficulty = "beginner" | "intermediate" | "expert" | "easy" | "medium" | "hard"`
  - `DIFFICULTIES_BY_GAME: Record<GameKind, GameDifficulty[] | null>` — `null` for `"2048"`.
  - `HIGHER_IS_BETTER: Record<GameKind, boolean>` — `true` for `"2048"`/`"tetris"`, `false` for `"minesweeper"`/`"sudoku"`.
  - `isNewBest(game: GameKind, candidate: number, current: number | null): boolean`
  - `GAME_TO_DB: Record<GameKind, "TWENTY48" | "MINESWEEPER" | "SUDOKU" | "TETRIS">` and `DB_TO_GAME: Record<string, GameKind>` — string-literal maps between the client-facing slugs and the Prisma enum's string values (kept here, not imported from `@prisma/client`, so this module has zero Prisma dependency and stays trivially unit-testable).
  - Task 3 (API routes) and Task 4 (`GameShell`) both import from this file — these exact names must not change.

- [ ] **Step 1: Write the failing test**

Create `src/lib/games/scoring.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/games/scoring.test.ts`
Expected: FAIL — `Cannot find module './scoring'`

- [ ] **Step 3: Write the implementation**

Create `src/lib/games/scoring.ts`:

```typescript
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/games/scoring.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/games/scoring.ts src/lib/games/scoring.test.ts
git commit -m "Add shared scoring rules for the games arcade"
```

---

## Task 3: Score API routes

**Files:**
- Create: `src/app/api/games/score/route.ts`
- Test: `src/app/api/games/score/route.test.ts`

**Interfaces:**
- Consumes: `GameKind`, `GameDifficulty`, `DIFFICULTIES_BY_GAME`, `GAME_TO_DB`, `isNewBest` from `src/lib/games/scoring.ts` (Task 2); `getSessionUser` from `@/lib/auth`; `prisma` from `@/lib/prisma`; `isRateLimited` from `@/lib/rate-limit`; `withApiErrorHandling` from `@/lib/api-error`.
- Produces:
  - `GET /api/games/score?game=<slug>` → `{ bests: { difficulty: string | null; bestScore: number }[] }`. Logged out → `{ bests: [] }`, 200. Unknown `game` → 400. `difficulty` in the response is `null` for the `"none"` sentinel (2048) so `GameShell` (Task 4) never has to know about the DB-only sentinel.
  - `POST /api/games/score` body `{ game: string; difficulty?: string; score: number }` → `{ bestScore: number; isNewRecord: boolean }`. 401 if logged out, 400 for an invalid `game`/`difficulty`/`score`, 429 if rate-limited.

- [ ] **Step 1: Write the failing test**

Create `src/app/api/games/score/route.test.ts`:

```typescript
import { describe, expect, it, vi, beforeEach } from "vitest";

const findUnique = vi.fn();
const findMany = vi.fn();
const upsert = vi.fn();
const getSessionUser = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    gameScore: {
      findUnique: (...args: unknown[]) => findUnique(...args),
      findMany: (...args: unknown[]) => findMany(...args),
      upsert: (...args: unknown[]) => upsert(...args),
    },
  },
}));
vi.mock("@/lib/auth", () => ({ getSessionUser: (...args: unknown[]) => getSessionUser(...args) }));
vi.mock("@/lib/rate-limit", () => ({ isRateLimited: () => false }));

const ME = { id: 7, pseudo: "Alice", role: "user", username: "alice" };

function postReq(body: unknown) {
  return new Request("http://localhost/api/games/score", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function getReq(qs: string) {
  return new Request(`http://localhost/api/games/score${qs}`);
}

describe("GET /api/games/score", () => {
  beforeEach(() => {
    findMany.mockClear();
    getSessionUser.mockReset();
  });

  it("returns an empty list when logged out", async () => {
    getSessionUser.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET(getReq("?game=2048") as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ bests: [] });
  });

  it("400s for an unknown game", async () => {
    getSessionUser.mockResolvedValue(ME);
    const { GET } = await import("./route");
    const res = await GET(getReq("?game=chess") as never);
    expect(res.status).toBe(400);
  });

  it("maps the 2048 'none' sentinel back to null for the client", async () => {
    getSessionUser.mockResolvedValue(ME);
    findMany.mockResolvedValue([{ difficulty: "none", bestScore: 900 }]);
    const { GET } = await import("./route");
    const res = await GET(getReq("?game=2048") as never);
    expect(await res.json()).toEqual({ bests: [{ difficulty: null, bestScore: 900 }] });
  });
});

describe("POST /api/games/score", () => {
  beforeEach(() => {
    findUnique.mockReset();
    upsert.mockReset();
    getSessionUser.mockReset();
  });

  it("401s when logged out", async () => {
    getSessionUser.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(postReq({ game: "2048", score: 100 }) as never);
    expect(res.status).toBe(401);
  });

  it("400s for a game/difficulty mismatch (2048 doesn't take a difficulty)", async () => {
    getSessionUser.mockResolvedValue(ME);
    const { POST } = await import("./route");
    const res = await POST(postReq({ game: "2048", difficulty: "easy", score: 100 }) as never);
    expect(res.status).toBe(400);
  });

  it("400s when a difficulty-requiring game is missing one", async () => {
    getSessionUser.mockResolvedValue(ME);
    const { POST } = await import("./route");
    const res = await POST(postReq({ game: "sudoku", score: 100 }) as never);
    expect(res.status).toBe(400);
  });

  it("stores the 2048 sentinel difficulty and upserts a new best", async () => {
    getSessionUser.mockResolvedValue(ME);
    findUnique.mockResolvedValue(null);
    upsert.mockResolvedValue({ bestScore: 500 });
    const { POST } = await import("./route");
    const res = await POST(postReq({ game: "2048", score: 500 }) as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ bestScore: 500, isNewRecord: true });
    expect(upsert.mock.calls[0][0].where).toEqual({
      userId_game_difficulty: { userId: 7, game: "TWENTY48", difficulty: "none" },
    });
  });

  it("does not upsert when the new score doesn't beat the record", async () => {
    getSessionUser.mockResolvedValue(ME);
    findUnique.mockResolvedValue({ bestScore: 40 });
    const { POST } = await import("./route");
    const res = await POST(postReq({ game: "minesweeper", difficulty: "beginner", score: 60 }) as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ bestScore: 40, isNewRecord: false });
    expect(upsert).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/app/api/games/score/route.test.ts`
Expected: FAIL — `Cannot find module './route'`

- [ ] **Step 3: Write the implementation**

Create `src/app/api/games/score/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { withApiErrorHandling } from "@/lib/api-error";
import { isRateLimited } from "@/lib/rate-limit";
import {
  DIFFICULTIES_BY_GAME,
  GAME_TO_DB,
  DB_TO_GAME,
  isNewBest,
  type GameDifficulty,
  type GameKind,
} from "@/lib/games/scoring";

/** Stand-in for "no difficulty" (2048) — see the GameScore model's doc comment for why. */
const NO_DIFFICULTY = "none";

function parseGame(value: string | null): GameKind | null {
  return value !== null && value in GAME_TO_DB ? (value as GameKind) : null;
}

export const GET = withApiErrorHandling(async (req: Request) => {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ bests: [] });

  const game = parseGame(new URL(req.url).searchParams.get("game"));
  if (!game) return NextResponse.json({ error: "Jeu invalide" }, { status: 400 });

  const rows = await prisma.gameScore.findMany({
    where: { userId: me.id, game: GAME_TO_DB[game] },
    select: { difficulty: true, bestScore: true },
  });

  return NextResponse.json({
    bests: rows.map((r) => ({ difficulty: r.difficulty === NO_DIFFICULTY ? null : r.difficulty, bestScore: r.bestScore })),
  });
});

export const POST = withApiErrorHandling(async (req: Request) => {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Connecte-toi pour sauvegarder ton score" }, { status: 401 });
  if (isRateLimited(`game-score:${me.id}`, 120)) {
    return NextResponse.json({ error: "Doucement — réessaie dans quelques minutes" }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });

  const { game: rawGame, difficulty: rawDifficulty, score } = body as Record<string, unknown>;
  const game = parseGame(typeof rawGame === "string" ? rawGame : null);
  if (!game) return NextResponse.json({ error: "Jeu invalide" }, { status: 400 });

  const allowed = DIFFICULTIES_BY_GAME[game];
  let difficulty: string;
  if (allowed === null) {
    if (rawDifficulty !== undefined && rawDifficulty !== null) {
      return NextResponse.json({ error: "Ce jeu n'a pas de difficulté" }, { status: 400 });
    }
    difficulty = NO_DIFFICULTY;
  } else {
    if (typeof rawDifficulty !== "string" || !allowed.includes(rawDifficulty as GameDifficulty)) {
      return NextResponse.json({ error: "Difficulté invalide" }, { status: 400 });
    }
    difficulty = rawDifficulty;
  }

  if (typeof score !== "number" || !Number.isInteger(score) || score < 0) {
    return NextResponse.json({ error: "Score invalide" }, { status: 400 });
  }

  const where = { userId_game_difficulty: { userId: me.id, game: GAME_TO_DB[game], difficulty } };
  const existing = await prisma.gameScore.findUnique({ where });

  if (existing && !isNewBest(game, score, existing.bestScore)) {
    return NextResponse.json({ bestScore: existing.bestScore, isNewRecord: false });
  }

  const row = await prisma.gameScore.upsert({
    where,
    create: { userId: me.id, game: GAME_TO_DB[game], difficulty, bestScore: score },
    update: { bestScore: score },
  });

  return NextResponse.json({ bestScore: row.bestScore, isNewRecord: true });
});
```

`DB_TO_GAME` is exported from `scoring.ts` for future consumers (a leaderboard route reading `GameScore` rows back into client slugs) — this route doesn't need it itself, so an unused-import lint would fire if it were imported here; it correctly is **not** imported in this file.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/app/api/games/score/route.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint src/app/api/games/score/route.ts`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/app/api/games/score/
git commit -m "Add score persistence endpoint for the games arcade"
```

---

## Task 4: `GameShell` — shared wrapper

**Files:**
- Create: `src/components/GameShell.tsx`

**Interfaces:**
- Consumes: `SessionUser` from `@/lib/types`; `GameKind`, `GameDifficulty`, `DIFFICULTIES_BY_GAME`, `HIGHER_IS_BETTER` from `@/lib/games/scoring` (Task 2); `toast` from `./Toasts`; `GET`/`POST /api/games/score` (Task 3).
- Produces: `GameShell` component with props `{ title: string; emoji: string; game: GameKind; me: SessionUser | null; onExit: () => void; children: (ctx: { difficulty: GameDifficulty | null; finish: (score: number) => void }) => React.ReactNode }`. Every game screen built in Tasks 5–8 renders inside this via the render-prop `children`. `difficulty` passed to `children` is `null` only for games with no difficulty levels (`DIFFICULTIES_BY_GAME[game] === null`); otherwise it's always one of that game's allowed values by the time `children` is invoked (the difficulty picker gates rendering until a choice is made).

No unit test for this task — it's a React component with no pure logic to extract (matches the spec's "no automated visual/UI tests" scope). Verify it by typechecking/linting and by visual check once wired into `GamesPage` in Task 9.

- [ ] **Step 1: Write the component**

Create `src/components/GameShell.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import type { SessionUser } from "@/lib/types";
import { DIFFICULTIES_BY_GAME, HIGHER_IS_BETTER, type GameDifficulty, type GameKind } from "@/lib/games/scoring";
import { toast } from "./Toasts";

const DIFFICULTY_LABEL: Record<GameDifficulty, string> = {
  beginner: "🌱 Débutant",
  intermediate: "🔥 Intermédiaire",
  expert: "💀 Expert",
  easy: "🌱 Facile",
  medium: "🔥 Moyen",
  hard: "💀 Difficile",
};

function formatScore(game: GameKind, value: number): string {
  if (HIGHER_IS_BETTER[game]) return `${value} pts`;
  const minutes = Math.floor(value / 60);
  const seconds = value % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

type RenderCtx = { difficulty: GameDifficulty | null; finish: (score: number) => void };

type Props = {
  title: string;
  emoji: string;
  game: GameKind;
  me: SessionUser | null;
  onExit: () => void;
  children: (ctx: RenderCtx) => React.ReactNode;
};

/**
 * Shared wrapper for every game: back button, difficulty picker (for games that
 * have one), personal-record display, and score persistence on finish. Individual
 * games only render their board and call `finish(score)` when the game ends.
 */
export default function GameShell({ title, emoji, game, me, onExit, children }: Props) {
  const difficulties = DIFFICULTIES_BY_GAME[game];
  const [difficulty, setDifficulty] = useState<GameDifficulty | null>(null);
  const [record, setRecord] = useState<number | null>(null);
  const ready = difficulties === null || difficulty !== null;

  useEffect(() => {
    if (!me || !ready) return;
    let cancelled = false;
    fetch(`/api/games/score?game=${game}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d) return;
        const row = (d.bests as { difficulty: string | null; bestScore: number }[]).find(
          (b) => b.difficulty === difficulty
        );
        setRecord(row?.bestScore ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [me, game, difficulty, ready]);

  const finish = (score: number) => {
    if (!me) {
      toast("Connecte-toi pour garder ton record 🔒");
      return;
    }
    void fetch("/api/games/score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ game, difficulty: difficulty ?? undefined, score }),
    })
      .then((r) => r.json())
      .then((body) => {
        if (body?.isNewRecord) {
          setRecord(body.bestScore);
          toast("Nouveau record ! 🎉");
        }
      })
      .catch(() => {
        /* non-fatal — the game already ended client-side */
      });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      transition={{ duration: 0.22 }}
      className="absolute inset-0 z-[1000] overflow-y-auto bg-cream"
    >
      <div className="mx-auto max-w-lg px-4 pb-32 pt-6">
        <div className="mb-4 flex items-center gap-3">
          <button
            onClick={onExit}
            className="sticker-sm sticker-press shrink-0 rounded-xl px-3 py-2 text-xs font-extrabold transition hover:bg-blush"
          >
            🚪 Sortir
          </button>
          <h1 className="flex-1 text-center font-display text-xl font-extrabold tracking-tight">
            {emoji} {title}
          </h1>
        </div>

        {record !== null && (
          <p className="mb-3 text-center text-xs font-bold text-ink/50">Ton record : {formatScore(game, record)}</p>
        )}

        {!ready && difficulties ? (
          <div className="sticker space-y-3 rounded-[24px] p-5">
            <p className="text-center text-sm font-bold text-ink/70">Choisis ta difficulté</p>
            {difficulties.map((d) => (
              <button
                key={d}
                onClick={() => setDifficulty(d)}
                className="sticker-sm sticker-press block w-full rounded-xl px-4 py-2.5 text-sm font-extrabold transition hover:bg-blush"
              >
                {DIFFICULTY_LABEL[d]}
              </button>
            ))}
          </div>
        ) : (
          children({ difficulty, finish })
        )}
      </div>
    </motion.div>
  );
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint src/components/GameShell.tsx`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/components/GameShell.tsx
git commit -m "Add GameShell wrapper for score persistence and difficulty picking"
```

---

## Task 5: 2048

**Files:**
- Create: `src/lib/games/2048.ts`
- Test: `src/lib/games/2048.test.ts`
- Create: `src/components/games/Game2048.tsx`

**Interfaces:**
- Consumes: nothing beyond React/browser APIs in the component.
- Produces (consumed by Task 9's lobby wiring):
  - `type Board2048 = number[][]` (4×4, `0` = empty)
  - `type Direction = "left" | "right" | "up" | "down"`
  - `createBoard(rng?: () => number): Board2048`
  - `move(board: Board2048, direction: Direction): { board: Board2048; moved: boolean; gained: number }`
  - `spawnTile(board: Board2048, rng?: () => number): Board2048`
  - `isGameOver(board: Board2048): boolean`
  - `Game2048` component: `{ onFinish: (score: number) => void }`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/games/2048.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/games/2048.test.ts`
Expected: FAIL — `Cannot find module './2048'`

- [ ] **Step 3: Write the pure logic**

Create `src/lib/games/2048.ts`:

```typescript
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/games/2048.test.ts`
Expected: PASS (10 tests)

- [ ] **Step 5: Write the component**

Create `src/components/games/Game2048.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createBoard, isGameOver, move, spawnTile, type Board2048, type Direction } from "@/lib/games/2048";

const TILE_COLORS: Record<number, string> = {
  2: "bg-blush text-ink",
  4: "bg-signage text-ink",
  8: "bg-terracotta text-white",
  16: "bg-terracotta-dark text-white",
  32: "bg-sage text-ink",
  64: "bg-sage-dark text-white",
  128: "bg-teal text-white",
  256: "bg-teal-dark text-white",
};

const KEY_TO_DIRECTION: Record<string, Direction> = {
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "up",
  ArrowDown: "down",
};

const SWIPE_THRESHOLD_PX = 24;

export default function Game2048({ onFinish }: { onFinish: (score: number) => void }) {
  const [board, setBoard] = useState<Board2048>(() => createBoard());
  const [score, setScore] = useState(0);
  const [over, setOver] = useState(false);
  const finishedRef = useRef(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const play = useCallback(
    (direction: Direction) => {
      if (over) return;
      setBoard((current) => {
        const result = move(current, direction);
        if (!result.moved) return current;
        const spawned = spawnTile(result.board);
        setScore((s) => s + result.gained);
        if (isGameOver(spawned)) setOver(true);
        return spawned;
      });
    },
    [over]
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const direction = KEY_TO_DIRECTION[e.key];
      if (direction) {
        e.preventDefault();
        play(direction);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [play]);

  useEffect(() => {
    if (over && !finishedRef.current) {
      finishedRef.current = true;
      onFinish(score);
    }
  }, [over, score, onFinish]);

  return (
    <div className="space-y-3">
      <p className="text-center font-display text-2xl font-extrabold">{score} pts</p>
      <div
        className="mx-auto grid aspect-square w-full max-w-xs grid-cols-4 gap-2 rounded-2xl bg-ink/10 p-2"
        onTouchStart={(e) => {
          const t = e.touches[0];
          touchStart.current = { x: t.clientX, y: t.clientY };
        }}
        onTouchEnd={(e) => {
          if (!touchStart.current) return;
          const t = e.changedTouches[0];
          const dx = t.clientX - touchStart.current.x;
          const dy = t.clientY - touchStart.current.y;
          touchStart.current = null;
          if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_THRESHOLD_PX) return;
          if (Math.abs(dx) > Math.abs(dy)) play(dx > 0 ? "right" : "left");
          else play(dy > 0 ? "down" : "up");
        }}
      >
        {board.flat().map((value, i) => (
          <div
            key={i}
            className={`grid place-items-center rounded-xl font-display text-lg font-extrabold ${
              value === 0 ? "bg-white/40" : (TILE_COLORS[value] ?? "bg-ink text-white")
            }`}
          >
            {value !== 0 && value}
          </div>
        ))}
      </div>
      {over && <p className="text-center text-sm font-bold text-ink/60">Partie terminée 🧻</p>}
    </div>
  );
}
```

- [ ] **Step 6: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint src/lib/games/2048.ts src/components/games/Game2048.tsx`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add src/lib/games/2048.ts src/lib/games/2048.test.ts src/components/games/Game2048.tsx
git commit -m "Add 2048 game"
```

---

## Task 6: Démineur (Minesweeper)

**Files:**
- Create: `src/lib/games/minesweeper.ts`
- Test: `src/lib/games/minesweeper.test.ts`
- Create: `src/components/games/GameMinesweeper.tsx`

**Interfaces:**
- Consumes: nothing beyond React/browser APIs in the component.
- Produces (consumed by Task 9's lobby wiring):
  - `type Difficulty = "beginner" | "intermediate" | "expert"`
  - `type Cell = { mine: boolean; revealed: boolean; flagged: boolean; adjacent: number }`
  - `type MinesweeperBoard = Cell[][]`
  - `CONFIG: Record<Difficulty, { rows: number; cols: number; mines: number }>`
  - `buildBoard(mines: boolean[][]): MinesweeperBoard`
  - `createBoard(difficulty: Difficulty, rng?: () => number): MinesweeperBoard`
  - `reveal(board: MinesweeperBoard, r: number, c: number): MinesweeperBoard`
  - `toggleFlag(board: MinesweeperBoard, r: number, c: number): MinesweeperBoard`
  - `checkWin(board: MinesweeperBoard): boolean`
  - `hasExploded(board: MinesweeperBoard): boolean`
  - `GameMinesweeper` component: `{ difficulty: Difficulty; onFinish: (seconds: number) => void }`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/games/minesweeper.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/games/minesweeper.test.ts`
Expected: FAIL — `Cannot find module './minesweeper'`

- [ ] **Step 3: Write the pure logic**

Create `src/lib/games/minesweeper.ts`:

```typescript
export type Difficulty = "beginner" | "intermediate" | "expert";
export type Cell = { mine: boolean; revealed: boolean; flagged: boolean; adjacent: number };
export type MinesweeperBoard = Cell[][];

export const CONFIG: Record<Difficulty, { rows: number; cols: number; mines: number }> = {
  beginner: { rows: 9, cols: 9, mines: 10 },
  intermediate: { rows: 16, cols: 16, mines: 40 },
  expert: { rows: 16, cols: 30, mines: 99 },
};

function neighbors(r: number, c: number, rows: number, cols: number): [number, number][] {
  const result: [number, number][] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) result.push([nr, nc]);
    }
  }
  return result;
}

/** Turns a plain mine layout into a full board with adjacency counts precomputed. */
export function buildBoard(mines: boolean[][]): MinesweeperBoard {
  const rows = mines.length;
  const cols = mines[0].length;
  return mines.map((row, r) =>
    row.map((mine, c) => ({
      mine,
      revealed: false,
      flagged: false,
      adjacent: mine ? 0 : neighbors(r, c, rows, cols).filter(([nr, nc]) => mines[nr][nc]).length,
    }))
  );
}

export function createBoard(difficulty: Difficulty, rng: () => number = Math.random): MinesweeperBoard {
  const { rows, cols, mines: mineCount } = CONFIG[difficulty];
  const mines = Array.from({ length: rows }, () => Array(cols).fill(false));
  let placed = 0;
  while (placed < mineCount) {
    const r = Math.floor(rng() * rows);
    const c = Math.floor(rng() * cols);
    if (mines[r][c]) continue;
    mines[r][c] = true;
    placed++;
  }
  return buildBoard(mines);
}

/** Reveals a cell, flood-filling outward through connected zero-adjacency cells. */
export function reveal(board: MinesweeperBoard, r: number, c: number): MinesweeperBoard {
  const rows = board.length;
  const cols = board[0].length;
  const next = board.map((row) => row.map((cell) => ({ ...cell })));
  const stack: [number, number][] = [[r, c]];
  while (stack.length) {
    const [cr, cc] = stack.pop()!;
    const cell = next[cr][cc];
    if (cell.revealed || cell.flagged) continue;
    cell.revealed = true;
    if (cell.adjacent === 0 && !cell.mine) {
      for (const [nr, nc] of neighbors(cr, cc, rows, cols)) stack.push([nr, nc]);
    }
  }
  return next;
}

export function toggleFlag(board: MinesweeperBoard, r: number, c: number): MinesweeperBoard {
  const next = board.map((row) => row.map((cell) => ({ ...cell })));
  if (!next[r][c].revealed) next[r][c].flagged = !next[r][c].flagged;
  return next;
}

export function checkWin(board: MinesweeperBoard): boolean {
  return board.every((row) => row.every((cell) => cell.mine || cell.revealed));
}

export function hasExploded(board: MinesweeperBoard): boolean {
  return board.some((row) => row.some((cell) => cell.mine && cell.revealed));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/games/minesweeper.test.ts`
Expected: PASS (11 tests)

- [ ] **Step 5: Write the component**

Create `src/components/games/GameMinesweeper.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import {
  checkWin,
  createBoard,
  hasExploded,
  reveal,
  toggleFlag,
  type Difficulty,
  type MinesweeperBoard,
} from "@/lib/games/minesweeper";

const NUMBER_COLORS: Record<number, string> = {
  1: "text-blue-700",
  2: "text-teal-dark",
  3: "text-terracotta-dark",
  4: "text-ink/70",
  5: "text-red-800",
  6: "text-red-800",
  7: "text-red-800",
  8: "text-red-800",
};

export default function GameMinesweeper({
  difficulty,
  onFinish,
}: {
  difficulty: Difficulty;
  onFinish: (seconds: number) => void;
}) {
  const [board, setBoard] = useState<MinesweeperBoard>(() => createBoard(difficulty));
  const [status, setStatus] = useState<"playing" | "won" | "lost">("playing");
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(Date.now());
  const finishedRef = useRef(false);

  useEffect(() => {
    if (status !== "playing") return;
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 1000);
    return () => clearInterval(id);
  }, [status]);

  useEffect(() => {
    if (status === "won" && !finishedRef.current) {
      finishedRef.current = true;
      onFinish(elapsed);
    }
  }, [status, elapsed, onFinish]);

  const click = (r: number, c: number) => {
    if (status !== "playing" || board[r][c].flagged) return;
    const next = reveal(board, r, c);
    setBoard(next);
    if (hasExploded(next)) setStatus("lost");
    else if (checkWin(next)) setStatus("won");
  };

  const flag = (e: React.MouseEvent, r: number, c: number) => {
    e.preventDefault();
    if (status !== "playing") return;
    setBoard(toggleFlag(board, r, c));
  };

  return (
    <div className="space-y-3">
      <p className="text-center font-display text-lg font-extrabold">⏱️ {elapsed}s</p>
      <div
        className="mx-auto grid w-full gap-[2px] overflow-x-auto rounded-2xl bg-ink/10 p-2"
        style={{ gridTemplateColumns: `repeat(${board[0].length}, minmax(22px, 1fr))` }}
      >
        {board.flatMap((row, r) =>
          row.map((cell, c) => (
            <button
              key={`${r}-${c}`}
              onClick={() => click(r, c)}
              onContextMenu={(e) => flag(e, r, c)}
              disabled={status !== "playing" && !cell.revealed}
              className={`grid aspect-square place-items-center rounded text-xs font-extrabold ${
                cell.revealed ? (cell.mine ? "bg-red-200" : "bg-white/70") : "bg-sage hover:bg-sage-dark"
              } ${NUMBER_COLORS[cell.adjacent] ?? ""}`}
            >
              {cell.revealed ? (cell.mine ? "💣" : cell.adjacent || "") : cell.flagged ? "🚩" : ""}
            </button>
          ))
        )}
      </div>
      {status === "lost" && <p className="text-center text-sm font-bold text-red-700">💥 Boom — retente ta chance</p>}
      {status === "won" && <p className="text-center text-sm font-bold text-teal">🎉 Gagné en {elapsed}s !</p>}
    </div>
  );
}
```

- [ ] **Step 6: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint src/lib/games/minesweeper.ts src/components/games/GameMinesweeper.tsx`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add src/lib/games/minesweeper.ts src/lib/games/minesweeper.test.ts src/components/games/GameMinesweeper.tsx
git commit -m "Add Démineur (Minesweeper) game"
```

---

## Task 7: Sudoku

**Files:**
- Create: `src/lib/games/sudoku.ts`
- Test: `src/lib/games/sudoku.test.ts`
- Create: `src/components/games/GameSudoku.tsx`

**Interfaces:**
- Consumes: nothing beyond React/browser APIs in the component.
- Produces (consumed by Task 9's lobby wiring):
  - `type SudokuGrid = number[][]` (9×9, `0` = empty)
  - `type Difficulty = "easy" | "medium" | "hard"`
  - `GIVENS_BY_DIFFICULTY: Record<Difficulty, number>`
  - `generateSolvedGrid(rng?: () => number): SudokuGrid`
  - `makePuzzle(solved: SudokuGrid, difficulty: Difficulty, rng?: () => number): SudokuGrid`
  - `isValidPlacement(grid: SudokuGrid, r: number, c: number, value: number): boolean`
  - `isComplete(grid: SudokuGrid): boolean`
  - `GameSudoku` component: `{ difficulty: Difficulty; onFinish: (seconds: number) => void }`

Note: puzzle generation here does not guarantee a *unique* solution (a full solver-based uniqueness check is out of scope) — it removes cells at random from one valid solved grid, which is standard for a casual single-player Sudoku and matches the spec's scope.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/games/sudoku.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { GIVENS_BY_DIFFICULTY, generateSolvedGrid, isComplete, isValidPlacement, makePuzzle } from "./sudoku";

// Small deterministic PRNG so generation is reproducible in tests (mulberry32).
function seededRng(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("generateSolvedGrid", () => {
  it("produces a complete, valid 9x9 grid", () => {
    const grid = generateSolvedGrid(seededRng(1));
    expect(grid.length).toBe(9);
    expect(grid.every((row) => row.length === 9 && row.every((v) => v >= 1 && v <= 9))).toBe(true);
    expect(isComplete(grid)).toBe(true);
  });
});

describe("makePuzzle", () => {
  it("removes exactly enough cells to reach the difficulty's given count", () => {
    const solved = generateSolvedGrid(seededRng(2));
    for (const difficulty of ["easy", "medium", "hard"] as const) {
      const puzzle = makePuzzle(solved, difficulty, seededRng(3));
      const givens = puzzle.flat().filter((v) => v !== 0).length;
      expect(givens).toBe(GIVENS_BY_DIFFICULTY[difficulty]);
    }
  });

  it("never alters the cells it keeps", () => {
    const solved = generateSolvedGrid(seededRng(4));
    const puzzle = makePuzzle(solved, "easy", seededRng(5));
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (puzzle[r][c] !== 0) expect(puzzle[r][c]).toBe(solved[r][c]);
      }
    }
  });
});

describe("isValidPlacement", () => {
  const grid: number[][] = Array.from({ length: 9 }, () => Array(9).fill(0));
  grid[0][0] = 5;
  grid[0][1] = 3;
  grid[3][0] = 7;

  it("rejects a duplicate in the same row", () => {
    expect(isValidPlacement(grid, 0, 8, 5)).toBe(false);
  });

  it("rejects a duplicate in the same column", () => {
    expect(isValidPlacement(grid, 8, 0, 7)).toBe(false);
  });

  it("rejects a duplicate in the same 3x3 box", () => {
    expect(isValidPlacement(grid, 1, 1, 3)).toBe(false);
  });

  it("accepts a value with no conflict", () => {
    expect(isValidPlacement(grid, 4, 4, 9)).toBe(true);
  });
});

describe("isComplete", () => {
  it("is true for a fully solved valid grid", () => {
    expect(isComplete(generateSolvedGrid(seededRng(6)))).toBe(true);
  });

  it("is false when a cell is still empty", () => {
    const grid = generateSolvedGrid(seededRng(7));
    grid[0][0] = 0;
    expect(isComplete(grid)).toBe(false);
  });

  it("is false when a duplicate has been introduced", () => {
    const grid = generateSolvedGrid(seededRng(8));
    grid[0][0] = grid[0][1];
    expect(isComplete(grid)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/games/sudoku.test.ts`
Expected: FAIL — `Cannot find module './sudoku'`

- [ ] **Step 3: Write the pure logic**

Create `src/lib/games/sudoku.ts`:

```typescript
export type SudokuGrid = number[][];
export type Difficulty = "easy" | "medium" | "hard";

export const GIVENS_BY_DIFFICULTY: Record<Difficulty, number> = { easy: 40, medium: 32, hard: 26 };

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function isSafe(grid: SudokuGrid, r: number, c: number, value: number): boolean {
  for (let i = 0; i < 9; i++) {
    if (grid[r][i] === value || grid[i][c] === value) return false;
  }
  const br = Math.floor(r / 3) * 3;
  const bc = Math.floor(c / 3) * 3;
  for (let dr = 0; dr < 3; dr++) {
    for (let dc = 0; dc < 3; dc++) {
      if (grid[br + dr][bc + dc] === value) return false;
    }
  }
  return true;
}

/** Backtracking fill of an empty 9x9 grid into a complete, valid solution. */
export function generateSolvedGrid(rng: () => number = Math.random): SudokuGrid {
  const grid: SudokuGrid = Array.from({ length: 9 }, () => Array(9).fill(0));

  function fill(pos: number): boolean {
    if (pos === 81) return true;
    const r = Math.floor(pos / 9);
    const c = pos % 9;
    for (const value of shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9], rng)) {
      if (isSafe(grid, r, c, value)) {
        grid[r][c] = value;
        if (fill(pos + 1)) return true;
        grid[r][c] = 0;
      }
    }
    return false;
  }

  fill(0);
  return grid;
}

/** Removes cells from a solved grid at random down to `difficulty`'s given count. */
export function makePuzzle(solved: SudokuGrid, difficulty: Difficulty, rng: () => number = Math.random): SudokuGrid {
  const toRemove = 81 - GIVENS_BY_DIFFICULTY[difficulty];
  const positions = shuffle(
    Array.from({ length: 81 }, (_, i) => i),
    rng
  ).slice(0, toRemove);
  const puzzle = solved.map((row) => [...row]);
  for (const pos of positions) puzzle[Math.floor(pos / 9)][pos % 9] = 0;
  return puzzle;
}

/** True if `value` doesn't already appear elsewhere in `(r, c)`'s row, column, or 3x3 box. */
export function isValidPlacement(grid: SudokuGrid, r: number, c: number, value: number): boolean {
  for (let i = 0; i < 9; i++) {
    if (i !== c && grid[r][i] === value) return false;
    if (i !== r && grid[i][c] === value) return false;
  }
  const br = Math.floor(r / 3) * 3;
  const bc = Math.floor(c / 3) * 3;
  for (let dr = 0; dr < 3; dr++) {
    for (let dc = 0; dc < 3; dc++) {
      const rr = br + dr;
      const cc = bc + dc;
      if ((rr !== r || cc !== c) && grid[rr][cc] === value) return false;
    }
  }
  return true;
}

/** True once every cell is filled and no row/column/box has a duplicate. */
export function isComplete(grid: SudokuGrid): boolean {
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const value = grid[r][c];
      if (value === 0 || !isValidPlacement(grid, r, c, value)) return false;
    }
  }
  return true;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/games/sudoku.test.ts`
Expected: PASS (10 tests)

- [ ] **Step 5: Write the component**

Create `src/components/games/GameSudoku.tsx`:

```tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { generateSolvedGrid, isComplete, isValidPlacement, makePuzzle, type Difficulty, type SudokuGrid } from "@/lib/games/sudoku";

export default function GameSudoku({ difficulty, onFinish }: { difficulty: Difficulty; onFinish: (seconds: number) => void }) {
  const initial = useMemo(() => {
    const solved = generateSolvedGrid();
    const puzzle = makePuzzle(solved, difficulty);
    return { puzzle, givenMask: puzzle.map((row) => row.map((v) => v !== 0)) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [difficulty]);

  const [grid, setGrid] = useState<SudokuGrid>(() => initial.puzzle.map((row) => [...row]));
  const [elapsed, setElapsed] = useState(0);
  const [done, setDone] = useState(false);
  const startRef = useRef(Date.now());
  const finishedRef = useRef(false);

  useEffect(() => {
    if (done) return;
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 1000);
    return () => clearInterval(id);
  }, [done]);

  useEffect(() => {
    if (done && !finishedRef.current) {
      finishedRef.current = true;
      onFinish(elapsed);
    }
  }, [done, elapsed, onFinish]);

  const setCell = (r: number, c: number, raw: string) => {
    if (initial.givenMask[r][c] || done) return;
    const value = raw === "" ? 0 : Number(raw);
    if (!Number.isInteger(value) || value < 0 || value > 9) return;
    const next = grid.map((row) => [...row]);
    next[r][c] = value;
    setGrid(next);
    if (isComplete(next)) setDone(true);
  };

  return (
    <div className="space-y-3">
      <p className="text-center font-display text-lg font-extrabold">⏱️ {elapsed}s</p>
      <div className="mx-auto grid w-full max-w-sm grid-cols-9 gap-[1px] rounded-2xl bg-ink p-[1px]">
        {grid.map((row, r) =>
          row.map((value, c) => {
            const given = initial.givenMask[r][c];
            const invalid = value !== 0 && !isValidPlacement(grid, r, c, value);
            return (
              <input
                key={`${r}-${c}`}
                inputMode="numeric"
                maxLength={1}
                value={value === 0 ? "" : value}
                disabled={given || done}
                onChange={(e) => setCell(r, c, e.target.value.replace(/[^1-9]/g, ""))}
                className={`grid aspect-square place-items-center text-center text-sm font-extrabold ${
                  given ? "bg-ink/10" : invalid ? "bg-red-100 text-red-700" : "bg-white"
                }`}
              />
            );
          })
        )}
      </div>
      {done && <p className="text-center text-sm font-bold text-teal">🎉 Résolu en {elapsed}s !</p>}
    </div>
  );
}
```

- [ ] **Step 6: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint src/lib/games/sudoku.ts src/components/games/GameSudoku.tsx`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add src/lib/games/sudoku.ts src/lib/games/sudoku.test.ts src/components/games/GameSudoku.tsx
git commit -m "Add Sudoku game"
```

---

## Task 8: Tetris

**Files:**
- Create: `src/lib/games/tetris.ts`
- Test: `src/lib/games/tetris.test.ts`
- Create: `src/components/games/GameTetris.tsx`

**Interfaces:**
- Consumes: nothing beyond React/browser APIs in the component.
- Produces (consumed by Task 9's lobby wiring):
  - `ROWS = 20`, `COLS = 10`
  - `type PieceKind = "I" | "O" | "T" | "S" | "Z" | "J" | "L"`
  - `type Cell = PieceKind | null`
  - `type Board = Cell[][]`
  - `type Piece = { kind: PieceKind; shape: number[][]; row: number; col: number }`
  - `type Difficulty = "easy" | "medium" | "hard"`
  - `emptyBoard(): Board`
  - `randomPieceKind(rng?: () => number): PieceKind`
  - `spawnPiece(kind: PieceKind, cols: number): Piece`
  - `isValidPosition(board: Board, piece: Piece): boolean`
  - `rotatePiece(piece: Piece): Piece`
  - `moveHorizontal(piece: Piece, dx: number): Piece`
  - `moveDown(piece: Piece): Piece`
  - `lockPiece(board: Board, piece: Piece): Board`
  - `clearLines(board: Board): { board: Board; cleared: number; gained: number }`
  - `speedForLines(difficulty: Difficulty, linesCleared: number): number`
  - `GameTetris` component: `{ difficulty: Difficulty; onFinish: (score: number) => void }`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/games/tetris.test.ts`:

```typescript
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
    board[5][4] = "I";
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
    const piece = spawnPiece("O", COLS); // spawns with row: -1
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/games/tetris.test.ts`
Expected: FAIL — `Cannot find module './tetris'`

- [ ] **Step 3: Write the pure logic**

Create `src/lib/games/tetris.ts`:

```typescript
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

export function spawnPiece(kind: PieceKind, cols: number): Piece {
  return { kind, shape: SHAPES[kind], row: -1, col: Math.floor(cols / 2) - 2 };
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/games/tetris.test.ts`
Expected: PASS (11 tests)

- [ ] **Step 5: Write the component**

Create `src/components/games/GameTetris.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  clearLines,
  emptyBoard,
  isValidPosition,
  lockPiece,
  moveDown,
  moveHorizontal,
  randomPieceKind,
  rotatePiece,
  spawnPiece,
  speedForLines,
  COLS,
  type Board,
  type Difficulty,
  type Piece,
} from "@/lib/games/tetris";

const PIECE_COLORS: Record<string, string> = {
  I: "bg-teal",
  O: "bg-signage",
  T: "bg-terracotta",
  S: "bg-sage",
  Z: "bg-red-300",
  J: "bg-blue-300",
  L: "bg-terracotta-dark",
};

export default function GameTetris({ difficulty, onFinish }: { difficulty: Difficulty; onFinish: (score: number) => void }) {
  const [board, setBoard] = useState<Board>(() => emptyBoard());
  const [piece, setPiece] = useState<Piece>(() => spawnPiece(randomPieceKind(), COLS));
  const [score, setScore] = useState(0);
  const [lines, setLines] = useState(0);
  const [over, setOver] = useState(false);
  const finishedRef = useRef(false);
  const boardRef = useRef(board);
  const pieceRef = useRef(piece);
  boardRef.current = board;
  pieceRef.current = piece;

  const drop = useCallback(() => {
    if (over) return;
    const moved = moveDown(pieceRef.current);
    if (isValidPosition(boardRef.current, moved)) {
      setPiece(moved);
      return;
    }
    const locked = lockPiece(boardRef.current, pieceRef.current);
    const { board: cleared, cleared: n, gained } = clearLines(locked);
    setBoard(cleared);
    setScore((s) => s + gained);
    setLines((l) => l + n);

    const next = spawnPiece(randomPieceKind(), COLS);
    if (!isValidPosition(cleared, next)) {
      setOver(true);
      return;
    }
    setPiece(next);
  }, [over]);

  useEffect(() => {
    if (over) return;
    const id = setInterval(drop, speedForLines(difficulty, lines));
    return () => clearInterval(id);
  }, [drop, over, difficulty, lines]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (over) return;
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        const moved = moveHorizontal(pieceRef.current, e.key === "ArrowLeft" ? -1 : 1);
        if (isValidPosition(boardRef.current, moved)) setPiece(moved);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const rotated = rotatePiece(pieceRef.current);
        if (isValidPosition(boardRef.current, rotated)) setPiece(rotated);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        drop();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [drop, over]);

  useEffect(() => {
    if (over && !finishedRef.current) {
      finishedRef.current = true;
      onFinish(score);
    }
  }, [over, score, onFinish]);

  const pieceCells = new Set<string>();
  for (let r = 0; r < piece.shape.length; r++) {
    for (let c = 0; c < piece.shape[r].length; c++) {
      if (piece.shape[r][c]) pieceCells.add(`${piece.row + r},${piece.col + c}`);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-center font-display text-lg font-extrabold">
        {score} pts · {lines} lignes
      </p>
      <div
        className="mx-auto grid w-full max-w-xs gap-[1px] rounded-2xl bg-ink/10 p-1"
        style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)` }}
      >
        {board.map((row, r) =>
          row.map((cell, c) => {
            const active = pieceCells.has(`${r},${c}`);
            const kind = active ? piece.kind : cell;
            return <div key={`${r}-${c}`} className={`aspect-square rounded-sm ${kind ? PIECE_COLORS[kind] : "bg-white/40"}`} />;
          })
        )}
      </div>
      {over && <p className="text-center text-sm font-bold text-ink/60">Game over — {score} pts 🧻</p>}
    </div>
  );
}
```

- [ ] **Step 6: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint src/lib/games/tetris.ts src/components/games/GameTetris.tsx`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add src/lib/games/tetris.ts src/lib/games/tetris.test.ts src/components/games/GameTetris.tsx
git commit -m "Add Tetris game"
```

---

## Task 9: Arcade lobby — wire everything into `GamesPage`

**Files:**
- Modify: `src/components/GamesPage.tsx` (currently a "Bientôt disponible" placeholder — full rewrite)
- Modify: `src/app/page.tsx:27` (the `GamesPage` dynamic import call site, to pass `me`)

**Interfaces:**
- Consumes: `GameShell` (Task 4), `Game2048` (Task 5), `GameMinesweeper` + its `Difficulty` (Task 6), `GameSudoku` + its `Difficulty` (Task 7), `GameTetris` + its `Difficulty` (Task 8), `GameKind` from `@/lib/games/scoring` (Task 2), `SessionUser` from `@/lib/types`.
- Produces: `GamesPage` component with props `{ me: SessionUser | null }` — this changes its prop signature, so `page.tsx`'s render call must pass `me`.

No unit test — this is the visual lobby shell (arcade doors), matching the spec's "no automated visual tests" scope. Verify with `tsc`/`eslint` plus a manual run-through (final step below).

- [ ] **Step 1: Rewrite `GamesPage.tsx`**

Replace the full contents of `src/components/GamesPage.tsx`:

```tsx
"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { SessionUser } from "@/lib/types";
import type { GameKind } from "@/lib/games/scoring";
import GameShell from "./GameShell";
import Game2048 from "./games/Game2048";
import GameMinesweeper, { type Difficulty as MinesweeperDifficulty } from "./games/GameMinesweeper";
import GameSudoku, { type Difficulty as SudokuDifficulty } from "./games/GameSudoku";
import GameTetris, { type Difficulty as TetrisDifficulty } from "./games/GameTetris";

const DOORS: { game: GameKind; emoji: string; title: string }[] = [
  { game: "2048", emoji: "🔢", title: "2048" },
  { game: "minesweeper", emoji: "💣", title: "Démineur" },
  { game: "sudoku", emoji: "🧩", title: "Sudoku" },
  { game: "tetris", emoji: "🧱", title: "Tetris" },
];

function Game2048Screen({ me, onExit }: { me: SessionUser | null; onExit: () => void }) {
  return (
    <GameShell title="2048" emoji="🔢" game="2048" me={me} onExit={onExit}>
      {({ finish }) => <Game2048 onFinish={finish} />}
    </GameShell>
  );
}

function MinesweeperScreen({ me, onExit }: { me: SessionUser | null; onExit: () => void }) {
  return (
    <GameShell title="Démineur" emoji="💣" game="minesweeper" me={me} onExit={onExit}>
      {({ difficulty, finish }) => (
        <GameMinesweeper difficulty={difficulty as MinesweeperDifficulty} onFinish={finish} />
      )}
    </GameShell>
  );
}

function SudokuScreen({ me, onExit }: { me: SessionUser | null; onExit: () => void }) {
  return (
    <GameShell title="Sudoku" emoji="🧩" game="sudoku" me={me} onExit={onExit}>
      {({ difficulty, finish }) => <GameSudoku difficulty={difficulty as SudokuDifficulty} onFinish={finish} />}
    </GameShell>
  );
}

function TetrisScreen({ me, onExit }: { me: SessionUser | null; onExit: () => void }) {
  return (
    <GameShell title="Tetris" emoji="🧱" game="tetris" me={me} onExit={onExit}>
      {({ difficulty, finish }) => <GameTetris difficulty={difficulty as TetrisDifficulty} onFinish={finish} />}
    </GameShell>
  );
}

/** The "Jeux" tab: a toilet-arcade lobby — a row of stall doors, each opening its game. */
export default function GamesPage({ me }: { me: SessionUser | null }) {
  const [open, setOpen] = useState<GameKind | null>(null);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      transition={{ duration: 0.22 }}
      className="absolute inset-0 z-[1000] overflow-y-auto bg-cream"
    >
      <AnimatePresence mode="wait">
        {open === null ? (
          <motion.div key="lobby" exit={{ opacity: 0 }} className="mx-auto max-w-lg px-4 pb-32 pt-6">
            <h1 className="mb-1 font-display text-2xl font-extrabold tracking-tight">🚻 Salle d&apos;arcade</h1>
            <p className="mb-4 text-xs font-bold text-ink/50">Pousse une porte, la cabine est toujours libre</p>
            <div className="grid grid-cols-2 gap-3">
              {DOORS.map((d) => (
                <button
                  key={d.game}
                  onClick={() => setOpen(d.game)}
                  className="sticker sticker-press group relative flex flex-col items-center gap-2 rounded-[24px] border-4 border-ink bg-white p-5 pt-8 transition hover:-translate-y-1"
                >
                  <span className="absolute -top-3 rounded-full border-2 border-ink bg-teal px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-white shadow-[2px_2px_0_#1a1a1a]">
                    Libre
                  </span>
                  <span className="text-4xl transition group-hover:scale-110" aria-hidden>
                    {d.emoji}
                  </span>
                  <span className="font-display text-sm font-extrabold">{d.title}</span>
                </button>
              ))}
            </div>
          </motion.div>
        ) : (
          <motion.div key={open} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {open === "2048" && <Game2048Screen me={me} onExit={() => setOpen(null)} />}
            {open === "minesweeper" && <MinesweeperScreen me={me} onExit={() => setOpen(null)} />}
            {open === "sudoku" && <SudokuScreen me={me} onExit={() => setOpen(null)} />}
            {open === "tetris" && <TetrisScreen me={me} onExit={() => setOpen(null)} />}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
```

- [ ] **Step 2: Pass `me` from `page.tsx`**

In `src/app/page.tsx`, find:

```tsx
{view === "games" && <GamesPage />}
```

Replace with:

```tsx
{view === "games" && <GamesPage me={me} />}
```

- [ ] **Step 3: Typecheck, lint, and run the full test suite**

Run: `npx tsc --noEmit && npx eslint . && npx vitest run`
Expected: no type errors, no lint errors, all tests pass (including every test added in Tasks 2–8).

- [ ] **Step 4: Manual run-through**

Run: `npm run dev`, then in a browser:
1. Open the app, click the "Jeux" tab — the arcade lobby with 4 doors should appear.
2. Open 2048 — arrow keys/swipe should merge tiles and update the score; back button ("🚪 Sortir") returns to the lobby.
3. Open Démineur — pick a difficulty, left-click reveals cells (flood-filling zeros), right-click flags, winning shows the "Gagné" message.
4. Open Sudoku — pick a difficulty, given cells are locked, typing 1-9 fills the rest, completing the grid shows "Résolu".
5. Open Tetris — pick a difficulty, the piece falls and speeds up as lines clear, arrow keys move/rotate/soft-drop.
6. While logged in, finish a game and confirm a toast appears and "Ton record" shows on a later visit to the same game.

Report back if anything looks or behaves wrong instead of guessing a fix blind.

- [ ] **Step 5: Commit**

```bash
git add src/components/GamesPage.tsx src/app/page.tsx
git commit -m "Wire the four games into the arcade lobby"
```

---

## Self-Review Notes

- **Spec coverage:** data model (Task 1), score API (Task 3), access rules — playable by all, saved only when logged in (Tasks 3–4), difficulty levels for 3 of 4 games (Tasks 2, 6–8), arcade visual theme (Task 9), all four games (Tasks 5–8), pure-logic unit tests (Tasks 2, 5–8). No task builds a leaderboard UI/endpoint — matches the spec's non-goal.
- **Type consistency:** `GameKind`/`GameDifficulty` (Task 2) are the single source of truth every later task imports — no task redefines them. Each game's own `Difficulty` type (Tasks 6–8) is a plain independent union matching the values `DIFFICULTIES_BY_GAME` provides for that game; Task 9 bridges the two with an explicit cast at the render-prop boundary, since `GameShell` can't statically narrow "this game's specific difficulty subset" from the shared union.
- **Deviation from spec:** `GameScore.difficulty` is a non-null `String` with the sentinel `"none"` (Task 1), instead of the spec's nullable field — Postgres doesn't enforce uniqueness across multiple `NULL`s in a `@@unique` constraint, which would have silently allowed duplicate "personal best" rows for 2048. The API (Task 3) maps `"none"` back to `null` at the boundary, so every consumer outside the DB layer still sees the spec's `difficulty: string | null` shape.
