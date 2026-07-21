import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `applicationinsights` (src/lib/logger.ts) ships a mysql diagnostic-channel
  // publisher that does a dynamic `require(path.dirname(...) + "/lib/Connection")`
  // to instrument the optional `mysql` package if present. Turbopack/webpack
  // can't statically resolve that pattern and fail the build even though the
  // path never resolves at runtime in this Postgres-only app. Keeping the
  // package external (Node `require`s it directly server-side instead of
  // bundling it) sidesteps the static analysis entirely.
  serverExternalPackages: ["applicationinsights"],
};

export default nextConfig;
