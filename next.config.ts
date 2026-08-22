import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output keeps the Docker runtime image small.
  output: "standalone",
  webpack: (config, { nextRuntime }) => {
    if (nextRuntime === "edge") {
      // Only covers `node:`-prefixed specifiers — see src/lib/media.ts's
      // top-of-file comment for why the edge bundler chokes on Node built-ins
      // reachable from src/instrumentation.ts's import graph. A bare
      // `import path from "path"` (no `node:` prefix) would slip past this
      // list and reintroduce the same class of app-wide 500.
      if (config.externals !== undefined && !Array.isArray(config.externals)) {
        // Next has changed `config.externals`'s shape before (function/object
        // are both valid webpack shapes); spreading blindly would silently
        // discard whatever was already there instead of preserving it.
        console.warn(
          "[next.config] config.externals for the edge runtime is not an array " +
            `(got ${typeof config.externals}) — preserving it but appending node: ` +
            "externals as a separate array may not work as expected. Investigate " +
            "this webpack config before relying on it.",
        );
      }
      config.externals = [
        ...(Array.isArray(config.externals) ? config.externals : []),
        "node:fs/promises",
        "node:fs",
        "node:path",
        "node:crypto",
      ];
    }
    return config;
  },
  // No reason to advertise the framework on every response.
  poweredByHeader: false,
  // Stored Photo/CompletionPhoto URLs are `/media/<filename>` (see
  // src/lib/media.ts's saveUploadedPhoto and scripts/migrate-existing-photos.ts),
  // but the actual route handler lives at the API route path. Rewrite rather
  // than changing the stored URL shape, since that would require re-touching
  // already-written rows.
  async rewrites() {
    return [{ source: "/media/:filename", destination: "/api/media/:filename" }];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Ignored over plain HTTP (local dev), enforced once served behind TLS.
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          // Geolocation stays available to the app itself (same-origin default);
          // everything else the app never uses is switched off outright.
          { key: "Permissions-Policy", value: "camera=(), microphone=(), payment=(), usb=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
