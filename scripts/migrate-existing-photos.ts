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
