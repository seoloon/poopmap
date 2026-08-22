import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

const photoFindMany = vi.fn();
const photoUpdate = vi.fn().mockResolvedValue({});
const completionPhotoFindMany = vi.fn().mockResolvedValue([]);
const completionPhotoUpdate = vi.fn().mockResolvedValue({});

// Mocked by its relative specifier, matching exactly how migrate-existing-photos.ts
// (a script outside src/, run standalone via tsx) imports it — this avoids any
// dependency on tsx/vitest resolving the "@/*" tsconfig alias the same way for a
// file living under scripts/.
vi.mock("../src/lib/prisma", () => ({
  prisma: {
    photo: {
      findMany: (...args: unknown[]) => photoFindMany(...args),
      update: (...args: unknown[]) => photoUpdate(...args),
    },
    completionPhoto: {
      findMany: (...args: unknown[]) => completionPhotoFindMany(...args),
      update: (...args: unknown[]) => completionPhotoUpdate(...args),
    },
  },
}));

describe("migrate-existing-photos", () => {
  let remoteDir: string;

  beforeEach(async () => {
    remoteDir = await mkdtemp(path.join(tmpdir(), "media-remote-"));
    process.env.REMOTE_MEDIA_DIR = remoteDir;
    photoFindMany.mockReset();
    photoUpdate.mockClear();
  });

  afterEach(async () => {
    await rm(remoteDir, { recursive: true, force: true });
    delete process.env.REMOTE_MEDIA_DIR;
  });

  it("writes each base64 row to REMOTE_MEDIA_DIR and updates its url", async () => {
    photoFindMany
      .mockResolvedValueOnce([{ id: 1, url: TINY_PNG }])
      .mockResolvedValueOnce([]);

    const { migratePhotos } = await import("./migrate-existing-photos");
    const result = await migratePhotos();

    expect(result.migrated).toBe(1);
    expect(result.failed).toBe(0);

    // Confirm the real query filter is actually sent to Prisma, not just that
    // the mock happened to return something — a regression that broke or
    // dropped the `startsWith: "data:image/"` filter would still pass this
    // test if we only asserted on the return value / update calls.
    expect(photoFindMany.mock.calls[0][0].where).toEqual({ url: { startsWith: "data:image/" } });

    const [{ where, data }] = photoUpdate.mock.calls[0];
    expect(where).toEqual({ id: 1 });
    expect(data.url).toMatch(/^\/media\/[a-f0-9-]{36}\.png$/);

    const writtenFilename = data.url.split("/").pop();
    expect(await readdir(remoteDir)).toContain(writtenFilename);
    const bytes = await readFile(path.join(remoteDir, writtenFilename));
    expect(bytes.equals(Buffer.from(TINY_PNG.split(",")[1], "base64"))).toBe(true);
  });

  it("is idempotent — a row already migrated is never selected", async () => {
    // findMany is mocked with a `where: { url: { startsWith: "data:image/" } }`
    // filter in the real query, so an already-migrated row (url starting with
    // "/media/") naturally never appears here — this test documents that contract.
    photoFindMany.mockResolvedValueOnce([]);
    const { migratePhotos } = await import("./migrate-existing-photos");
    const result = await migratePhotos();
    expect(result).toEqual({ migrated: 0, failed: 0 });
    expect(photoFindMany.mock.calls[0][0].where).toEqual({ url: { startsWith: "data:image/" } });
  });

  it("excludes a permanently-failing row from later queries so the batch loop terminates", async () => {
    // Unsupported mime type ("gif") means decodeDataUrl's regex never matches,
    // so this row throws every time it's decoded — reproducing the original
    // hang, where the same failing row would be re-fetched forever because
    // its url still started with "data:image/" and its row was never updated.
    const UNDECODABLE_URL = "data:image/gif;base64,AAAA";
    photoFindMany
      .mockResolvedValueOnce([{ id: 2, url: UNDECODABLE_URL }])
      .mockResolvedValueOnce([]);

    const { migratePhotos } = await import("./migrate-existing-photos");
    const result = await migratePhotos();

    expect(result.migrated).toBe(0);
    expect(result.failed).toBe(1);
    expect(photoUpdate).not.toHaveBeenCalled();

    // The loop must have made a second call (to discover there's nothing
    // left) and that second call must exclude the id that just failed —
    // otherwise it would be fetched again forever.
    expect(photoFindMany).toHaveBeenCalledTimes(2);
    expect(photoFindMany.mock.calls[1][0].where).toEqual({
      url: { startsWith: "data:image/" },
      id: { notIn: [2] },
    });
  });
});
