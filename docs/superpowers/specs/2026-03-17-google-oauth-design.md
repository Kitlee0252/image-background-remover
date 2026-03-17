# Google OAuth + Usage Tracking Design Spec

**Date:** 2026-03-17
**Status:** Approved
**Scope:** Google OAuth login + D1 usage tracking with free tier enforcement

## Context

Image Background Remover is a Next.js 16 MVP deployed on Cloudflare Pages (@opennextjs/cloudflare). Currently completely unauthenticated — anyone can call the remove.bg API and consume credits. This design adds Google OAuth login and per-user usage tracking to prepare for future monetization (free vs paid tiers).

## Requirements

- Google OAuth as the sole login method
- Must log in to use the background removal feature; unauthenticated users see the landing page only
- Cloudflare D1 for user and usage data storage
- Free tier: 3 API calls per calendar month
- Track usage per call; only count successful remove.bg responses
- Prepare `plan` field for future paid tiers

## Architecture

### Auth Library: Auth.js (NextAuth v5 beta)

- **Dependency:** `next-auth@beta` (v5 is beta, no stable release yet). Pin to a specific beta version in package.json to avoid surprise breaking changes.
- Google Provider, JWT session strategy (no database sessions)
- JWT chosen because Edge runtime avoids per-request DB lookups for session validation
- Auth.js route handlers at `/api/auth/*`
- **Cloudflare Workers compatibility:** Auth.js v5 supports Edge Runtime. On Cloudflare, environment variables are accessed through bindings, not `process.env`. The `@opennextjs/cloudflare` adapter bridges this — `process.env` works in API routes. Auth.js config must use `process.env.AUTH_SECRET` etc., which opennextjs-cloudflare makes available.

### Adapter Strategy: JWT + Drizzle Adapter (hybrid)

Auth.js with JWT strategy + a database adapter is a supported combination. The adapter handles **user and account persistence** (creating/linking users on first login), while JWT handles **session transport** (no session table needed). This is not contradictory — Auth.js explicitly supports this pattern.

The Drizzle adapter schema expects specific column names and types. Our D1 schema must align with Drizzle adapter expectations. Custom fields (`plan`, `created_at`) are added as extra columns that the adapter ignores but our application code reads/writes directly.

### Request Flow

```
Browser
  |
  +-- GET / (landing page)
  |     page.tsx detects session via useSession() →
  |       no session: render Hero + login CTA (no upload functionality)
  |       has session: render full app (upload + processing)
  |
  +-- GET /api/auth/* (Auth.js built-in routes)
  |     /api/auth/signin       → triggers Google OAuth
  |     /api/auth/callback/*   → Google callback
  |     /api/auth/signout      → logout
  |
  +-- GET /api/usage (new)
  |     requires session → returns { used, limit, plan }
  |
  +-- POST /api/remove-background (existing, modified)
        1. Verify session (auth()) → 401 { error: "unauthorized" }
        2. Query monthly usage (D1) → 403 { error: "quota_exceeded", used: 3, limit: 3 }
        3. Existing logic (validate file, call remove.bg)
        4. On success: insert usage record
        (remove.bg errors do NOT consume quota)
```

### Session Detection on Client

`page.tsx` is currently a `"use client"` component. To access session state:

1. Add `<SessionProvider>` in `app/layout.tsx` (wraps the app with next-auth's React context)
2. `page.tsx` uses `useSession()` hook to get `{ data: session, status }`
3. `status === "authenticated"` → show full app; `status === "unauthenticated"` → show login CTA
4. `status === "loading"` → show skeleton/spinner to avoid flash

No server component conversion needed. The existing client-side architecture is preserved.

### Middleware

- File: `middleware.ts` at project root
- Responsibility: protect `/api/remove-background` and `/api/usage` — reject requests without valid JWT
- Does NOT check usage quota (that's in the API route)
- Landing page (`/`) and `/api/auth/*` are excluded from middleware protection
- Auth.js provides a `auth` middleware helper compatible with Edge Runtime

## Database Schema (Cloudflare D1)

Schema aligned with Drizzle adapter expectations. Custom fields noted.

```sql
-- Users table (Drizzle adapter standard + custom fields)
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  name TEXT,
  email TEXT UNIQUE NOT NULL,
  emailVerified INTEGER,
  image TEXT,
  -- Custom fields (not managed by adapter)
  plan TEXT DEFAULT 'free',
  created_at INTEGER DEFAULT (unixepoch())
);

-- OAuth account linking (Drizzle adapter standard)
CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  provider TEXT NOT NULL,
  providerAccountId TEXT NOT NULL,
  access_token TEXT,
  refresh_token TEXT,
  expires_at INTEGER,
  token_type TEXT,
  scope TEXT,
  id_token TEXT,
  UNIQUE(provider, providerAccountId)
);

-- Usage tracking (custom, not managed by adapter)
CREATE TABLE usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  quality TEXT NOT NULL,
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE INDEX idx_usage_user_date ON usage(userId, created_at);
```

### JWT Strategy — No Session Table

Auth.js configured with `strategy: "jwt"`. Session data lives in a signed cookie. The Drizzle adapter persists users and accounts (for OAuth linking) but does not create a session table. No `sessions` or `verification_tokens` tables needed.

## Usage Quota Logic

- Free tier: **3 calls/month** (all quality levels count equally)
- Query: `SELECT COUNT(*) FROM usage WHERE userId = ? AND created_at >= ?` (first day of current month as unix timestamp)
- Quota check happens in `/api/remove-background` before calling remove.bg
- Only successful remove.bg responses trigger an INSERT into `usage`
- `plan` field on `users` table is reserved for future tiers (`'pro'`, `'unlimited'`)

### TOCTOU Race Condition

Two concurrent requests from the same user at 2/3 quota could both pass the check and result in 4 uses. **Accepted risk for MVP:** the free tier limit is soft (off by 1-2 at worst), and the financial impact is negligible (one extra remove.bg API call). For future paid tiers, mitigate with an optimistic INSERT before the API call with DELETE on failure, or a D1 transaction.

## UI Changes

### Header (`Header.tsx`)

- **Unauthenticated:** "Sign in with Google" button on the right
- **Authenticated:** User avatar (from Google) + dropdown menu with:
  - Remaining quota display (e.g., "2/3 remaining")
  - Sign out button

### Landing Page (`page.tsx`)

- **Unauthenticated:** Hero + HowItWorks + FAQ + Footer. Upload area replaced with login CTA
- **Authenticated:** Full functionality (UploadZone + QualitySelector + processing flow)

### Quota Exceeded State

- When API returns 403 `quota_exceeded`, display an inline banner: "Monthly free quota used (3/3). Upgrade for more."
- Does not block page navigation; only prevents new processing

### New Components

| Component | Purpose |
|-----------|---------|
| `UserMenu.tsx` | Avatar + dropdown (quota info, sign out) |
| `LoginButton.tsx` | "Sign in with Google" button |
| `UsageBanner.tsx` | Quota exceeded notification |

### No Separate Login Page

Login triggers Auth.js `/api/auth/signin` which redirects to Google directly. No `/login` route needed.

## New API Endpoint

### `GET /api/usage`

- Requires valid session
- Returns: `{ used: number, limit: number, plan: string }`
- Used by `UserMenu.tsx` to display remaining quota

### Error Response Format

All auth/quota errors use a consistent JSON shape:

```json
{ "error": "<human_readable>", "code": "<machine_code>" }
```

| Status | Code | Meaning |
|--------|------|---------|
| 401 | `unauthorized` | No valid session |
| 403 | `quota_exceeded` | Monthly limit reached (includes `used` and `limit` fields) |

## D1 Binding & Migration

### Wrangler Configuration

Add to `wrangler.jsonc`:
```jsonc
{
  "d1_databases": [{
    "binding": "DB",
    "database_name": "image-bg-remover-db",
    "database_id": "<created-via-wrangler>"
  }]
}
```

### D1 Access in Code

Access in API routes via `getCloudflareContext()` from `@opennextjs/cloudflare`:

```typescript
import { getCloudflareContext } from "@opennextjs/cloudflare";
const { env } = await getCloudflareContext();
const db = env.DB;
```

### Migration Strategy

- Migration files in `migrations/` directory
- Create database: `wrangler d1 create image-bg-remover-db`
- Apply migrations:
  - Local dev: `wrangler d1 migrations apply image-bg-remover-db --local`
  - Production: `wrangler d1 migrations apply image-bg-remover-db --remote`
- Initial migration: `0001_initial_schema.sql` containing all CREATE TABLE statements

### Local Development

`npm run dev` (Next.js dev server) does not go through Wrangler, so D1 is not natively available. Options:
- **Primary approach:** Use `wrangler pages dev .next` for local testing with D1 (runs the Cloudflare Workers runtime locally with a local SQLite file)
- **Fallback:** For `npm run dev`, add a thin abstraction that falls back to a local SQLite file via `better-sqlite3` in development. However, prefer the Wrangler approach to avoid divergence.

## Environment Variables (New)

```
AUTH_SECRET=<random-string>          # Auth.js session signing key
AUTH_GOOGLE_ID=<google-client-id>    # Google OAuth client ID
AUTH_GOOGLE_SECRET=<google-secret>   # Google OAuth client secret
```

Google OAuth credentials from Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client ID (Web application).

### Google OAuth Redirect URIs

Configure these authorized redirect URIs in Google Cloud Console:

- Production: `https://imagebackgroundremover.live/api/auth/callback/google`
- Pages preview: `https://image-background-remover-7ql.pages.dev/api/auth/callback/google`
- Local dev: `http://localhost:3000/api/auth/callback/google`

## Dependencies (New)

```
next-auth@beta       # Auth.js v5 (beta — pin specific version in package.json)
@auth/drizzle-adapter # Adapter for D1 via Drizzle ORM
drizzle-orm          # ORM for D1 schema and queries
```

## Post-Implementation Updates

- Update project `CLAUDE.md` to reflect the new auth architecture, D1 database, and environment variables
- Remove "无存储架构" references

## Out of Scope

- Paid tier implementation (Stripe, plan upgrades)
- Email/password or other OAuth providers
- Usage analytics dashboard
- Rate limiting beyond quota (DDoS protection etc.)
- Image processing history / saved results
- CSRF protection configuration (Auth.js provides built-in CSRF protection by default)
