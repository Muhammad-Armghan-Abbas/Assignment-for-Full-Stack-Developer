import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native/Node-only packages stay out of the bundle.
  serverExternalPackages: ["@libsql/client", "libsql", "mammoth", "sanitize-html"],
};

export default nextConfig;
