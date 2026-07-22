# KB System

Internal Knowledge Management Platform for L2/L3 support engineers — KB article
authoring plus AI-assisted search (single search box, cited troubleshooting
answers). First sub-project of a larger platform; see
`docs/superpowers/specs/2026-07-15-kb-core-search-design.md` for full context
and deferred scope (ticket DB, script repo, workflow trees, dashboards, etc).

## Stack

Next.js 16 (App Router, TS) monolith. Azure Postgres Flexible (Prisma). Azure
Blob Storage. Azure AI Search (hybrid keyword+semantic+vector). Azure OpenAI
(embeddings only). Claude (Anthropic SDK, all chat/reasoning). NextAuth
credentials auth, 3-tier RBAC (admin/editor/read_only).

## Setup

1. `npm install`
2. Copy `.env.example` to `.env.local`. Pull real values from Azure Key Vault
   (`kbplatform-pilot-kv`) via `az keyvault secret show` — never paste secrets
   from chat, docs, or Slack into this file.
3. `npm run db:migrate`
4. `SEED_ADMIN_EMAIL=you@fornida.com SEED_ADMIN_PASSWORD=<temp> npm run db:seed`
5. `npm run dev` — app at `localhost:3000`

## Test

`npm test` — Vitest, mocks all external SDKs (Blob/Search/OpenAI/Anthropic).

## Deploy

Push to `main` triggers `.github/workflows/ci.yml`: lint, test, build, then
deploy to the `staging` slot on `kb-platform-pilot`. Promote to prod via a
manual slot swap (`az webapp deployment slot swap`), not automatic.

## Infra

`infra/create-resources.sh` is a generated, reviewed-not-run script listing
every Azure resource this app needs. Run it manually after filling in the
owner tag; do not automate its execution. See "Known Gaps / Follow-ups"
below for issues to fix before running it.

## Scope

See the design spec for what's explicitly out of scope for this sub-project.

## Known Gaps / Follow-ups

Punch list for the next engineer picking this up. None of these are code
placeholders — the app builds, tests, and lints clean — but each is a real,
tracked gap worth closing before it bites someone.

1. **Forced password reset isn't enforced in the UI.** `mustResetPassword: true`
   is checked at the API layer only — nothing redirects a flagged user to
   `/reset-password` on login. A user can stay logged in indefinitely without
   ever resetting. Needs a check in the login flow or `(dashboard)/layout.tsx`.
2. **`PUT /api/articles/:id` 500s on a missing id.** Updating a nonexistent
   article throws an unhandled Prisma error instead of returning a clean 404.
   Needs a not-found check (or catch on the Prisma "record not found" error)
   before the 500 reaches the client.
3. **Article page is view-only, not view/edit.** `src/app/(dashboard)/articles/[id]/page.tsx`
   was scoped as "view/edit" in the original plan, but no edit form or `PUT`
   call exists yet — only viewing works. Build the edit form when article
   editing is actually needed.
4. **`extractMetadata` error messages leak article content.** In
   `src/lib/claude.ts`, parse-failure errors echo up to 200 characters of raw
   article content. Fine today, but review this before wiring up centralized
   logging so article content doesn't end up in a log aggregator without
   access controls.
5. **Auto-extracted tags aren't persisted.** `extractMetadata` computes a
   `tags` field on publish, but the publish route only saves
   `keywords`/`summary`/`category` — `tags` never gets written to the
   `Tag`/`ArticleTags` relation already defined in `schema.prisma`. Wire this
   up if/when tag-based browsing or filtering is needed.
6. **Verify before running `infra/create-resources.sh`:**
   - The web app resource name (`kb-platform-pilot`) breaks the
     `kbplatform-pilot-*` naming convention used by every other resource in
     the script — rename for consistency before running.
   - Confirm the `NODE:24-lts` App Service runtime string against
     `az webapp list-runtimes --os-type linux` — Azure's supported stacks
     sometimes lag behind upstream Node LTS releases.
   - The Azure OpenAI embeddings model deployment is a manual step in the
     Azure AI Foundry portal — it is not scripted and must be done by hand.
7. **npm audit exceptions** — already tracked; see "Known Issues" below.
   Don't duplicate here, just keep that section accurate.
8. **Search index drifts from the database on edit; no delete/unpublish prune path.**
   Indexing only happens in `POST /api/articles/[id]/publish`. `PUT
   /api/articles/[id]` updates Postgres but never re-indexes, so editing an
   already-published article leaves stale chunks/vectors in Azure AI Search.
   There is also no `DELETE` route and no `deleteDocuments` call anywhere, so
   there's no way to remove an article from the index at all. Low reach today
   (the edit UI in gap #3 doesn't exist yet), but the `PUT` endpoint is live
   and editor-reachable. Re-index on publish-of-an-already-published article,
   and add an index-prune step when delete/unpublish ships.
9. **Server-side audit logging exists but is unvalidated against a real
   Application Insights instance.** `src/lib/logger.ts` sends
   `logAuditEvent(name, properties)` calls (login success/failure, password
   reset, article create/update/publish) to Application Insights via
   `APPLICATIONINSIGHTS_CONNECTION_STRING`, and is a no-op when that var is
   unset. Unit-tested with a mocked SDK, but this dev environment has no real
   connection string to test against, so the wiring has never been confirmed
   against an actual App Insights resource (event delivery, property shape as
   it lands, latency). Validate against the Task 17 Application Insights
   instance before relying on this for a real audit trail.
10. **No rate limiting on `/api/search`.** Every call fans out to three paid
    vendor APIs (Azure OpenAI embeddings, Azure AI Search, Claude). Any
    authenticated user (including `read_only`) can script the search box and
    drive unbounded vendor spend, or trip an upstream 429 that currently
    surfaces as an opaque 500 with no retry-friendly message. Acceptable for
    a small pilot team; add a per-user/IP throttle (even a coarse in-memory
    or Postgres-backed limiter) and handle upstream 429s gracefully before
    this scales beyond the pilot.

## Known Issues
As of this pass, `npm audit` reports **21 vulnerabilities (15 moderate, 6 high, 0 low/critical)** across five independent advisory chains. `npm audit fix` (non-force) was run for real and already applied everything it could (it bumped `shadcn` and `prisma` patch versions, which is why this list is shorter than earlier passes) — nothing forceless remains. All five below require either a version this project has already ruled out or a major-version downgrade of a direct dependency; each is tracked as an accepted exception with its own re-check trigger. This list drifts as new advisories publish — re-run `npm audit` before trusting these exact numbers if much time has passed.

- **1 moderate — `postcss <8.5.10`** (XSS via unescaped `</style>`, [GHSA-qx2v-qp2m-jg93](https://github.com/advisories/GHSA-qx2v-qp2m-jg93)). Transitive via `next`'s own bundled copy (`node_modules/next/node_modules/postcss`), not this project's code. `npm audit fix --force` only resolves it by downgrading `next` to `9.3.3`, which is not viable. Re-check whenever `next` is upgraded.
- **1 high — `sharp` libvips vulnerabilities** (CVE-2026-33327, CVE-2026-33328, CVE-2026-35590, CVE-2026-35591, [GHSA-f88m-g3jw-g9cj](https://github.com/advisories/GHSA-f88m-g3jw-g9cj)). Transitive via `next`'s bundled `sharp@0.34.5` (image optimization), not this project's code. This is what pushes `next` itself to **high** severity in `npm audit`'s rollup (it's driven by `sharp`, not the `postcss` item above). Same non-viable fix as postcss — only resolvable by downgrading `next` to `9.3.3`. Re-check whenever `next` is upgraded.
- **11 moderate — `@opentelemetry/*` chain** ("Unbounded memory allocation in W3C Baggage propagation", [GHSA-8988-4f7v-96qf](https://github.com/advisories/GHSA-8988-4f7v-96qf)). Transitive via `applicationinsights` (a production dependency added in Task 19 for server-side audit logging, `src/lib/logger.ts`). Affected packages: `@opentelemetry/core`, `@opentelemetry/exporter-{logs,metrics,trace}-otlp-http`, `@opentelemetry/exporter-metrics-otlp-proto`, `@opentelemetry/otlp-exporter-base`, `@opentelemetry/otlp-transformer`, `@opentelemetry/resources`, `@opentelemetry/sdk-logs`, `@opentelemetry/sdk-metrics`, `@opentelemetry/sdk-trace-base`. `npm audit fix --force` only resolves this by installing `applicationinsights@2.9.8`, a major-version *downgrade* from the `^3.15.1` this project uses — 2.9.8 predates `applicationinsights`'s move to OpenTelemetry and would require re-validating `src/lib/logger.ts` against a different API surface, so it's not viable to take blindly. Re-check whenever `applicationinsights` ships a release that updates its bundled OpenTelemetry dependencies past the vulnerable range.
- **4 high — `@opentelemetry/propagator-jaeger` DoS** ("Denial of service in `JaegerPropagator` via unhandled exception on a malformed header", [GHSA-45rx-2jwx-cxfr](https://github.com/advisories/GHSA-45rx-2jwx-cxfr)). Same `applicationinsights` → OpenTelemetry dependency tree as the item above, reached via `applicationinsights` → `@azure/monitor-opentelemetry` → `@opentelemetry/sdk-node` → `@opentelemetry/propagator-jaeger`. This chain's HIGH severity is also why `applicationinsights` and `@azure/monitor-opentelemetry` themselves show as **high**, not moderate, in `npm audit`'s report. Same non-viable fix as above (`applicationinsights@2.9.8`, major downgrade) — re-check together with the item above.
- **2 moderate — `@hono/node-server` path traversal via `shadcn`** ("Path traversal in `serve-static` on Windows via encoded backslash (`%5C`)", [GHSA-frvp-7c67-39w9](https://github.com/advisories/GHSA-frvp-7c67-39w9)). Transitive via `shadcn` (a **direct** production dependency from the ShadCN UI setup in Task 1) → `@modelcontextprotocol/sdk` → `@hono/node-server`. `npm audit fix --force` only resolves this by downgrading `shadcn` to `3.8.3`, a major-version downgrade of the installed line that would require re-validating the whole ShadCN CLI/component setup — not viable to take blindly. Re-check whenever `shadcn` is upgraded (the non-force fix already applied bumped it to the latest `4.x` patch; this advisory sits deeper in its dependency tree).
