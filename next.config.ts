import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produce a self-contained Node.js server for the production Docker image.
  // The existing Cloudflare/Sites build remains available through Vite.
  output: "standalone",
};

export default nextConfig;
