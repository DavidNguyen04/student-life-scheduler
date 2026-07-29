import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow Cloudflare quick tunnels (and similar) to load Next.js assets in dev.
  allowedDevOrigins: ["*.trycloudflare.com"],
};

export default nextConfig;
