import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "500mb",
    },
  },
  // Allow LAN dev access (e.g. opening the dev server from another device on
  // the same Wi-Fi). Add any additional hosts/IPs you want to use here.
  allowedDevOrigins: ["10.121.52.26"],
  // `@mongodb-js/zstd` ships a native Node addon (build/Release/zstd.node).
  // Turbopack can't place a `.node` file in an ESM chunk, so we keep the
  // package external and let Node's `require()` load it at runtime. The
  // native binary is rebuilt via node-gyp during `npm install` on Vercel.
  serverExternalPackages: ["@mongodb-js/zstd"],
};

export default nextConfig;
