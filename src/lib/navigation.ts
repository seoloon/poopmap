/**
 * Cross-platform "open in maps" link. A plain Google Maps web URL forces iOS to open
 * Google Maps (as a website, if the app isn't installed) even though every iPhone
 * already has Apple Maps built in — so this picks the link that actually opens the
 * platform's native navigation flow instead of hardcoding one provider.
 */
export function directionsUrl(lat: number, lng: number): string {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";

  // iPadOS reports as "Macintosh" but, unlike a real Mac, has touch support.
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (ua.includes("Macintosh") && typeof document !== "undefined" && "ontouchend" in document);
  if (isIOS) return `https://maps.apple.com/?daddr=${lat},${lng}&dirflg=w`;

  // The "geo:" scheme is the generic Android intent for coordinates — if more than
  // one navigation app is installed (Google Maps, Waze, …), Android shows its own
  // app chooser; with just one, that one opens directly.
  if (/Android/.test(ua)) return `geo:0,0?q=${lat},${lng}`;

  // Desktop / anything else: no native app to hand off to, so the Google Maps website works fine.
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=walking`;
}
