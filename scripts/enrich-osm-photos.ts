/**
 * Attaches openly-licensed photos to OSM-seeded toilets, sourced from the `image=`
 * and `wikimedia_commons=` tags OSM contributors sometimes set directly on the
 * `amenity=toilets` node/way/relation — NOT scraped from Google Maps or any other
 * platform whose ToS forbids that. This is exactly the kind of reuse OSM's open data
 * (ODbL) and Wikimedia Commons (freely-licensed images) are built for.
 *
 * Deliberately one batch job, not a per-toilet loop:
 *   1. One Overpass query, filtered server-side to only nodes that already carry one
 *      of these tags (a few dozen nationally, not all 35k+ toilets).
 *   2. One DB read to see which of those already exist and already have a photo.
 *   3. One bulk insert for the rest.
 * Idempotent — safe to re-run; it only ever adds a photo to a toilet that has none.
 * Runs on every container start (Dockerfile CMD, after the main OSM seed) so newly
 * tagged OSM data gets picked up over time, not just on first launch.
 *
 * Run with: `npx tsx scripts/enrich-osm-photos.ts` (after the main OSM seed has run)
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const OVERPASS_URL = process.env.OVERPASS_URL || "https://overpass-api.de/api/interpreter";
const FRANCE_AREA_ID = 3_600_000_000 + 1_403_916;

type OverpassElement = {
  type: "node" | "way" | "relation";
  id: number;
  tags?: Record<string, string>;
};

/** Wikimedia's Special:FilePath redirects straight to the image bytes — the standard, officially supported way to link a Commons file for external reuse. */
function commonsFilePathUrl(tagValue: string): string {
  const filename = tagValue.replace(/^File:/i, "");
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(filename)}`;
}

function photoUrlFromTags(tags: Record<string, string>): string | null {
  if (tags.image && /^https?:\/\//i.test(tags.image)) return tags.image;
  if (tags.wikimedia_commons) return commonsFilePathUrl(tags.wikimedia_commons);
  return null;
}

async function main() {
  const query = `[out:json][timeout:120];
area(${FRANCE_AREA_ID})->.fr;
(
  node(area.fr)["amenity"="toilets"]["image"];
  way(area.fr)["amenity"="toilets"]["image"];
  relation(area.fr)["amenity"="toilets"]["image"];
  node(area.fr)["amenity"="toilets"]["wikimedia_commons"];
  way(area.fr)["amenity"="toilets"]["wikimedia_commons"];
  relation(area.fr)["amenity"="toilets"]["wikimedia_commons"];
);
out tags;`;

  console.log("🌍 Fetching OSM toilets that carry an image/wikimedia_commons tag…");
  const res = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "Cacarte-enrich/1.0"},
    body: `data=${encodeURIComponent(query)}`,
    signal: AbortSignal.timeout(110_000),
  });
  if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
  const data = (await res.json()) as { elements: OverpassElement[] };

  const candidates = new Map<string, string>(); // osmId -> photo url
  for (const el of data.elements) {
    const url = el.tags && photoUrlFromTags(el.tags);
    if (url) candidates.set(`${el.type}/${el.id}`, url);
  }
  console.log(`ℹ️  ${candidates.size} OSM elements carry a usable photo tag`);
  if (candidates.size === 0) return;

  const toilets = await prisma.toilet.findMany({
    where: { osmId: { in: [...candidates.keys()] } },
    select: { id: true, osmId: true, photos: { select: { id: true }, take: 1 } },
  });

  const toSeed = toilets.filter((t) => t.photos.length === 0);
  const data2 = toSeed.map((t) => ({ toiletId: t.id, url: candidates.get(t.osmId!)! }));

  if (data2.length === 0) {
    console.log("ℹ️  All matching toilets already have a photo — nothing to add");
    return;
  }

  await prisma.photo.createMany({ data: data2 });
  console.log(`✅ Added ${data2.length} photo(s) to ${data2.length} toilet(s) (${toilets.length - data2.length} already had one)`);
}

main()
  .catch((e) => {
    // Best-effort, same as the OSM toilets fetch: this runs on every container start
    // now, so a transient Overpass hiccup must never block the app from coming up.
    console.warn("⚠️  Photo enrichment skipped:", e instanceof Error ? e.message : e);
  })
  .finally(() => prisma.$disconnect());
