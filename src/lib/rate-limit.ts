/**
 * Minimal in-memory sliding-window rate limiter. Single-instance only — this app
 * runs as one container (see docker-compose.yml), so there's no need for a shared
 * store like Redis just to blunt brute-force/credential-stuffing against the auth
 * endpoints. If this ever runs as multiple replicas, swap this for a shared store.
 */
const WINDOW_MS = 5 * 60 * 1000;
const buckets = new Map<string, { count: number; resetAt: number }>();

/** Returns true once `key` has been hit more than `max` times within the window. */
export function isRateLimited(key: string, max: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  bucket.count += 1;
  return bucket.count > max;
}

// Periodic sweep so the map doesn't grow unbounded; unref so it never keeps the
// process alive on its own (matters for serverless/edge-style shutdowns).
const sweeper = setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt < now) buckets.delete(key);
  }
}, WINDOW_MS);
sweeper.unref?.();

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}
