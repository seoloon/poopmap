// maplibre-gl 6 charge son worker via une URL ; sous webpack elle casse ("Worker failed to load"),
// donc on le sert depuis /public et on l'indique avec setWorkerUrl (voir Map.tsx).
import { mkdirSync, copyFileSync } from "node:fs";

mkdirSync("public/maplibre", { recursive: true });
for (const f of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  copyFileSync(`node_modules/maplibre-gl/dist/${f}`, `public/maplibre/${f}`);
}
