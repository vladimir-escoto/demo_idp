# Tenant Admin Dashboard (Logto) — B2B self-service portal

Self-service admin portal for **B2B organization admins** ("Organization Admin"
persona): manage your own tenant's applications, members, roles, branding and
audit logs. Clones the UX of the [Logto](https://github.com/logto-io/logto)
Admin Console, but every Management API call is **scoped to the signed-in
user's organization**.

Part of the Tripleenable IdP evaluation (`demo_idp` repo). Backend:
`https://logto.idp.tripleenable.com` (already deployed — this app only talks
to it).

## Architecture

```
Browser (React, vendored Logto console components + SWR)
   │  fetch /api/tenant/<management-path>
   ▼
Next.js route handler  src/app/api/tenant/[...path]/route.ts
   │  1. @logto/next session → user + organizations claim → org_id
   │  2. requires the `orgadmin` organization role
   │  3. allowlist + org_id injection/validation per route
   │  4. M2M client_credentials token (cached) → Management API
   ▼
Logto Management API (global) — scoping enforced by the proxy
```

Key decisions:

- **Vendored console UI**: `src/ds-components`, `src/components/*`, feature
  pages and the MDX quick-start guides are copied from
  `logto-io/logto/packages/console` (MPL-2.0) and adapted: react-router is
  shimmed over next/navigation (`src/lib/router-shim.tsx`), cloud/paywall
  surfaces are stubbed (`FeatureTag`, `SubscriptionDataProvider`, …), files are
  marked `@ts-nocheck` as vendor code.
- **App ownership**: Logto OIDC apps are global, so the portal tags every app
  it creates with `customData.orgId` and the proxy filters/guards on it.
- **Members privacy**: "Add member" works by exact username/email match
  (`POST api/org-members`), never exposing the global user directory.
- **Org-scoped dashboard**: upstream `/api/dashboard` is global-only, so the
  proxy computes Total/New users from the org's members and approximates
  DAU/WAU/MAU from `lastSignInAt` (per-org sign-in aggregates are not exposed
  by the Management API).
- **Audit logs**: with an application/user filter the upstream pagination is
  used as-is; the unfiltered view fetches a 200-entry window and filters it to
  the org's members/apps (demo-scale tradeoff).
- Out of scope on purpose (identity-admin concerns): JIT provisioning,
  connectors/SSO, M2M role assignment, app-level branding/permissions tabs.

## Local development

```bash
npm install
cp .env.example .env.local   # fill in values (see table below)
node scripts/create-portal-app.mjs   # one-time: creates the portal's OIDC app in Logto
npm run dev                  # http://localhost:3000
```

Sign in with an account that has the `orgadmin` role in its organization
(e.g. the demo's `AdminAlpha` in "Corp Alpha").

## Environment variables

| Variable | Purpose |
|---|---|
| `LOGTO_ENDPOINT` | Logto base URL (`https://logto.idp.tripleenable.com/`) |
| `LOGTO_APP_ID` / `LOGTO_APP_SECRET` | This portal's own OIDC app ("Tenant Admin Portal", Traditional Web) |
| `LOGTO_COOKIE_SECRET` | 32+ random chars for the session cookie |
| `LOGTO_BASE_URL` | Public URL of this portal (`http://localhost:3000` in dev) |
| `NEXT_PUBLIC_LOGTO_ENDPOINT` | Browser-visible endpoint (shown in the endpoints card / SDK snippets); **build-time** |
| `LOGTO_M2M_CLIENT_ID` / `LOGTO_M2M_CLIENT_SECRET` | M2M app credentials for the Management API (server-side only) |
| `LOGTO_MANAGEMENT_API_RESOURCE` | `https://default.logto.app/api` |

## Deploy on Coolify (same pattern as `/web-client`)

1. Resource type **Public Repository**: `https://github.com/vladimir-escoto/demo_idp`, branch `main`.
2. **Base Directory** `/tenant-admin-logto` · **Build Pack** `Dockerfile` · **Ports Exposes** `3000`.
3. **Domain**: `https://tenant.idp.tripleenable.com` (wildcard DNS already resolves; Let's Encrypt is automatic, expect the ~30–60s self-signed window right after deploy).
4. Paste the env vars (production values) in *Developer view*; `LOGTO_BASE_URL=https://tenant.idp.tripleenable.com`.
5. The portal's OIDC app must list `https://tenant.idp.tripleenable.com/callback` as a redirect URI (the bootstrap script already adds it).

## Attribution / license note

UI components, styles and quick-start guide content are derived from
[logto-io/logto](https://github.com/logto-io/logto) (`packages/console`),
licensed under MPL-2.0. This demo keeps those files under the same license
terms; see the upstream repository for details.
