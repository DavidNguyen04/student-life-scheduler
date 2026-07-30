import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow Cloudflare quick tunnels (and similar) to load Next.js assets in dev.
  allowedDevOrigins: ["*.trycloudflare.com"],
  // pdf-parse loads pdfjs-dist worker files from node_modules at runtime.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist", "@napi-rs/canvas"],
};

export default nextConfig;
