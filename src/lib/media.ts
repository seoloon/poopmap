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
