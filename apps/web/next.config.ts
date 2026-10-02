import path from "node:path";
import type { NextConfig } from "next";

// Static export, zero serverless functions: every route is a file in out/. The only network the site does is the
// browser talking to the Monad RPC from the demo pages.
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  // The SDK is a symlinked workspace package one level above this app.
  turbopack: { root: path.resolve(import.meta.dirname, "../..") },
};

export default nextConfig;
