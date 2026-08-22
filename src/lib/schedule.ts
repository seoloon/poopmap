/**
 * Runs `fn` every `intervalMs`, starting one interval from now (not
 * immediately). Errors from `fn` are swallowed with a console warning so one
 * bad run never kills the interval — there's always a next scheduled run.
 * `.unref()` so this timer never keeps the process alive on its own, matching
 * the convention already used for the rate-limiter's sweep interval
 * (`src/lib/rate-limit.ts`).
 */
export function scheduleRecurring(fn: () => void | Promise<void>, intervalMs: number): void {
  const timer = setInterval(() => {
    Promise.resolve(fn()).catch((err) => console.warn("[schedule] recurring task failed:", err));
  }, intervalMs);
  timer.unref?.();
}

/**
 * Like `scheduleRecurring`, but also runs `fn` once after `startupDelayMs`
 * (rather than waiting a full `intervalMs` for the first run). Use this for
 * any job whose absence would be actively harmful if the process restarts
 * more often than once per `intervalMs` — `scheduleRecurring` alone resets
 * its timer on every restart, so a frequently-redeployed container could
 * otherwise never run the job at all. `fn`'s errors are swallowed with a
 * console warning on both the startup run and every recurring run, for the
 * same reason as `scheduleRecurring`.
 */
export function scheduleRecurringWithStartup(fn: () => void | Promise<void>, intervalMs: number, startupDelayMs: number): void {
  const startupTimer = setTimeout(() => {
    Promise.resolve(fn()).catch((err) => console.warn("[schedule] startup task failed:", err));
  }, startupDelayMs);
  startupTimer.unref?.();
  scheduleRecurring(fn, intervalMs);
}
