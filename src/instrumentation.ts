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

  const { scheduleRecurringWithStartup } = await import("@/lib/schedule");
  const { runMove } = await import("../scripts/move-local-to-remote");
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  // `scheduleRecurring` alone only fires starting one full WEEK_MS from now,
  // never immediately. On a container that redeploys/restarts more often than
  // once every 7 days, that timer resets every restart and the move job would
  // never actually run, letting LOCAL_MEDIA_DIR grow unbounded — so also run
  // once shortly after boot (delayed so it doesn't compete with the app's own
  // startup work). runMove() is idempotent and a fast no-op on an empty local
  // directory, so the extra startup run costs nothing in the common case.
  const STARTUP_DELAY_MS = 5 * 60 * 1000;
  scheduleRecurringWithStartup(async () => {
    const result = await runMove();
    console.log(`[instrumentation] photo move: ${result.moved} moved, ${result.failed} failed`);
  }, WEEK_MS, STARTUP_DELAY_MS);
}
