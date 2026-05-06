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
  // External packages with non-JS payloads that the bundler can't relocate:
  //   `@mongodb-js/zstd` — native Node addon (build/Release/zstd.node);
  //     Turbopack can't place a `.node` file in an ESM chunk, so we let
  //     Node's `require()` load it at runtime. The binary is rebuilt via
  //     node-gyp during `npm install` on Vercel.
  //   `mupdf` — ships a 9.5 MB WASM file (dist/mupdf-wasm.wasm) loaded by
  //     a sibling JS shim using fs/path resolution at runtime. Keeping it
  //     external means the shim's resolver finds the wasm file in
  //     `node_modules/mupdf/dist/` instead of trying (and failing) to bundle
  //     a relocated copy. Only loaded when PDF_PRECOMPRESS=mupdf.
  serverExternalPackages: ["@mongodb-js/zstd", "mupdf"],
};

export default nextConfig;
