import { describe, expect, it, vi, beforeEach } from "vitest";

const toiletCreate = vi.fn().mockResolvedValue({ id: 42 });

vi.mock("@/lib/prisma", () => ({
  // `meta.upsert` is needed because the real POST handler calls the unmocked
  // `bumpVersion()` (from "@/lib/toilets"), which writes through prisma.meta.
  prisma: {
    toilet: { create: (...args: unknown[]) => toiletCreate(...args) },
    meta: { upsert: vi.fn().mockResolvedValue({}) },
  },
}));
vi.mock("@/lib/auth", () => ({
  getSessionUser: vi.fn().mockResolvedValue({ id: 1, pseudo: "Alice", role: "user", username: "alice" }),
}));
vi.mock("@/lib/rate-limit", () => ({ isRateLimited: () => false }));
vi.mock("@/lib/media", () => ({
  saveUploadedPhoto: vi.fn(async (dataUrl: string) => `/media/fake-${dataUrl.length}.jpg`),
}));

const VALID_PNG = "data:image/png;base64," + "A".repeat(100);

describe("POST /api/toilets", () => {
  beforeEach(() => {
    toiletCreate.mockClear();
  });

  it("stores saveUploadedPhoto's served paths, not the raw data-URLs", async () => {
    const { POST } = await import("./route");
    const req = new Request("http://localhost/api/toilets", {
      method: "POST",
      body: JSON.stringify({
        name: "Toilette test",
        lat: 48.85,
        lng: 2.35,
        kind: "gratuit",
        photos: [VALID_PNG],
      }),
    });

    const res = await POST(req as never);
    expect(res.status).toBe(201);

    const createArgs = toiletCreate.mock.calls[0][0];
    expect(createArgs.data.photos.create).toEqual([{ url: `/media/fake-${VALID_PNG.length}.jpg`, createdById: 1 }]);
  });
});
