import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output keeps the Docker runtime image small.
  output: "standalone",
  webpack: (config, { nextRuntime }) => {
    if (nextRuntime === "edge") {
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
