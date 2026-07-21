import type { NextConfig } from "next";

// Content-Security-Policy for `@microsoft/applicationinsights-web` (loaded
// client-side in src/components/app-insights.tsx). Verified against the
// installed SDK source (node_modules/@microsoft/applicationinsights-*):
//
// - connect-src must allow the telemetry ingestion endpoint. This app's
//   `NEXT_PUBLIC_APPINSIGHTS_CONNECTION_STRING` supplies a full Azure
//   connection string, so the SDK's ConnectionStringParser
//   (applicationinsights-core-js/telemetry/ConnectionStringParser) resolves
//   `IngestionEndpoint` to a region-specific
//   `https://<region>.in.applicationinsights.azure.com` host when the
//   connection string carries one (the normal case for Azure-portal-issued
//   strings), falling back to the SDK's DEFAULT_BREEZE_ENDPOINT
//   (`https://dc.services.visualstudio.com`) when it doesn't — both are
//   allowed below since either can be hit depending on the connection
//   string's shape.
// - The SDK also always instantiates a CfgSyncPlugin
//   (applicationinsights-cfgsync-js/CfgSyncPlugin.js) which, unless
//   explicitly blocked, fetches a remote kill-switch config from
//   `https://js.monitor.azure.com/scripts/b/ai.config.1.cfg.json` on init —
//   a real network call this SDK makes regardless of connection string, so
//   its origin is allowed too.
// - script-src needs 'unsafe-inline': this app loads
//   `@microsoft/applicationinsights-web` as an ES import bundled into the
//   app's own script (not the classic inline "snippet" loader), so the SDK
//   itself injects no inline scripts. The 'unsafe-inline' allowance here is
//   for Next.js App Router's own inline hydration/streaming scripts
//   (`self.__next_f.push(...)`), which this app does not use a nonce for.
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self' https://dc.services.visualstudio.com https://*.in.applicationinsights.azure.com https://js.monitor.azure.com",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  // `applicationinsights` (src/lib/logger.ts) ships a mysql diagnostic-channel
  // publisher that does a dynamic `require(path.dirname(...) + "/lib/Connection")`
  // to instrument the optional `mysql` package if present. Turbopack/webpack
  // can't statically resolve that pattern and fail the build even though the
  // path never resolves at runtime in this Postgres-only app. Keeping the
  // package external (Node `require`s it directly server-side instead of
  // bundling it) sidesteps the static analysis entirely.
  serverExternalPackages: ["applicationinsights"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
        ],
      },
    ];
  },
};

export default nextConfig;
