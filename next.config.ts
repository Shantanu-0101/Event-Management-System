import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // No other site may show these pages in a frame (clickjacking). The rest of
          // a full Content-Security-Policy would need nonces, which static pages can't have.
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
          },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Reset links carry a token in the URL; other sites must not receive it.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Only the check-in scanner needs a device, and only on this site.
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=31536000" },
        ],
      },
    ];
  },
  cacheComponents: true,
  partialPrefetching: true,
  images: {
    // Event posters uploaded to Cloudinary (see src/lib/storage.ts).
    remotePatterns: [{ protocol: "https", hostname: "res.cloudinary.com" }],
  },
  experimental: {
    // forbidden() renders src/app/forbidden.tsx with a 403 (used by requireRole).
    authInterrupts: true,
    // Profile photos, posters and rules PDFs are posted to server actions; the
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
