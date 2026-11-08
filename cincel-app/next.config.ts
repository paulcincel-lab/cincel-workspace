import type { NextConfig } from "next";

// Allow embedding Google Drive / Docs previews and loading their icons+thumbnails.
const GOOGLE_FRAME_SRC = "https://drive.google.com https://docs.google.com";
const GOOGLE_IMG_SRC =
  "https://*.googleusercontent.com https://drive.google.com https://*.google.com https://ssl.gstatic.com";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  output: "standalone",
  experimental: {
    // Going back to a page seen in the last 30 s reuses its payload instead of rendering it again.
    // Server Actions that revalidate and router.refresh() still drop it right away.
    staleTimes: { dynamic: 30 },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              `img-src 'self' data: blob: ${GOOGLE_IMG_SRC}`,
              "font-src 'self' data:",
              "connect-src 'self'",
              `frame-src 'self' ${GOOGLE_FRAME_SRC}`,
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
