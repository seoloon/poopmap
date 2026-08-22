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
