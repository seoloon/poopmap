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
