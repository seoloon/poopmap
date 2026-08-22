import { describe, expect, it, vi } from "vitest";

const userFindUnique = vi.fn();
const toiletCount = vi.fn().mockResolvedValue(2);
const completionCount = vi.fn().mockResolvedValue(1);
const reviewCount = vi.fn().mockResolvedValue(3);
const toiletFindMany = vi.fn().mockResolvedValue([]);
const reviewFindMany = vi.fn().mockResolvedValue([]);
const completionFindMany = vi.fn().mockResolvedValue([]);

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (...args: unknown[]) => userFindUnique(...args) },
    toilet: {
      count: (...args: unknown[]) => toiletCount(...args),
      findMany: (...args: unknown[]) => toiletFindMany(...args),
    },
    completion: {
      count: (...args: unknown[]) => completionCount(...args),
      findMany: (...args: unknown[]) => completionFindMany(...args),
    },
    review: {
      count: (...args: unknown[]) => reviewCount(...args),
      findMany: (...args: unknown[]) => reviewFindMany(...args),
    },
  },
}));

describe("GET /api/users/[id]", () => {
  it("returns the public profile without the private username", async () => {
    userFindUnique.mockResolvedValueOnce({ pseudo: "Alice", createdAt: new Date("2024-01-01") });
    const { GET } = await import("./route");

    const res = await GET({} as never, { params: Promise.resolve({ id: "5" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      id: 5,
      pseudo: "Alice",
      createdAt: "2024-01-01T00:00:00.000Z",
      toiletsAdded: 2,
      completions: 1,
      reviews: 3,
      activity: [],
    });
    expect(body.username).toBeUndefined();
  });

  it("404s for an unknown user", async () => {
    userFindUnique.mockResolvedValueOnce(null);
    const { GET } = await import("./route");

    const res = await GET({} as never, { params: Promise.resolve({ id: "999" }) });
    expect(res.status).toBe(404);
  });

  it("400s for a non-numeric id", async () => {
    const { GET } = await import("./route");

    const res = await GET({} as never, { params: Promise.resolve({ id: "abc" }) });
    expect(res.status).toBe(400);
  });
});
