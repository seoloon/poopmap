import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { withApiErrorHandling } from "@/lib/api-error";
import { isRateLimited } from "@/lib/rate-limit";
import {
  DIFFICULTIES_BY_GAME,
  GAME_TO_DB,
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
