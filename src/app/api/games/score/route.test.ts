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
