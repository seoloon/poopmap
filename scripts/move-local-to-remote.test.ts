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
