import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // forbidden() renders src/app/forbidden.tsx with a 403 (used by requireRole).
    authInterrupts: true,
    // Profile photos (and later posters) are posted to server actions; the
    // default 1 MB is too small for phone photos. storage.ts caps files at 3 MB.
    serverActions: { bodySizeLimit: "4mb" },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
