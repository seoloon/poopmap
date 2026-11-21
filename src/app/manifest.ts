import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Caca'rte",
    short_name: "Caca'rte",
    description: "La carte collaborative des toilettes publiques en France.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    lang: "fr",
    background_color: "#fffdf5",
    theme_color: "#ffe66d",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
