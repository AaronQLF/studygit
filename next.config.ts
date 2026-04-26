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
};

export default nextConfig;
