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
