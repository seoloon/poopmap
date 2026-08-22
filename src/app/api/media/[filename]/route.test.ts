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
