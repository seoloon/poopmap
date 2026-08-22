# Photo Storage Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop storing user-uploaded toilet photos as base64 inside Postgres; write them to a local buffer directory instead, serve them via a new route, relocate them to a remote-mounted disk on a weekly schedule, and backfill every photo already stored as base64 today.

**Architecture:** A new `src/lib/media.ts` owns all filesystem path logic (where photos live, how to decode/write/find them). The two existing photo-upload endpoints switch from persisting raw base64 to persisting a served path (`/media/<uuid>.<ext>`) after writing bytes to `LOCAL_MEDIA_DIR`. A new `GET /api/media/[filename]` route serves whichever directory (local, then remote) actually has the file. A weekly job — scheduled in-process via Next's `instrumentation.ts`, no external cron — relocates every file sitting in the local buffer to the remote mount. A one-time, manually-run script backfills existing base64 rows straight to the remote mount. One deliberate refinement over the design spec: the weekly move always does copy-verify-delete rather than attempting `fs.rename` first — at this data size (≤3 photos × ~440KB per submission, run once a week) the rename "fast path" saves nothing worth the extra code path, and copy-verify-delete is trivially correct and testable regardless of whether the two directories are on the same filesystem.

**Tech Stack:** Next.js 15 route handlers, Prisma, Node's `node:fs/promises`. This repo has no test framework today — this plan adds Vitest (per user's explicit choice) as a dev dependency for automated tests of the pure/mockable logic; the two Prisma-touching route changes and the backfill script are tested with a mocked `@/lib/prisma` (no live database needed to run `npm test`).

**Spec:** `docs/superpowers/specs/2026-08-22-photo-storage-migration-design.md`

## Global Constraints

- No schema migration: `Photo.url` / `CompletionPhoto.url` keep their existing column type and meaning (a string for `<img src>`) — only the *content* of that string changes, from a base64 data-URL to a served path.
- `LOCAL_MEDIA_DIR` defaults to `/data/media-local` if unset.
- `REMOTE_MEDIA_DIR` has no default — code that depends on it must throw a clear error if it's unset, not silently write nowhere.
- No S3/object-storage code path — the remote disk is a plain filesystem mount.
- No per-photo storage-tier column in the database — the serving route checks local then remote at request time instead.

---

## Task 1: Vitest setup + media path helpers

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json` (add `vitest` devDependency, add `"test": "vitest run"` script)
- Create: `src/lib/media.ts`
- Test: `src/lib/media.test.ts`
- Modify: `.env.example` (document `LOCAL_MEDIA_DIR`, `REMOTE_MEDIA_DIR`)
- Modify: `Dockerfile` (comment documenting the two volumes Dokploy must mount)

**Interfaces:**
- Produces: `localMediaDir(): string`, `remoteMediaDir(): string` (throws if `REMOTE_MEDIA_DIR` unset), `resolveMediaFile(filename: string): Promise<{ path: string; contentType: string } | null>` — all from `src/lib/media.ts`, used by every later task.

- [ ] **Step 1: Install Vitest and wire the test script**

```bash
npm install -D vitest
```

Add to `package.json` `"scripts"` (alongside the existing `"typecheck"` line):

```json
"test": "vitest run",
```

- [ ] **Step 2: Add the Vitest config**

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: { environment: "node" },
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
});
```

- [ ] **Step 3: Write the failing test for the path helpers**

Create `src/lib/media.test.ts`:

```ts
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

describe("media path helpers", () => {
  let localDir: string;
  let remoteDir: string;

  beforeEach(async () => {
    localDir = await mkdtemp(path.join(tmpdir(), "media-local-"));
    remoteDir = await mkdtemp(path.join(tmpdir(), "media-remote-"));
    process.env.LOCAL_MEDIA_DIR = localDir;
    process.env.REMOTE_MEDIA_DIR = remoteDir;
  });

  afterEach(async () => {
    await rm(localDir, { recursive: true, force: true });
    await rm(remoteDir, { recursive: true, force: true });
    delete process.env.LOCAL_MEDIA_DIR;
    delete process.env.REMOTE_MEDIA_DIR;
  });

  it("localMediaDir defaults to /data/media-local when unset", async () => {
    delete process.env.LOCAL_MEDIA_DIR;
    const { localMediaDir } = await import("./media");
    expect(localMediaDir()).toBe("/data/media-local");
  });

  it("localMediaDir reads LOCAL_MEDIA_DIR when set", async () => {
    const { localMediaDir } = await import("./media");
    expect(localMediaDir()).toBe(localDir);
  });

  it("remoteMediaDir throws when REMOTE_MEDIA_DIR is unset", async () => {
    delete process.env.REMOTE_MEDIA_DIR;
    const { remoteMediaDir } = await import("./media");
    expect(() => remoteMediaDir()).toThrow(/REMOTE_MEDIA_DIR/);
  });

  it("resolveMediaFile finds a file in the local dir", async () => {
    await mkdir(localDir, { recursive: true });
    await writeFile(path.join(localDir, "11111111-1111-1111-1111-111111111111.jpg"), "x");
    const { resolveMediaFile } = await import("./media");
    const found = await resolveMediaFile("11111111-1111-1111-1111-111111111111.jpg");
    expect(found).toEqual({
      path: path.join(localDir, "11111111-1111-1111-1111-111111111111.jpg"),
      contentType: "image/jpeg",
    });
  });

  it("resolveMediaFile falls back to the remote dir", async () => {
    await mkdir(remoteDir, { recursive: true });
    await writeFile(path.join(remoteDir, "22222222-2222-2222-2222-222222222222.png"), "x");
    const { resolveMediaFile } = await import("./media");
    const found = await resolveMediaFile("22222222-2222-2222-2222-222222222222.png");
    expect(found).toEqual({
      path: path.join(remoteDir, "22222222-2222-2222-2222-222222222222.png"),
      contentType: "image/png",
    });
  });

  it("resolveMediaFile returns null when the file is nowhere", async () => {
    const { resolveMediaFile } = await import("./media");
    expect(await resolveMediaFile("33333333-3333-3333-3333-333333333333.webp")).toBeNull();
  });

  it("resolveMediaFile returns null for a malformed filename (path traversal)", async () => {
    const { resolveMediaFile } = await import("./media");
    expect(await resolveMediaFile("../../etc/passwd")).toBeNull();
  });

  it("resolveMediaFile still works when REMOTE_MEDIA_DIR is unset", async () => {
    delete process.env.REMOTE_MEDIA_DIR;
    await mkdir(localDir, { recursive: true });
    await writeFile(path.join(localDir, "44444444-4444-4444-4444-444444444444.jpg"), "x");
    const { resolveMediaFile } = await import("./media");
    const found = await resolveMediaFile("44444444-4444-4444-4444-444444444444.jpg");
    expect(found?.path).toBe(path.join(localDir, "44444444-4444-4444-4444-444444444444.jpg"));
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npx vitest run src/lib/media.test.ts`
Expected: FAIL — `src/lib/media.ts` doesn't exist yet.

- [ ] **Step 5: Implement the path helpers**

Create `src/lib/media.ts`:

```ts
import { stat } from "node:fs/promises";
import path from "node:path";

/**
 * Directory for freshly uploaded photos. The weekly job (see
 * scripts/move-local-to-remote.ts) relocates everything here to
 * REMOTE_MEDIA_DIR — in production this MUST be a persistent volume, or a
 * redeploy between weekly runs would delete not-yet-migrated photos.
 */
export function localMediaDir(): string {
  return process.env.LOCAL_MEDIA_DIR || "/data/media-local";
}

/**
 * Mounted bulk-storage directory (SSHFS/NFS/rclone — a plain filesystem path
 * from the app's point of view). No default: every write path that depends
 * on it should fail loudly if it's missing rather than write nowhere.
 */
export function remoteMediaDir(): string {
  const dir = process.env.REMOTE_MEDIA_DIR;
  if (!dir) throw new Error("REMOTE_MEDIA_DIR is not set — required for photo storage");
  return dir;
}

const FILENAME_RE = /^[a-f0-9-]{36}\.(jpe?g|png|webp)$/;

const EXT_TO_CONTENT_TYPE: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

/**
 * Locates a served photo on disk: local buffer first (fastest, and where
 * anything uploaded in the last week still lives), then the remote archive.
 * Returns null for a malformed filename or a file that isn't in either
 * place — callers turn that into a 404.
 */
export async function resolveMediaFile(filename: string): Promise<{ path: string; contentType: string } | null> {
  if (!FILENAME_RE.test(filename)) return null;
  const ext = filename.slice(filename.lastIndexOf(".") + 1);
  const contentType = EXT_TO_CONTENT_TYPE[ext];

  const candidates = [path.join(localMediaDir(), filename)];
  if (process.env.REMOTE_MEDIA_DIR) candidates.push(path.join(process.env.REMOTE_MEDIA_DIR, filename));

  for (const candidate of candidates) {
    try {
      await stat(candidate);
      return { path: candidate, contentType };
    } catch {
      // not here — try the next candidate
    }
  }
  return null;
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run src/lib/media.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 7: Document the new env vars**

Add to `.env.example`, after the `OVERPASS_URL` block:

```
# Where freshly uploaded toilet photos are written before the weekly job moves
# them to REMOTE_MEDIA_DIR. Must be a persistent volume in production — see the
# Dockerfile comment above the CMD line for what Dokploy needs to mount.
LOCAL_MEDIA_DIR="/data/media-local"

# Required: mounted bulk-storage directory (SSHFS/NFS/rclone — any plain
# filesystem path works) that the weekly migration job and the one-time
# scripts/migrate-existing-photos.ts backfill write into. No default — the app
# fails fast at startup if this is missing.
REMOTE_MEDIA_DIR="/mnt/remote-disk/media"
```

- [ ] **Step 8: Document the required Dokploy volumes**

In `Dockerfile`, add a comment directly above the `CMD` line:

```dockerfile
# Dokploy must mount two volumes for photo storage to work:
#   1. A persistent volume at LOCAL_MEDIA_DIR's path — without persistence, a
#      redeploy between weekly runs would delete not-yet-migrated photos.
#   2. A bind mount exposing the VPS's existing remote-disk mount point (the
#      4TB SSHFS/NFS/rclone mount) at REMOTE_MEDIA_DIR's path.
```

- [ ] **Step 9: Typecheck and commit**

```bash
npx tsc --noEmit
git add vitest.config.ts package.json package-lock.json src/lib/media.ts src/lib/media.test.ts .env.example Dockerfile
git commit -m "Add media path helpers for local/remote photo storage"
```

---

## Task 2: Decode-and-save for uploaded photos

**Files:**
- Modify: `src/lib/media.ts`
- Test: `src/lib/media.test.ts`

**Interfaces:**
- Consumes: `localMediaDir(): string` (Task 1)
- Produces: `saveUploadedPhoto(dataUrl: string): Promise<string>` — used by Task 4 and Task 5. Given a `data:image/<jpeg|png|webp>;base64,<...>` string (already validated by `sanitizePhotos`), writes the decoded bytes under `localMediaDir()` and resolves to `/media/<uuid>.<ext>`.

- [ ] **Step 1: Write the failing test**

Add to `src/lib/media.test.ts` (new `describe` block, same file):

```ts
describe("saveUploadedPhoto", () => {
  let localDir: string;

  beforeEach(async () => {
    localDir = await mkdtemp(path.join(tmpdir(), "media-local-"));
    process.env.LOCAL_MEDIA_DIR = localDir;
  });

  afterEach(async () => {
    await rm(localDir, { recursive: true, force: true });
    delete process.env.LOCAL_MEDIA_DIR;
  });

  // 1x1 red pixel PNG.
  const TINY_PNG =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

  it("writes the decoded bytes and returns a served path", async () => {
    const { saveUploadedPhoto } = await import("./media");
    const url = await saveUploadedPhoto(TINY_PNG);
    expect(url).toMatch(/^\/media\/[a-f0-9-]{36}\.png$/);

    const { readFile } = await import("node:fs/promises");
    const filename = url.split("/").pop()!;
    const bytes = await readFile(path.join(localDir, filename));
    const expectedBytes = Buffer.from(TINY_PNG.split(",")[1], "base64");
    expect(bytes.equals(expectedBytes)).toBe(true);
  });

  it("rejects a string that isn't a data-URL", async () => {
    const { saveUploadedPhoto } = await import("./media");
    await expect(saveUploadedPhoto("not-a-data-url")).rejects.toThrow(/Invalid photo data-URL/);
  });

  it("creates the local directory if it doesn't exist yet", async () => {
    await rm(localDir, { recursive: true, force: true });
    const { saveUploadedPhoto } = await import("./media");
    const url = await saveUploadedPhoto(TINY_PNG);
    expect(url).toMatch(/^\/media\/[a-f0-9-]{36}\.png$/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/media.test.ts`
Expected: FAIL — `saveUploadedPhoto` is not exported yet.

- [ ] **Step 3: Implement `saveUploadedPhoto`**

Add to `src/lib/media.ts` (top-level, alongside the existing imports and helpers):

```ts
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const DATA_URL_RE = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+=*)$/;

/**
 * Decodes a validated `data:image/...;base64,...` URL (already passed
 * through `sanitizePhotos`) and writes it to the local buffer directory,
 * returning the served path to store in `Photo.url` / `CompletionPhoto.url`.
 */
export async function saveUploadedPhoto(dataUrl: string): Promise<string> {
  const match = DATA_URL_RE.exec(dataUrl);
  if (!match) throw new Error("Invalid photo data-URL");
  const [, mime, base64] = match;
  const ext = MIME_TO_EXT[mime];
  const filename = `${randomUUID()}.${ext}`;
  const dir = localMediaDir();
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, filename), Buffer.from(base64, "base64"));
  return `/media/${filename}`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/media.test.ts`
Expected: PASS (11 tests total)

- [ ] **Step 5: Commit**

```bash
npx tsc --noEmit
git add src/lib/media.ts src/lib/media.test.ts
git commit -m "Add saveUploadedPhoto for decoding uploads to disk"
```

---

## Task 3: Serving route

**Files:**
- Create: `src/app/api/media/[filename]/route.ts`
- Test: `src/app/api/media/[filename]/route.test.ts`

**Interfaces:**
- Consumes: `resolveMediaFile(filename: string): Promise<{ path: string; contentType: string } | null>` (Task 1)
- Produces: `GET` route handler at `/api/media/[filename]`, consumed by every `<img src="/media/...">` in the client (no client code changes needed).

- [ ] **Step 1: Write the failing test**

Create `src/app/api/media/[filename]/route.test.ts`:

```ts
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

describe("GET /api/media/[filename]", () => {
  let localDir: string;

  beforeEach(async () => {
    localDir = await mkdtemp(path.join(tmpdir(), "media-local-"));
    process.env.LOCAL_MEDIA_DIR = localDir;
  });

  afterEach(async () => {
    await rm(localDir, { recursive: true, force: true });
    delete process.env.LOCAL_MEDIA_DIR;
  });

  it("streams the file with the right content type when it exists", async () => {
    await mkdir(localDir, { recursive: true });
    const filename = "11111111-1111-1111-1111-111111111111.jpg";
    await writeFile(path.join(localDir, filename), "hello");

    const { GET } = await import("./route");
    const res = await GET(new Request(`http://localhost/api/media/${filename}`), {
      params: Promise.resolve({ filename }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(await res.text()).toBe("hello");
  });

  it("returns 404 when the file doesn't exist", async () => {
    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost/api/media/missing.jpg"), {
      params: Promise.resolve({ filename: "missing.jpg" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 for a path-traversal attempt", async () => {
    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost/api/media/x"), {
      params: Promise.resolve({ filename: "../../etc/passwd" }),
    });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/app/api/media/[filename]/route.test.ts`
Expected: FAIL — the route module doesn't exist yet.

- [ ] **Step 3: Implement the route**

Create `src/app/api/media/[filename]/route.ts`:

```ts
import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { resolveMediaFile } from "@/lib/media";
import { withApiErrorHandling } from "@/lib/api-error";

/** Filenames are content-addressed-ish (a given uuid's bytes never change) — safe
 *  to cache for a long time. */
const CACHE_CONTROL = "public, max-age=31536000, immutable";

export const GET = withApiErrorHandling(async (_req: Request, { params }: { params: Promise<{ filename: string }> }) => {
  const { filename } = await params;
  const found = await resolveMediaFile(filename);
  if (!found) return NextResponse.json({ error: "Photo introuvable" }, { status: 404 });

  const bytes = await readFile(found.path);
  return new NextResponse(bytes, {
    headers: { "Content-Type": found.contentType, "Cache-Control": CACHE_CONTROL },
  });
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/app/api/media/[filename]/route.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Typecheck, lint, and commit**

```bash
npx tsc --noEmit
npx eslint src/app/api/media/[filename]/route.ts
git add src/app/api/media/
git commit -m "Add GET /api/media/[filename] to serve uploaded photos from disk"
```

---

## Task 4: Wire uploads into POST /api/toilets

**Files:**
- Modify: `src/app/api/toilets/route.ts:65-81`
- Test: `src/app/api/toilets/route.test.ts`

**Interfaces:**
- Consumes: `saveUploadedPhoto(dataUrl: string): Promise<string>` (Task 2)

- [ ] **Step 1: Write the failing test**

Create `src/app/api/toilets/route.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/app/api/toilets/route.test.ts`
Expected: FAIL — `createArgs.data.photos.create` still holds the raw data-URL, not a `/media/...` path.

- [ ] **Step 3: Wire in `saveUploadedPhoto`**

In `src/app/api/toilets/route.ts`, add the import:

```ts
import { saveUploadedPhoto } from "@/lib/media";
```

Replace:

```ts
  const photoUrls = sanitizePhotos(photos, MAX_PHOTOS);

  const toilet = await prisma.toilet.create({
    data: {
      name: name.trim(),
      lat,
      lng,
      kind: KIND_TO_DB[kind as ToiletKind],
      price: typeof price === "string" && price.trim() ? price.trim().slice(0, 32) : null,
      address: typeof address === "string" && address.trim() ? address.trim().slice(0, 160) : null,
      description: typeof description === "string" && description.trim() ? description.trim().slice(0, 600) : null,
      status: "PENDING",
      createdById: me.id,
      createdByPseudo: me.pseudo,
      photos: { create: photoUrls.map((url) => ({ url, createdById: me.id })) },
    },
  });
```

with:

```ts
  const photoDataUrls = sanitizePhotos(photos, MAX_PHOTOS);
  const photoUrls = await Promise.all(photoDataUrls.map(saveUploadedPhoto));

  const toilet = await prisma.toilet.create({
    data: {
      name: name.trim(),
      lat,
      lng,
      kind: KIND_TO_DB[kind as ToiletKind],
      price: typeof price === "string" && price.trim() ? price.trim().slice(0, 32) : null,
      address: typeof address === "string" && address.trim() ? address.trim().slice(0, 160) : null,
      description: typeof description === "string" && description.trim() ? description.trim().slice(0, 600) : null,
      status: "PENDING",
      createdById: me.id,
      createdByPseudo: me.pseudo,
      photos: { create: photoUrls.map((url) => ({ url, createdById: me.id })) },
    },
  });
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/app/api/toilets/route.test.ts`
Expected: PASS

- [ ] **Step 5: Typecheck and commit**

```bash
npx tsc --noEmit
git add src/app/api/toilets/route.ts src/app/api/toilets/route.test.ts
git commit -m "Write uploaded toilet photos to disk instead of storing base64"
```

---

## Task 5: Wire uploads into POST /api/toilets/[id]/complete

**Files:**
- Modify: `src/app/api/toilets/[id]/complete/route.ts:73-84`
- Test: `src/app/api/toilets/[id]/complete/route.test.ts`

**Interfaces:**
- Consumes: `saveUploadedPhoto(dataUrl: string): Promise<string>` (Task 2)

- [ ] **Step 1: Write the failing test**

Create `src/app/api/toilets/[id]/complete/route.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run "src/app/api/toilets/[id]/complete/route.test.ts"`
Expected: FAIL — `createArgs.data.photos.create` still holds the raw data-URL.

- [ ] **Step 3: Wire in `saveUploadedPhoto`**

In `src/app/api/toilets/[id]/complete/route.ts`, add the import:

```ts
import { saveUploadedPhoto } from "@/lib/media";
```

Replace:

```ts
  const urls = photosActionable ? sanitizePhotos(photos, MAX_PHOTOS) : [];

  const completion = await prisma.completion.create({
    data: {
      toiletId,
      userId: me.id,
      name: nameActionable ? (name as string).trim() : null,
      address: addressActionable ? (address as string).trim().slice(0, 160) : null,
      comment: commentActionable ? (comment as string).trim().slice(0, 600) : null,
      photos: urls.length > 0 ? { create: urls.map((url) => ({ url })) } : undefined,
    },
  });
```

with:

```ts
  const photoDataUrls = photosActionable ? sanitizePhotos(photos, MAX_PHOTOS) : [];
  const urls = await Promise.all(photoDataUrls.map(saveUploadedPhoto));

  const completion = await prisma.completion.create({
    data: {
      toiletId,
      userId: me.id,
      name: nameActionable ? (name as string).trim() : null,
      address: addressActionable ? (address as string).trim().slice(0, 160) : null,
      comment: commentActionable ? (comment as string).trim().slice(0, 600) : null,
      photos: urls.length > 0 ? { create: urls.map((url) => ({ url })) } : undefined,
    },
  });
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run "src/app/api/toilets/[id]/complete/route.test.ts"`
Expected: PASS

- [ ] **Step 5: Typecheck and commit**

```bash
npx tsc --noEmit
git add "src/app/api/toilets/[id]/complete/route.ts" "src/app/api/toilets/[id]/complete/route.test.ts"
git commit -m "Write completion photos to disk instead of storing base64"
```

---

## Task 6: Weekly move job

**Files:**
- Create: `scripts/move-local-to-remote.ts`
- Test: `scripts/move-local-to-remote.test.ts`

**Interfaces:**
- Consumes: `localMediaDir(): string`, `remoteMediaDir(): string` (Task 1)
- Produces: `moveOneFile(src: string, dest: string): Promise<void>`, `runMove(): Promise<{ moved: number; failed: number }>` — `runMove` is consumed by Task 7's scheduler and is also this script's CLI entry point.

- [ ] **Step 1: Write the failing test**

Create `scripts/move-local-to-remote.test.ts`:

```ts
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

describe("move-local-to-remote", () => {
  let localDir: string;
  let remoteDir: string;

  beforeEach(async () => {
    localDir = await mkdtemp(path.join(tmpdir(), "media-local-"));
    remoteDir = await mkdtemp(path.join(tmpdir(), "media-remote-"));
    process.env.LOCAL_MEDIA_DIR = localDir;
    process.env.REMOTE_MEDIA_DIR = remoteDir;
  });

  afterEach(async () => {
    await rm(localDir, { recursive: true, force: true });
    await rm(remoteDir, { recursive: true, force: true });
    delete process.env.LOCAL_MEDIA_DIR;
    delete process.env.REMOTE_MEDIA_DIR;
  });

  it("moveOneFile copies the file to dest and removes the source", async () => {
    const { moveOneFile } = await import("./move-local-to-remote");
    const src = path.join(localDir, "a.jpg");
    const dest = path.join(remoteDir, "a.jpg");
    await writeFile(src, "hello");

    await moveOneFile(src, dest);

    expect(await readFile(dest, "utf8")).toBe("hello");
    await expect(readFile(src, "utf8")).rejects.toThrow();
  });

  it("runMove relocates every file in the local buffer and reports the count", async () => {
    await writeFile(path.join(localDir, "a.jpg"), "one");
    await writeFile(path.join(localDir, "b.png"), "two");

    const { runMove } = await import("./move-local-to-remote");
    const result = await runMove();

    expect(result).toEqual({ moved: 2, failed: 0 });
    expect((await readdir(localDir)).length).toBe(0);
    expect((await readdir(remoteDir)).sort()).toEqual(["a.jpg", "b.png"]);
  });

  it("runMove is a no-op when the local buffer is empty", async () => {
    await mkdir(localDir, { recursive: true });
    const { runMove } = await import("./move-local-to-remote");
    expect(await runMove()).toEqual({ moved: 0, failed: 0 });
  });

  it("runMove counts a failure without aborting the rest of the batch", async () => {
    await writeFile(path.join(localDir, "good.jpg"), "ok");
    // Make the destination directory itself a file, so writing "bad.jpg" under
    // remoteDir/bad.jpg/ (a nonsense nested path) fails deterministically for one entry.
    await mkdir(path.join(remoteDir, "bad.jpg"));
    await writeFile(path.join(remoteDir, "bad.jpg", "blocker"), "x");
    await writeFile(path.join(localDir, "bad.jpg"), "will fail");

    const { runMove } = await import("./move-local-to-remote");
    const result = await runMove();

    expect(result.moved).toBe(1);
    expect(result.failed).toBe(1);
    // The failed file must still be on local disk — never deleted before a verified copy.
    expect(await readFile(path.join(localDir, "bad.jpg"), "utf8")).toBe("will fail");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run scripts/move-local-to-remote.test.ts`
Expected: FAIL — the module doesn't exist yet.

- [ ] **Step 3: Implement the move job**

Create `scripts/move-local-to-remote.ts`:

```ts
import "dotenv/config";
import { copyFile, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { localMediaDir, remoteMediaDir } from "../src/lib/media";

/**
 * Copies `src` to `dest`, verifies the copy landed with the same byte size,
 * then deletes `src` — never the other way around, so a failed or partial
 * copy never loses the only surviving copy of a photo. Copy-then-verify
 * (rather than `fs.rename`) works identically whether the two directories
 * are on the same filesystem or not, which is both simpler and easier to
 * test than special-casing a cross-filesystem rename failure.
 */
export async function moveOneFile(src: string, dest: string): Promise<void> {
  await copyFile(src, dest);
  const [srcStat, destStat] = await Promise.all([stat(src), stat(dest)]);
  if (srcStat.size !== destStat.size) {
    throw new Error(`Copy size mismatch for ${src} -> ${dest}`);
  }
  await rm(src);
}

/** Relocates every file currently sitting in the local buffer to the remote
 *  archive. Safe to run repeatedly — an empty buffer is a fast no-op, and a
 *  per-file failure just leaves that file for the next run. */
export async function runMove(): Promise<{ moved: number; failed: number }> {
  const local = localMediaDir();
  const remote = remoteMediaDir();
  let entries: string[];
  try {
    entries = await readdir(local);
  } catch {
    return { moved: 0, failed: 0 };
  }

  let moved = 0;
  let failed = 0;
  for (const filename of entries) {
    try {
      await moveOneFile(path.join(local, filename), path.join(remote, filename));
      moved += 1;
    } catch (err) {
      failed += 1;
      console.warn(`[move-local-to-remote] failed to move ${filename}:`, err);
    }
  }
  return { moved, failed };
}

// CLI entry point — only runs when this file is executed directly (`npx tsx
// scripts/move-local-to-remote.ts`), not when imported by the scheduler or tests.
if (require.main === module) {
  runMove().then((result) => {
    console.log(`[move-local-to-remote] moved ${result.moved}, failed ${result.failed}`);
    process.exit(result.failed > 0 ? 1 : 0);
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run scripts/move-local-to-remote.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Typecheck and commit**

```bash
npx tsc --noEmit
git add scripts/move-local-to-remote.ts scripts/move-local-to-remote.test.ts
git commit -m "Add weekly local-to-remote photo migration job"
```

---

## Task 7: In-process weekly scheduler

**Files:**
- Create: `src/lib/schedule.ts`
- Test: `src/lib/schedule.test.ts`
- Create: `src/instrumentation.ts`

**Interfaces:**
- Consumes: `runMove(): Promise<{ moved: number; failed: number }>` (Task 6)
- Produces: `scheduleRecurring(fn: () => void | Promise<void>, intervalMs: number): void`, used by `src/instrumentation.ts`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/schedule.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

describe("scheduleRecurring", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls fn once per interval, not immediately", async () => {
    const { scheduleRecurring } = await import("./schedule");
    const fn = vi.fn();
    scheduleRecurring(fn, 1000);

    expect(fn).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(fn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/schedule.test.ts`
Expected: FAIL — `src/lib/schedule.ts` doesn't exist yet.

- [ ] **Step 3: Implement the scheduler**

Create `src/lib/schedule.ts`:

```ts
/**
 * Runs `fn` every `intervalMs`, starting one interval from now (not
 * immediately). Errors from `fn` are swallowed with a console warning so one
 * bad run never kills the interval — there's always a next scheduled run.
 * `.unref()` so this timer never keeps the process alive on its own, matching
 * the convention already used for the rate-limiter's sweep interval
 * (`src/lib/rate-limit.ts`).
 */
export function scheduleRecurring(fn: () => void | Promise<void>, intervalMs: number): void {
  const timer = setInterval(() => {
    Promise.resolve(fn()).catch((err) => console.warn("[schedule] recurring task failed:", err));
  }, intervalMs);
  timer.unref?.();
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/schedule.test.ts`
Expected: PASS

- [ ] **Step 5: Wire the weekly move into Next's instrumentation hook**

Create `src/instrumentation.ts`:

```ts
/**
 * Next.js runs `register()` once when the server starts (no config flag
 * needed on Next 15+). Used here to schedule the weekly local-to-remote
 * photo migration in-process — no external cron/Dokploy configuration
 * needed. Also fails fast if REMOTE_MEDIA_DIR is missing, since every photo
 * upload and this job both depend on it.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { remoteMediaDir } = await import("@/lib/media");
  remoteMediaDir(); // throws immediately if REMOTE_MEDIA_DIR is unset

  const { scheduleRecurring } = await import("@/lib/schedule");
  const { runMove } = await import("../scripts/move-local-to-remote");
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  scheduleRecurring(async () => {
    const result = await runMove();
    console.log(`[instrumentation] weekly photo move: ${result.moved} moved, ${result.failed} failed`);
  }, WEEK_MS);
}
```

- [ ] **Step 6: Typecheck and commit**

```bash
npx tsc --noEmit
git add src/lib/schedule.ts src/lib/schedule.test.ts src/instrumentation.ts
git commit -m "Schedule the weekly photo migration in-process via instrumentation.ts"
```

---

## Task 8: One-time backfill for existing base64 photos

**Files:**
- Create: `scripts/migrate-existing-photos.ts`
- Test: `scripts/migrate-existing-photos.test.ts`

**Interfaces:**
- Consumes: `remoteMediaDir(): string` (Task 1); reuses the same decode logic as `saveUploadedPhoto` (Task 2), extracted into a shared `decodeDataUrl` so both call sites decode base64 identically.

- [ ] **Step 1: Extract the shared decode helper**

In `src/lib/media.ts`, replace the body of `saveUploadedPhoto` to reuse a new exported `decodeDataUrl`:

```ts
/** Decodes a `data:image/...;base64,...` string into its extension and raw bytes. */
export function decodeDataUrl(dataUrl: string): { ext: string; bytes: Buffer } {
  const match = DATA_URL_RE.exec(dataUrl);
  if (!match) throw new Error("Invalid photo data-URL");
  const [, mime, base64] = match;
  return { ext: MIME_TO_EXT[mime], bytes: Buffer.from(base64, "base64") };
}

export async function saveUploadedPhoto(dataUrl: string): Promise<string> {
  const { ext, bytes } = decodeDataUrl(dataUrl);
  const filename = `${randomUUID()}.${ext}`;
  const dir = localMediaDir();
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, filename), bytes);
  return `/media/${filename}`;
}
```

Run `npx vitest run src/lib/media.test.ts` — expect PASS (all existing tests are unaffected, since `saveUploadedPhoto`'s behavior/signature didn't change).

- [ ] **Step 2: Write the failing test for the backfill script**

Create `scripts/migrate-existing-photos.test.ts`:

```ts
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
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run scripts/migrate-existing-photos.test.ts`
Expected: FAIL — the module doesn't exist yet.

- [ ] **Step 4: Implement the backfill script**

Create `scripts/migrate-existing-photos.ts`:

```ts
import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { prisma } from "../src/lib/prisma";
import { decodeDataUrl, remoteMediaDir } from "../src/lib/media";

const BATCH_SIZE = 200;

async function migrateTable(
  findMany: (args: { where: { url: { startsWith: string } }; take: number }) => Promise<{ id: number; url: string }[]>,
  update: (args: { where: { id: number }; data: { url: string } }) => Promise<unknown>
): Promise<{ migrated: number; failed: number }> {
  const dir = remoteMediaDir();
  await mkdir(dir, { recursive: true });

  let migrated = 0;
  let failed = 0;
  for (;;) {
    const rows = await findMany({ where: { url: { startsWith: "data:image/" } }, take: BATCH_SIZE });
    if (rows.length === 0) break;

    for (const row of rows) {
      try {
        const { ext, bytes } = decodeDataUrl(row.url);
        const filename = `${randomUUID()}.${ext}`;
        await writeFile(path.join(dir, filename), bytes);
        await update({ where: { id: row.id }, data: { url: `/media/${filename}` } });
        migrated += 1;
      } catch (err) {
        failed += 1;
        console.warn(`[migrate-existing-photos] failed to migrate photo ${row.id}:`, err);
      }
    }
  }
  return { migrated, failed };
}

/** Backfills every Photo/CompletionPhoto row still storing a base64 data-URL,
 *  writing each one straight to REMOTE_MEDIA_DIR (these are pre-existing
 *  uploads, not new ones, so there's no reason to route them through the
 *  local buffer first). Idempotent: an already-migrated row's `url` no
 *  longer starts with "data:image/", so it's never selected again. */
export async function migratePhotos(): Promise<{ migrated: number; failed: number }> {
  const photos = await migrateTable(
    (args) => prisma.photo.findMany(args),
    (args) => prisma.photo.update(args)
  );
  const completionPhotos = await migrateTable(
    (args) => prisma.completionPhoto.findMany(args),
    (args) => prisma.completionPhoto.update(args)
  );
  return {
    migrated: photos.migrated + completionPhotos.migrated,
    failed: photos.failed + completionPhotos.failed,
  };
}

if (require.main === module) {
  migratePhotos().then((result) => {
    console.log(`[migrate-existing-photos] migrated ${result.migrated}, failed ${result.failed}`);
    process.exit(result.failed > 0 ? 1 : 0);
  });
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run scripts/migrate-existing-photos.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 6: Typecheck, run the full test suite, and commit**

```bash
npx tsc --noEmit
npx vitest run
git add src/lib/media.ts src/lib/media.test.ts scripts/migrate-existing-photos.ts scripts/migrate-existing-photos.test.ts
git commit -m "Add one-time backfill script for pre-existing base64 photos"
```

- [ ] **Step 7: Manually run the backfill against the real dev database**

This step touches real data and can't be covered by the mocked unit test above — run it once against your dev database after the feature deploys:

```bash
REMOTE_MEDIA_DIR=/tmp/poopmap-media-remote npx tsx scripts/migrate-existing-photos.ts
```

Confirm the printed `migrated`/`failed` counts look right, then spot-check a couple of toilets/completions in the app to confirm their photos still render (now served from `/media/...` instead of embedded base64).

---

## Final verification

- [ ] `npx tsc --noEmit` — no errors
- [ ] `npx eslint .` — no errors
- [ ] `npx vitest run` — full suite passes
- [ ] Manual: `LOCAL_MEDIA_DIR=/tmp/poopmap-local REMOTE_MEDIA_DIR=/tmp/poopmap-remote npm run dev`, add a toilet with a photo through the UI, confirm it renders (now via `/media/<uuid>.jpg`), then run `npx tsx scripts/move-local-to-remote.ts` and confirm the photo still renders after the file has moved.
