/**
 * Metropolitan France bounding box (mainland + Corsica), used to both restrict
 * map panning/zooming and to scope the Overpass OSM seeding query.
 * [south, west, north, east]
 */
export const FRANCE_BBOX: [number, number, number, number] = [41.2, -5.3, 51.15, 9.7];

export const FRANCE_CENTER: [number, number] = [46.6, 2.4];

export const FRANCE_BOUNDS: [[number, number], [number, number]] = [
  [FRANCE_BBOX[0], FRANCE_BBOX[1]],
  [FRANCE_BBOX[2], FRANCE_BBOX[3]],
];
