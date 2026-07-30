import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow Cloudflare quick tunnels (and similar) to load Next.js assets in dev.
  allowedDevOrigins: ["*.trycloudflare.com"],
  // pdf-parse loads pdfjs-dist worker files from node_modules at runtime.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],
  turbopack: {
    resolveAlias: {
      // pdfjs-dist optionally uses @napi-rs/canvas (a native binding) to polyfill
      // DOMMatrix/ImageData/Path2D and to render pages to bitmaps. Turbopack's dev
      // bundler cannot resolve the platform-specific .node binary, which crashes
      // text-only extraction. pdfjs-dist already handles a missing canvas package
      // gracefully, so we stub it out since we never render pages, only extract text.
      "@napi-rs/canvas": "./src/lib/syllabus/napi-canvas-stub.js",
    },
  },
};

export default nextConfig;
