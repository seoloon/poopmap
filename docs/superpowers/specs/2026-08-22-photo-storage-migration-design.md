# Photo storage migration — off Postgres, onto local + remote disk

## Problem

User-uploaded photos (`Photo.url`, `CompletionPhoto.url`) are stored today as
base64 data-URLs written directly into Postgres columns (`src/lib/image.ts`
compresses to a JPEG data-URL client-side; `src/lib/photos.ts` validates and
persists it verbatim). OSM/Wikimedia-enriched photos are the only exception —
those are already plain remote HTTPS URLs (`scripts/enrich-osm-photos.ts`).

The VPS running the app has 100GB of local disk. A separate 4TB disk is
mounted remotely (SSHFS/NFS/rclone-style filesystem mount — a normal
directory from the app's point of view). As user-submitted photos accumulate
in Postgres, local disk pressure grows. Goal: move photo bytes out of
Postgres and onto disk, with recent uploads landing on a local buffer
directory and a weekly job relocating everything in that buffer to the
remote mount — plus a one-time backfill for every photo already stored as
base64 today.

## Non-goals

- No S3-compatible object storage support (the remote disk is a plain
  filesystem mount, confirmed).
- No per-photo storage-tier bookkeeping in the database (see "Serving" below
  for why this isn't needed).
- No change to the client-side capture/compression flow (`lib/image.ts`
  keeps producing a compressed JPEG data-URL) — only what the server does
  with that data-URL changes.

## Design

### 1. Data model — no schema migration needed

`Photo.url` and `CompletionPhoto.url` keep their current type and meaning to
every consumer: a string handed straight to `<img src>`. Today that string
is a `data:image/jpeg;base64,...` URL; going forward it becomes a short
served path, `/media/<uuid>.<ext>`. No client code changes — `<img src>`
doesn't care which kind of string it gets.

Because the column's *meaning* ("something you can put in `<img src>`")
doesn't change, no new column and no `prisma migrate` are required for this
feature.

### 2. New module: `src/lib/media.ts`

```
saveUploadedPhoto(dataUrl: string): Promise<string>
```

- Parses the validated data-URL (already passed through
  `sanitizePhotos`), decodes the base64 payload, picks an extension from
  the MIME type (`jpeg`/`png`/`webp`).
- Writes the bytes to `LOCAL_MEDIA_DIR/<uuid>.<ext>` (`node:fs/promises`,
  `crypto.randomUUID()` for the filename).
- Returns the served path `/media/<uuid>.<ext>` — this is what gets stored
  in `Photo.url` / `CompletionPhoto.url`.

Also exports the shared path-resolution helper used by the serving route and
the migration scripts:

```
resolveMediaFile(filename: string): Promise<string | null>
```

- Validates `filename` against a strict `^[a-f0-9-]{36}\.(jpe?g|png|webp)$`
  pattern (rejects path traversal outright).
- Stats `LOCAL_MEDIA_DIR/<filename>`; if present, returns that path.
- Else stats `REMOTE_MEDIA_DIR/<filename>`; if present, returns that path.
- Else returns `null`.

### 3. Write path — the two decode sites

Both call sites that currently do `photos: { create: photoUrls.map(url =>
({ url })) }` with a raw data-URL switch to writing the file first:

- `POST /api/toilets` (`src/app/api/toilets/route.ts`)
- `POST /api/toilets/[id]/complete` (`src/app/api/toilets/[id]/complete/route.ts`)

Both already call `sanitizePhotos(photos, MAX_PHOTOS)` for validation — that
doesn't change. After sanitizing, `await Promise.all(urls.map(saveUploadedPhoto))`
replaces the raw data-URLs with served paths before the `prisma.create` call.

**`lib/moderation.ts`'s `moderateCompletion` needs no change.** It copies
`CompletionPhoto.url` verbatim into the new `Photo` row (`p.url`) — by the
time a completion is moderated, that URL is already a `/media/...` path
written at submission time, not base64.

### 4. Serving: `src/app/api/media/[filename]/route.ts`

- `GET` handler: calls `resolveMediaFile(filename)`. 404 if `null`.
  Otherwise streams the file with the right `Content-Type` (from extension)
  and a long `Cache-Control` (filenames are content-addressed-ish — a given
  uuid's bytes never change), consistent with `withApiErrorHandling` used
  elsewhere for uncaught-error handling.
- Deliberately no DB lookup and no stored "tier" field: checking local-then-
  remote at request time means the weekly move job only has to relocate the
  physical file — the stored URL string never changes, so there's nothing
  to keep in sync and no risk of the DB and disk disagreeing about where a
  photo lives.

### 5. Weekly migration job

`scripts/move-local-to-remote.ts`:

- Lists every file directly under `LOCAL_MEDIA_DIR`.
- For each: attempt `fs.rename(local, remote)`; on `EXDEV` (expected, since
  local and remote are different filesystems) fall back to stream-copy +
  `fsync` + verify size match + delete the local copy. Only ever delete the
  local file after the remote copy is confirmed on disk.
- Logs a count of moved/failed files. A failure on one file doesn't abort
  the batch — it's retried on the next weekly run (the file simply stays in
  `LOCAL_MEDIA_DIR`, which the serving route already checks first, so
  nothing breaks for users in the meantime).
- Exports a plain `runMove()` function, so both the CLI entry point and the
  in-app scheduler call the same code.

**Scheduling**: `src/instrumentation.ts` (Next.js's standard one-time
server-start hook) registers `setInterval(runMove, 7 * 24 * 60 * 60 * 1000)`
on boot. No VPS/Dokploy-level cron configuration needed. If the container
restarts more often than weekly, the interval just resets — harmless, since
an empty or partial `LOCAL_MEDIA_DIR` makes the job a fast no-op.

### 6. One-time backfill: `scripts/migrate-existing-photos.ts`

- Selects every `Photo`/`CompletionPhoto` row whose `url` still starts with
  `data:image/` (idempotent — already-migrated rows are skipped on re-run).
- Processes in batches (e.g. 200 rows at a time) to avoid holding many
  decoded images in memory at once.
- Writes each decoded image **directly to `REMOTE_MEDIA_DIR`** (not the
  local buffer — these aren't new uploads, no reason to route them through
  the weekly-migration path) using the same filename/extension convention
  as `saveUploadedPhoto`.
- Updates each row's `url` to the new served path in the same batch
  transaction as the writes it corresponds to.
- Run manually once after deploying this feature (`npx tsx
  scripts/migrate-existing-photos.ts`), not wired into the Dockerfile `CMD` —
  this is a heavyweight one-off, unlike the idempotent, fast OSM seed
  scripts that already run on every container start.

### 7. Configuration

Two new required env vars, documented in `.env.example`:

- `LOCAL_MEDIA_DIR` — default `/data/media-local` if unset.
- `REMOTE_MEDIA_DIR` — **no default**; the app should fail fast at startup
  (clear error, not a silent misconfiguration) if it's unset, since every
  upload and the weekly job depend on it.

Because production deploys via Dokploy (not this repo's
`docker-compose.yml`, which is dev-only per its own header comment), the
volumes themselves aren't configured in-repo. This spec documents what's
needed operationally, to be set up in the Dokploy UI once this ships:

- A persistent volume mounted at `LOCAL_MEDIA_DIR`'s path inside the
  container — **required**, since without persistence a redeploy between
  weekly runs would delete not-yet-migrated photos.
- A bind mount exposing the VPS's existing SSHFS/NFS/rclone remote-disk
  mount point at `REMOTE_MEDIA_DIR`'s path inside the container.

## Error handling

- Upload endpoints: if `saveUploadedPhoto` throws (disk full, permission
  error), the whole request fails with the existing `withApiErrorHandling`
  500 path — no partial toilet/completion gets created with missing photos.
- Serving route: missing file (already moved, deleted, or never existed) →
  404, same as a missing DB row would be treated elsewhere in this app.
- Weekly job: per-file failures are logged and left for the next run, never
  silently drop data (no delete-before-verify).
- Backfill script: batched with per-row error isolation — one malformed
  base64 row logs and is skipped, not fatal to the whole run.

## Testing

- Unit-level: exercise `saveUploadedPhoto`/`resolveMediaFile` against a temp
  directory (no real DB needed).
- Manual: `npm run dev` with `LOCAL_MEDIA_DIR`/`REMOTE_MEDIA_DIR` pointed at
  two temp folders — add a toilet with a photo, confirm it renders via
  `/media/<uuid>.jpg`, run `scripts/move-local-to-remote.ts` manually, confirm
  the image still renders after the move.
- Backfill script: run against a dev DB seeded with a couple of base64 rows,
  confirm `url` values update and images keep rendering.
