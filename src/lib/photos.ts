/**
 * Server-side validation for user-submitted photos, which arrive as data-URLs
 * (client-compressed JPEG, see `lib/image.ts`) and are stored verbatim in the DB.
 * Without this, any string — a `javascript:` URI, a remote URL, or megabytes of
 * garbage — would be persisted and later dropped into `<img src>` for every visitor.
 */

/** ~440 KB of binary per photo once base64-decoded — several times the client
 *  compressor's worst case (900 px JPEG @ q0.72), so legitimate uploads never hit it. */
const MAX_PHOTO_CHARS = 600_000;

const DATA_URL_RE = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/;

/** Keeps only well-formed, size-capped image data-URLs, up to `max` of them. */
export function sanitizePhotos(input: unknown, max: number): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter((p): p is string => typeof p === "string" && p.length <= MAX_PHOTO_CHARS && DATA_URL_RE.test(p))
    .slice(0, max);
}
