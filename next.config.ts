import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingRoot: __dirname,
  // libSQL har plattformsspecifika binärer – låt Node ladda dem från node_modules
  serverExternalPackages: ["@libsql/client", "libsql"],
};

export default nextConfig;
