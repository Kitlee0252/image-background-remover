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

### Auth Library: Auth.js (NextAuth v5)

- Google Provider, JWT session strategy (no database sessions)
- JWT chosen because Edge runtime avoids per-request DB lookups for session validation
- Auth.js route handlers at `/api/auth/*`

### Request Flow

```
Browser
  |
  +-- GET / (landing page)
  |     middleware checks session →
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
        1. Verify session (auth()) → 401 if missing
        2. Query monthly usage (D1) → 403 if >= 3
        3. Existing logic (validate file, call remove.bg)
        4. On success: insert usage record
        (remove.bg errors do NOT consume quota)
```

### Middleware

- File: `middleware.ts` at project root
- Responsibility: session existence check only (JWT cookie present and valid)
- Does NOT check usage quota (that's in the API route)
- Landing page (`/`) is accessible to everyone; conditional rendering handles auth state

## Database Schema (Cloudflare D1)

```sql
-- Users table (Auth.js standard fields + extension)
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  name TEXT,
  email TEXT UNIQUE NOT NULL,
  emailVerified INTEGER,
  image TEXT,
  plan TEXT DEFAULT 'free',
  created_at INTEGER DEFAULT (unixepoch())
);

-- OAuth account linking (Auth.js standard)
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

-- Usage tracking
CREATE TABLE usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  quality TEXT NOT NULL,
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE INDEX idx_usage_user_date ON usage(userId, created_at);
```

### JWT Strategy — No Session Table

Auth.js configured with `strategy: "jwt"`. Session data lives in a signed cookie. The `accounts` table is required by Auth.js for OAuth provider linking. No `sessions` or `verification_tokens` tables needed.

## Usage Quota Logic

- Free tier: **3 calls/month** (all quality levels count equally)
- Query: `SELECT COUNT(*) FROM usage WHERE userId = ? AND created_at >= ?` (first day of current month as unix timestamp)
- Quota check happens in `/api/remove-background` before calling remove.bg
- Only successful remove.bg responses trigger an INSERT into `usage`
- `plan` field on `users` table is reserved for future tiers (`'pro'`, `'unlimited'`)

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

## D1 Binding

- Configure in `wrangler.jsonc`: add `d1_databases` binding
- Access in API routes via `getRequestContext()` from `@opennextjs/cloudflare`
- Migration files in `migrations/` directory, applied via `wrangler d1 migrations apply`

## Environment Variables (New)

```
AUTH_SECRET=<random-string>          # Auth.js session signing
AUTH_GOOGLE_ID=<google-client-id>    # Google OAuth client ID
AUTH_GOOGLE_SECRET=<google-secret>   # Google OAuth client secret
```

Google OAuth credentials obtained from Google Cloud Console (OAuth 2.0 Client ID, Web application type).

## Dependencies (New)

```
next-auth@5          # Auth.js v5
@auth/drizzle-adapter # D1 adapter via Drizzle
drizzle-orm          # ORM for D1 queries
```

## Out of Scope

- Paid tier implementation (Stripe, plan upgrades)
- Email/password or other OAuth providers
- Usage analytics dashboard
- Rate limiting beyond quota (DDoS protection etc.)
- Image processing history / saved results
