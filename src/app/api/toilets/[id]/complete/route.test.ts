import { describe, expect, it, vi, beforeEach } from "vitest";

const completionCreate = vi.fn().mockResolvedValue({ id: 7 });
const toiletFindUnique = vi.fn().mockResolvedValue({
  id: 5,
  status: "APPROVED",
  name: null,
  address: "already set",
  description: "already set",
  _count: { photos: 0 },
});
const completionFindFirst = vi.fn().mockResolvedValue(null);

vi.mock("@/lib/prisma", () => ({
  prisma: {
    toilet: { findUnique: (...args: unknown[]) => toiletFindUnique(...args) },
    completion: {
      findFirst: (...args: unknown[]) => completionFindFirst(...args),
      create: (...args: unknown[]) => completionCreate(...args),
    },
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

describe("POST /api/toilets/[id]/complete", () => {
  beforeEach(() => {
    completionCreate.mockClear();
  });

  it("stores saveUploadedPhoto's served paths, not the raw data-URLs", async () => {
    const { POST } = await import("./route");
    const req = new Request("http://localhost/api/toilets/5/complete", {
      method: "POST",
      body: JSON.stringify({ photos: [VALID_PNG] }),
    });

    const res = await POST(req as never, { params: Promise.resolve({ id: "5" }) });
    expect(res.status).toBe(201);

    const createArgs = completionCreate.mock.calls[0][0];
    expect(createArgs.data.photos.create).toEqual([{ url: `/media/fake-${VALID_PNG.length}.jpg` }]);
  });
});
