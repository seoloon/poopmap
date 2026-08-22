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
