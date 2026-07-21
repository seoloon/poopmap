/**
 * First-launch seeding, run from the Docker CMD before the server starts:
 *  1. Ensures the admin account from ADMIN_USERNAME / ADMIN_PASSWORD exists. Both are
 *     required — there is no built-in default account, so a misconfigured deployment
 *     fails to start rather than shipping with guessable credentials.
 *  2. Fetches existing public toilets in metropolitan France from the Overpass API
 *     (OpenStreetMap `amenity=toilets`) and inserts them as pre-approved spots.
 * Idempotent: re-running skips steps that already happened. The Overpass fetch is
 * best-effort — a network failure here must never block the app from starting.
 *
 * Run with: `npx tsx scripts/seed-osm.ts` (after `npx prisma db push`)
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient, ToiletKind } from "@prisma/client";

const prisma = new PrismaClient();

const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const OVERPASS_URL = process.env.OVERPASS_URL || "https://overpass-api.de/api/interpreter";

/**
 * OSM relation 1403916 = "France" (admin_level=2, ISO3166-1=FR) — the metropolitan
 * France + Corsica polygon, deliberately excluding overseas departments (DOM-TOM,
 * separate relations) and, unlike a lat/lng bounding box, excluding the slivers of
 * Germany/Switzerland/Belgium/Spain/UK a rectangle over France would otherwise include.
 * Overpass area ids are relation id + 3,600,000,000; using the numeric id (instead of
 * an `["ISO3166-1"="FR"]` tag search) avoids a full-database tag scan and is much faster.
 */
const FRANCE_AREA_ID = 3_600_000_000 + 1_403_916;

type OverpassElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

async function seedAdmin() {
  if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
    throw new Error(
      "ADMIN_USERNAME and ADMIN_PASSWORD must both be set in the environment (.env) — refusing to start without an explicit admin account."
    );
  }
  const username = ADMIN_USERNAME.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    console.log("ℹ️  Admin already present");
    return;
  }
  await prisma.user.create({
    data: {
      username,
      passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 12),
      pseudo: "CapitainePapier",
      role: "ADMIN",
    },
  });
  console.log(`✅ Admin created: ${username}`);
}

function buildAddress(tags: Record<string, string>): string | null {
  const parts = [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean);
  const line = parts.join(" ");
  const city = tags["addr:city"];
  const full = [line, city].filter(Boolean).join(", ");
  return full || null;
}

async function seedOsmToilets() {
  const already = await prisma.toilet.count({ where: { osmId: { not: null } } });
  if (already > 0) {
    console.log(`ℹ️  ${already} OSM toilets already seeded — skipping Overpass fetch`);
    return;
  }

  const query = `[out:json][timeout:300];
area(${FRANCE_AREA_ID})->.fr;
(
  node(area.fr)["amenity"="toilets"];
  way(area.fr)["amenity"="toilets"];
  relation(area.fr)["amenity"="toilets"];
);
out center;`;

  console.log("🌍 Fetching public toilets from Overpass (OpenStreetMap)… this can take ~1-2 min");
  const res = await fetch(OVERPASS_URL, {
    method: "POST",
    // Overpass rejects requests with no identifying User-Agent (406 Not Acceptable).
    headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "PoopMap-seed/1.0" },
    body: `data=${encodeURIComponent(query)}`,
    signal: AbortSignal.timeout(290_000),
  });
  if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
  const data = (await res.json()) as { elements: OverpassElement[] };

  const records = data.elements
    .map((el) => {
      const lat = el.type === "node" ? el.lat : el.center?.lat;
      const lng = el.type === "node" ? el.lon : el.center?.lon;
      if (lat === undefined || lng === undefined) return null;
      const tags = el.tags ?? {};
      const fee = tags.fee === "yes";
      return {
        // Null (not a placeholder string) when OSM has no name tag — lets logged-in
        // users fill it in later via "complete this spot", first come first served.
        name: tags.name || null,
        lat,
        lng,
        address: buildAddress(tags),
        kind: (fee ? "PAYANT" : "GRATUIT") as ToiletKind,
        price: tags.charge ?? null,
        description: tags.wheelchair === "yes" ? "Accessible PMR" : null,
        status: "APPROVED" as const,
        osmId: `${el.type}/${el.id}`,
        createdByPseudo: "OpenStreetMap",
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (records.length === 0) {
    console.log("ℹ️  Overpass returned no toilets for the France bounding box");
    return;
  }

  const { count } = await prisma.toilet.createMany({ data: records, skipDuplicates: true });
  console.log(`✅ ${count} public toilets imported from OpenStreetMap`);
}

async function ensureVersionRow() {
  await prisma.meta.upsert({ where: { key: "version" }, update: {}, create: { key: "version", value: 1 } });
}

async function main() {
  await seedAdmin();
  await ensureVersionRow();
  try {
    await seedOsmToilets();
  } catch (err) {
    // Best-effort: the app must still start even if Overpass is unreachable.
    console.warn("⚠️  OSM seeding skipped:", err instanceof Error ? err.message : err);
  }
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    // Fail closed: a missing admin account (or other seed failure) must stop the
    // Docker CMD's `&&` chain so the server never starts in that state.
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
