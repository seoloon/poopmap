import { stat, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
// Uses the global `crypto.randomUUID()` (Node 19+, also available in the edge
// runtime's Web Crypto API) rather than `import { randomUUID } from "node:crypto"`.
// `src/instrumentation.ts` reaches this module through a dynamic import that Next
// bundles for both the nodejs and edge runtime targets at build time (even though
// only the nodejs branch ever runs it), and the edge bundler can't resolve
// `node:crypto` — it broke `GET /` app-wide. The global accessor sidesteps that
// entirely since it needs no module import.

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

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const DATA_URL_RE = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+=*)$/;

/** Decodes a `data:image/...;base64,...` string into its extension and raw bytes. */
export function decodeDataUrl(dataUrl: string): { ext: string; bytes: Buffer } {
  const match = DATA_URL_RE.exec(dataUrl);
  if (!match) throw new Error("Invalid photo data-URL");
  const [, mime, base64] = match;
  return { ext: MIME_TO_EXT[mime], bytes: Buffer.from(base64, "base64") };
}

/**
 * Decodes a validated `data:image/...;base64,...` URL (already passed
 * through `sanitizePhotos`) and writes it to the local buffer directory,
 * returning the served path to store in `Photo.url` / `CompletionPhoto.url`.
 */
export async function saveUploadedPhoto(dataUrl: string): Promise<string> {
  const { ext, bytes } = decodeDataUrl(dataUrl);
  const filename = `${crypto.randomUUID()}.${ext}`;
  const dir = localMediaDir();
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, filename), bytes);
  return `/media/${filename}`;
}
