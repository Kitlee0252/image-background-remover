# Google OAuth + Usage Tracking Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Google OAuth login and per-user usage tracking (3 free calls/month) to the image background remover, gating the remove-background API behind authentication.

**Architecture:** Auth.js v5 (beta) with JWT session strategy + Drizzle adapter for Cloudflare D1. Middleware protects API routes. SessionProvider enables client-side auth state. Usage tracked in D1, enforced in API route.

**Tech Stack:** next-auth@beta, @auth/drizzle-adapter, drizzle-orm, Cloudflare D1

**Spec:** `docs/superpowers/specs/2026-03-17-google-oauth-design.md`

---

## File Map

### New Files

| File | Responsibility |
|------|---------------|
| `auth.ts` | Auth.js configuration (providers, adapter, callbacks, JWT strategy) |
| `middleware.ts` | Protect API routes — reject unauthenticated requests |
| `app/api/auth/[...nextauth]/route.ts` | Auth.js route handler (signin, callback, signout) |
| `app/api/usage/route.ts` | GET endpoint returning user's monthly usage and quota |
| `src/lib/db.ts` | D1 database access helper via getCloudflareContext() |
| `src/lib/usage.ts` | Usage query and insert functions (D1 operations) |
| `src/components/AuthProvider.tsx` | Client-side SessionProvider wrapper |
| `src/components/LoginButton.tsx` | "Sign in with Google" button |
| `src/components/UserMenu.tsx` | Avatar + dropdown (quota display, sign out) |
| `src/components/UsageBanner.tsx` | Quota exceeded notification banner |
| `migrations/0001_initial_schema.sql` | D1 schema: users, accounts, usage tables |
| `src/env.d.ts` | CloudflareEnv type declaration for D1 binding |

### Modified Files

| File | Changes |
|------|---------|
| `package.json` | Add next-auth, @auth/drizzle-adapter, drizzle-orm |
| `wrangler.jsonc` | Add d1_databases binding |
| `next.config.ts` | Add initOpenNextCloudflareForDev() for local D1 access |
| `app/layout.tsx` | Wrap children in AuthProvider |
| `app/page.tsx` | Conditional rendering based on session state |
| `app/api/remove-background/route.ts` | Add auth check + usage tracking |
| `src/components/Header.tsx` | Replace static nav with LoginButton / UserMenu |
| `src/components/Hero.tsx` | Update CTA button for unauthenticated users |
| `.env.local` | Add AUTH_SECRET, AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET |

---

## Chunk 1: Foundation (D1 + Auth.js Setup)

### Task 1: Install Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install auth and database packages**

```bash
cd "/home/memory-work/01 项目/image-background-remover"
npm install next-auth@beta --save-exact && npm install @auth/drizzle-adapter drizzle-orm
```

- [ ] **Step 2: Verify installation**

```bash
node -e "require('next-auth'); console.log('next-auth OK')"
node -e "require('drizzle-orm'); console.log('drizzle-orm OK')"
```

Expected: Both print OK without errors.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add next-auth, drizzle-orm, drizzle-adapter dependencies"
```

---

### Task 2: D1 Database & Migration

**Files:**
- Modify: `wrangler.jsonc`
- Create: `migrations/0001_initial_schema.sql`
- Create: `src/env.d.ts`

- [ ] **Step 1: Add D1 binding to wrangler.jsonc**

The current `wrangler.jsonc` content:
```jsonc
{
  "name": "image-background-remover",
  "compatibility_date": "2024-09-23",
  "compatibility_flags": ["nodejs_compat"],
  "pages_build_output_dir": ".open-next/assets",
  "observability": {
    "enabled": true
  }
}
```

Add `d1_databases` after `observability`:

```jsonc
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "image-bg-remover-db",
      "database_id": "<to-be-created>"
    }
  ]
```

Note: `database_id` will be filled after running `wrangler d1 create` in Task 2 Step 4.

- [ ] **Step 2: Create migration file**

Create `migrations/0001_initial_schema.sql`:

```sql
-- Users table (Auth.js Drizzle adapter standard + custom fields)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT,
  email TEXT UNIQUE NOT NULL,
  emailVerified INTEGER,
  image TEXT,
  plan TEXT DEFAULT 'free',
  created_at INTEGER DEFAULT (unixepoch())
);

-- OAuth account linking (Auth.js Drizzle adapter standard)
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY NOT NULL,
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
  session_state TEXT,
  UNIQUE(provider, providerAccountId)
);

-- Usage tracking
CREATE TABLE IF NOT EXISTS usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  quality TEXT NOT NULL,
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_usage_user_date ON usage(userId, created_at);
```

- [ ] **Step 3: Create CloudflareEnv type declaration**

Create `src/env.d.ts`:

```typescript
declare global {
  interface CloudflareEnv {
    DB: D1Database;
  }
}

export {};
```

- [ ] **Step 4: Create D1 database (production)**

```bash
cd "/home/memory-work/01 项目/image-background-remover"
npx wrangler d1 create image-bg-remover-db
```

Expected output: a database_id string. Update `wrangler.jsonc` with the returned `database_id`.

- [ ] **Step 5: Apply migration locally**

```bash
npx wrangler d1 migrations apply image-bg-remover-db --local
```

Expected: Tables created successfully.

- [ ] **Step 6: Commit**

```bash
git add wrangler.jsonc migrations/0001_initial_schema.sql src/env.d.ts
git commit -m "feat: add D1 database schema and migration for auth + usage tracking"
```

---

### Task 3: Auth.js Configuration

**Files:**
- Create: `auth.ts` (project root)
- Create: `src/lib/db.ts`
- Create: `app/api/auth/[...nextauth]/route.ts`
- Modify: `.env.local`

- [ ] **Step 1: Add auth env vars to .env.local**

Append to `.env.local`:

```
AUTH_SECRET=<generate-with: openssl rand -base64 32>
AUTH_GOOGLE_ID=<from-google-cloud-console>
AUTH_GOOGLE_SECRET=<from-google-cloud-console>
```

Generate AUTH_SECRET:
```bash
openssl rand -base64 32
```

For Google credentials: Go to Google Cloud Console → APIs & Services → Credentials → Create OAuth 2.0 Client ID (Web application). Add authorized redirect URIs:
- `http://localhost:3000/api/auth/callback/google`
- `https://imagebackgroundremover.live/api/auth/callback/google`
- `https://image-background-remover-7ql.pages.dev/api/auth/callback/google`

- [ ] **Step 2: Create D1 database helper**

Create `src/lib/db.ts`:

```typescript
import { getCloudflareContext } from "@opennextjs/cloudflare";

export function getD1() {
  const { env } = getCloudflareContext();
  return env.DB;
}
```

Note: `getCloudflareContext()` is synchronous — no await needed. Works in API routes running on Cloudflare Workers. For local dev, requires `initOpenNextCloudflareForDev()` in next.config.ts (done in Task 4).

- [ ] **Step 3: Create Auth.js config**

Create `auth.ts` at project root:

```typescript
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { drizzle } from "drizzle-orm/d1";
import { getD1 } from "@/lib/db";

export const { handlers, auth, signIn, signOut } = NextAuth(() => {
  const db = drizzle(getD1());
  return {
    adapter: DrizzleAdapter(db),
    providers: [Google],
    session: { strategy: "jwt" },
    callbacks: {
      jwt({ token, user }) {
        if (user?.id) {
          token.userId = user.id;
        }
        return token;
      },
      session({ session, token }) {
        if (token.userId) {
          session.user.id = token.userId as string;
        }
        return session;
      },
    },
  };
});
```

Key decisions:
- Auth.js config uses a lazy initializer function `NextAuth(() => {...})` so that `getD1()` is called at request time, not at module load time. This is critical for Cloudflare Workers where the D1 binding is only available during request handling.
- `jwt` callback stores `userId` in the token; `session` callback exposes it on `session.user.id` for client/server access.

- [ ] **Step 4: Create Auth.js route handler**

Create `app/api/auth/[...nextauth]/route.ts`:

```typescript
import { handlers } from "@/../../auth";

export const { GET, POST } = handlers;
```

Note: The import path `@/../../auth` resolves to the project root `auth.ts`. This is because `@/*` maps to `src/*`, so we need `../../` to go from `src/` up to root. Alternatively, adjust tsconfig to add a root alias — but this is simpler for now.

- [ ] **Step 5: Verify auth routes respond**

```bash
npm run build
```

Expected: Build succeeds without errors. Auth routes will be available at `/api/auth/*`.

- [ ] **Step 6: Commit**

```bash
git add auth.ts src/lib/db.ts app/api/auth/\[...nextauth\]/route.ts
git commit -m "feat: configure Auth.js with Google provider and D1 Drizzle adapter"
```

---

### Task 4: Next.js Config for Local Dev D1

**Files:**
- Modify: `next.config.ts`

- [ ] **Step 1: Add initOpenNextCloudflareForDev()**

Current `next.config.ts`:
```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["*.loca.lt"],
};

export default nextConfig;
```

Updated:
```typescript
import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

void initOpenNextCloudflareForDev();

const nextConfig: NextConfig = {
  allowedDevOrigins: ["*.loca.lt"],
};

export default nextConfig;
```

This enables `getCloudflareContext()` to work during `npm run dev` by connecting to a local D1 SQLite file. The `void` prefix suppresses the floating Promise warning — per the library docs, this async function does not need to be awaited.

- [ ] **Step 2: Commit**

```bash
git add next.config.ts
git commit -m "feat: enable Cloudflare D1 access in local dev mode"
```

---

### Task 5: Middleware for API Protection

**Files:**
- Create: `middleware.ts` (project root)

- [ ] **Step 1: Create middleware**

Create `middleware.ts`:

```typescript
import { auth } from "./auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const isAuthRoute = req.nextUrl.pathname.startsWith("/api/auth");
  if (isAuthRoute) return NextResponse.next();

  const isProtectedApi =
    req.nextUrl.pathname.startsWith("/api/remove-background") ||
    req.nextUrl.pathname.startsWith("/api/usage");

  if (isProtectedApi && !req.auth) {
    return NextResponse.json({ error: "Unauthorized", code: "unauthorized" }, { status: 401 });
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/api/:path*"],
};
```

Key points:
- Only applies to `/api/*` routes (via matcher)
- Explicitly excludes `/api/auth/*` (Auth.js needs these open)
- Returns 401 JSON for unauthenticated API calls
- Landing page (`/`) is NOT protected — anyone can view it

**Cloudflare Workers risk note:** The `auth()` middleware wrapper invokes Auth.js config, which includes the lazy D1 initializer. In middleware context on Cloudflare, JWT verification only needs `AUTH_SECRET` (no D1 access). Auth.js v5 should handle this correctly by only decoding the JWT without initializing the adapter. If this fails at runtime, fallback plan: replace `auth()` wrapper with manual JWT cookie decoding using `jose` library (already a dependency of next-auth).

- [ ] **Step 2: Commit**

```bash
git add middleware.ts
git commit -m "feat: add middleware to protect API routes with auth check"
```

---

## Chunk 2: Usage Tracking Logic

### Task 6: Usage Query & Insert Functions

**Files:**
- Create: `src/lib/usage.ts`

- [ ] **Step 1: Create usage helper module**

Create `src/lib/usage.ts`:

```typescript
import { getD1 } from "./db";

interface UsageInfo {
  used: number;
  limit: number;
  plan: string;
}

const PLAN_LIMITS: Record<string, number> = {
  free: 3,
  pro: 50,
  unlimited: 999999,
};

export async function getUserPlan(userId: string): Promise<string> {
  const db = getD1();
  const row = await db
    .prepare("SELECT plan FROM users WHERE id = ?")
    .bind(userId)
    .first<{ plan: string }>();
  return row?.plan ?? "free";
}

export async function getMonthlyUsage(userId: string): Promise<UsageInfo> {
  const db = getD1();
  const now = new Date();
  const monthStart = Math.floor(
    new Date(now.getFullYear(), now.getMonth(), 1).getTime() / 1000
  );

  const row = await db
    .prepare("SELECT COUNT(*) as count FROM usage WHERE userId = ? AND created_at >= ?")
    .bind(userId, monthStart)
    .first<{ count: number }>();

  const plan = await getUserPlan(userId);
  return {
    used: row?.count ?? 0,
    limit: PLAN_LIMITS[plan] ?? 3,
    plan,
  };
}

export async function recordUsage(userId: string, quality: string): Promise<void> {
  const db = getD1();
  await db
    .prepare("INSERT INTO usage (userId, quality) VALUES (?, ?)")
    .bind(userId, quality)
    .run();
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/usage.ts
git commit -m "feat: add usage tracking helpers (query monthly usage, record usage)"
```

---

### Task 7: Usage API Endpoint

**Files:**
- Create: `app/api/usage/route.ts`

- [ ] **Step 1: Create GET /api/usage endpoint**

Create `app/api/usage/route.ts`:

```typescript
import { auth } from "@/../../auth";
import { getMonthlyUsage } from "@/lib/usage";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized", code: "unauthorized" }, { status: 401 });
  }

  const usage = await getMonthlyUsage(session.user.id);
  return Response.json(usage);
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/usage/route.ts
git commit -m "feat: add GET /api/usage endpoint for quota display"
```

---

### Task 8: Protect /api/remove-background & Track Usage

**Files:**
- Modify: `app/api/remove-background/route.ts`

- [ ] **Step 1: Add auth check and usage tracking to existing route**

The existing route.ts POST handler starts with env var and file validation. Add auth + quota logic at the top of the handler, and usage recording after successful remove.bg response.

At the top of the file, add imports:

```typescript
import { auth } from "@/../../auth";
import { getMonthlyUsage, recordUsage } from "@/lib/usage";
```

Inside the POST handler, before the existing `REMOVE_BG_API_KEY` check, add:

```typescript
  // Auth check
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized", code: "unauthorized" }, { status: 401 });
  }

  // Quota check
  const usage = await getMonthlyUsage(session.user.id);
  if (usage.used >= usage.limit) {
    return Response.json(
      { error: "Monthly quota exceeded", code: "quota_exceeded", used: usage.used, limit: usage.limit },
      { status: 403 }
    );
  }
```

After the successful base64 response is constructed (before the final `return Response.json({ image: ... })`), add:

```typescript
  // Record usage (only on success)
  await recordUsage(session.user.id, size);
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add app/api/remove-background/route.ts
git commit -m "feat: add auth check and usage tracking to remove-background API"
```

---

## Chunk 3: UI Components & Integration

### Task 9: AuthProvider Component

**Files:**
- Create: `src/components/AuthProvider.tsx`
- Modify: `app/layout.tsx`

- [ ] **Step 1: Create AuthProvider wrapper**

Create `src/components/AuthProvider.tsx`:

```typescript
"use client";

import { SessionProvider } from "next-auth/react";

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
```

- [ ] **Step 2: Update layout.tsx to wrap with AuthProvider**

Current `app/layout.tsx` body:

```tsx
<body className="font-sans antialiased">
  {children}
</body>
```

Updated:

```tsx
import AuthProvider from "@/components/AuthProvider";

// ... inside RootLayout:
<body className="font-sans antialiased">
  <AuthProvider>
    {children}
  </AuthProvider>
</body>
```

- [ ] **Step 3: Commit**

```bash
git add src/components/AuthProvider.tsx app/layout.tsx
git commit -m "feat: add SessionProvider via AuthProvider wrapper in layout"
```

---

### Task 10: LoginButton & UserMenu Components

**Files:**
- Create: `src/components/LoginButton.tsx`
- Create: `src/components/UserMenu.tsx`

- [ ] **Step 1: Create LoginButton**

Create `src/components/LoginButton.tsx`:

```typescript
"use client";

import { signIn } from "next-auth/react";

export default function LoginButton() {
  return (
    <button
      onClick={() => signIn("google")}
      className="flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm border border-gray-300 hover:bg-gray-50 transition-colors"
    >
      <svg className="h-4 w-4" viewBox="0 0 24 24">
        <path
          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
          fill="#4285F4"
        />
        <path
          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          fill="#34A853"
        />
        <path
          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
          fill="#FBBC05"
        />
        <path
          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
          fill="#EA4335"
        />
      </svg>
      Sign in with Google
    </button>
  );
}
```

- [ ] **Step 2: Create UserMenu**

Create `src/components/UserMenu.tsx`:

```typescript
"use client";

import { signOut, useSession } from "next-auth/react";
import { useEffect, useState } from "react";

interface UsageInfo {
  used: number;
  limit: number;
  plan: string;
}

export default function UserMenu() {
  const { data: session } = useSession();
  const [usage, setUsage] = useState<UsageInfo | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch("/api/usage")
      .then((r) => r.json())
      .then(setUsage)
      .catch(() => {});
  }, []);

  if (!session?.user) return null;

  const remaining = usage ? usage.limit - usage.used : null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-full hover:ring-2 hover:ring-primary/20 transition-all"
      >
        {session.user.image ? (
          <img
            src={session.user.image}
            alt={session.user.name || "User"}
            className="h-8 w-8 rounded-full"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="h-8 w-8 rounded-full bg-primary text-white flex items-center justify-center text-sm font-medium">
            {session.user.name?.[0] || "U"}
          </div>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 z-20 w-56 rounded-lg bg-white shadow-lg border border-gray-200 py-2">
            <div className="px-4 py-2 border-b border-gray-100">
              <p className="text-sm font-medium text-gray-900 truncate">{session.user.name}</p>
              <p className="text-xs text-gray-500 truncate">{session.user.email}</p>
            </div>
            {remaining !== null && (
              <div className="px-4 py-2 border-b border-gray-100">
                <p className="text-xs text-gray-500">Monthly quota</p>
                <p className="text-sm font-medium text-gray-900">
                  {remaining > 0 ? `${remaining}/${usage!.limit} remaining` : "Quota used up"}
                </p>
              </div>
            )}
            <button
              onClick={() => signOut()}
              className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
            >
              Sign out
            </button>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/LoginButton.tsx src/components/UserMenu.tsx
git commit -m "feat: add LoginButton and UserMenu components"
```

---

### Task 11: UsageBanner Component

**Files:**
- Create: `src/components/UsageBanner.tsx`

- [ ] **Step 1: Create UsageBanner**

Create `src/components/UsageBanner.tsx`:

```typescript
"use client";

interface UsageBannerProps {
  used: number;
  limit: number;
}

export default function UsageBanner({ used, limit }: UsageBannerProps) {
  return (
    <div className="w-full max-w-2xl mx-auto rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-center">
      <p className="text-sm text-amber-800">
        <span className="font-medium">Monthly free quota used ({used}/{limit}).</span>{" "}
        Upgrade for more processing power.
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/UsageBanner.tsx
git commit -m "feat: add UsageBanner component for quota exceeded state"
```

---

### Task 12: Update Header with Auth UI

**Files:**
- Modify: `src/components/Header.tsx`

- [ ] **Step 1: Convert Header to client component with auth**

Current `Header.tsx` (18 lines, server component using `next/link`):
```tsx
import Link from "next/link";

export default function Header() {
  return (
    <header className="border-b border-gray-100">
      <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
        <Link href="/" className="text-xl font-bold text-gray-900">
          BG Remover
        </Link>
        <nav>
          <Link href="/privacy" className="text-sm text-gray-500 hover:text-gray-700 transition-colors">
            Privacy
          </Link>
        </nav>
      </div>
    </header>
  );
}
```

Replace with (preserving `Link` from `next/link` and existing class names):

```typescript
"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import LoginButton from "./LoginButton";
import UserMenu from "./UserMenu";

export default function Header() {
  const { status } = useSession();

  return (
    <header className="border-b border-gray-100">
      <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
        <Link href="/" className="text-xl font-bold text-gray-900">
          BG Remover
        </Link>
        <div className="flex items-center gap-4">
          <nav>
            <Link href="/privacy" className="text-sm text-gray-500 hover:text-gray-700 transition-colors">
              Privacy
            </Link>
          </nav>
          {status === "authenticated" && <UserMenu />}
          {status === "unauthenticated" && <LoginButton />}
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/Header.tsx
git commit -m "feat: update Header with login button and user menu"
```

---

### Task 13: Conditional Rendering on Landing Page

**Files:**
- Modify: `app/page.tsx`

This is the largest change. The page currently renders the full app for everyone. We need to gate UploadZone + processing behind authentication.

- [ ] **Step 1: Add auth imports and session hook**

At the top of `app/page.tsx`, add these imports alongside the existing ones:

```typescript
import { useSession, signIn } from "next-auth/react";
import UsageBanner from "@/components/UsageBanner";
```

Inside the `Home` component, add after the existing state declarations (after `const fileInputRef = useRef...` on line 29):

```typescript
const { data: session, status: authStatus } = useSession();
const [quotaExceeded, setQuotaExceeded] = useState<{ used: number; limit: number } | null>(null);
```

- [ ] **Step 2: Update error handling in processOneFile**

In `processOneFile` (line 107), the current error handling is:

```typescript
const data = await response.json();

if (!response.ok) {
  throw new Error(data?.error || "Failed to remove background");
}
```

Replace with quota-aware error handling:

```typescript
const data = await response.json();

if (!response.ok) {
  if (data.code === "quota_exceeded") {
    setQuotaExceeded({ used: data.used, limit: data.limit });
  }
  throw new Error(data?.error || "Failed to remove background");
}
```

- [ ] **Step 3: Update conditional rendering**

Replace the entire JSX return (lines 246-368) with the following. The key changes are:
- `<main>` content is conditionally rendered based on `authStatus`
- Unauthenticated: Hero (with `signIn` callback) + HowItWorks + FAQ
- Authenticated: full app (Hero + upload section + HowItWorks + FAQ, same as before)
- Loading: simple centered spinner
- `<HowItWorks>` and `<FAQ>` always show for authenticated users (preserving current behavior)

```tsx
return (
  <div className="min-h-screen flex flex-col bg-white">
    <Header />
    <main className="flex-1">
      {authStatus === "loading" && (
        <div className="flex justify-center items-center py-32">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      )}

      {authStatus === "unauthenticated" && (
        <>
          <Hero onUploadClick={() => signIn("google")} isAuthenticated={false} />
          <HowItWorks />
          <FAQ />
        </>
      )}

      {authStatus === "authenticated" && (
        <>
          <Hero onUploadClick={handleUploadClick} />

          {quotaExceeded && (
            <div className="mt-4">
              <UsageBanner used={quotaExceeded.used} limit={quotaExceeded.limit} />
            </div>
          )}

          <section ref={uploadRef} className="max-w-4xl mx-auto px-4 py-12">
            {/* Upload zone: show when idle or when can add more files */}
            {(phase === "idle" || phase === "selected") && (
              <>
                <UploadZone
                  onFilesSelect={handleFilesSelect}
                  fileInputRef={fileInputRef}
                />
                {errorMessage && (
                  <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-center text-sm">
                    {errorMessage}
                  </div>
                )}
              </>
            )}

            {/* Selected: show previews + quality selector + process button */}
            {phase === "selected" && files.length > 0 && (
              <div className="mt-8 space-y-6">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                  {files.map((f) => (
                    <div
                      key={f.id}
                      className="relative border border-gray-200 rounded-lg overflow-hidden bg-gray-50"
                    >
                      <div className="h-32 flex items-center justify-center">
                        <img
                          src={f.previewUrl}
                          alt={f.originalFileName}
                          className="max-h-full max-w-full object-contain p-2"
                        />
                      </div>
                      <div className="px-2 py-1.5 flex items-center justify-between">
                        <p className="text-xs text-gray-600 truncate flex-1">
                          {f.originalFileName}
                        </p>
                        <button
                          onClick={() => handleRemoveFile(f.id)}
                          className="ml-1 text-gray-400 hover:text-red-500 cursor-pointer text-sm"
                          title="Remove"
                        >
                          &times;
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <QualitySelector
                  value={globalQuality}
                  onChange={setGlobalQuality}
                />

                <div className="flex gap-4 justify-center">
                  <button
                    onClick={processAllFiles}
                    className="px-8 py-3 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white font-semibold rounded-lg transition-colors cursor-pointer"
                  >
                    {files.length === 1
                      ? "Remove Background"
                      : `Remove Backgrounds (${files.length})`}
                  </button>
                  <button
                    onClick={handleReset}
                    className="px-8 py-3 border border-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Processing: show batch view with live status */}
            {phase === "processing" && (
              <div className="mt-8">
                <BatchResultView
                  files={files}
                  onDownload={handleDownloadOne}
                  onDownloadAll={handleDownloadAll}
                  onRetry={handleRetry}
                  onRemove={handleRemoveFile}
                  onReset={handleReset}
                />
              </div>
            )}

            {/* Done: single file uses ResultView, multi uses BatchResultView */}
            {phase === "done" && singleFile && singleFile.status === "success" && (
              <ResultView
                originalUrl={singleFile.previewUrl}
                resultUrl={singleFile.resultUrl!}
                onDownload={() => handleDownloadOne(singleFile.id)}
                onReset={handleReset}
                qualityLabel={singleFile.qualitySize}
              />
            )}

            {phase === "done" && (!singleFile || singleFile.status === "error") && (
              <BatchResultView
                files={files}
                onDownload={handleDownloadOne}
                onDownloadAll={handleDownloadAll}
                onRetry={handleRetry}
                onRemove={handleRemoveFile}
                onReset={handleReset}
              />
            )}
          </section>

          <HowItWorks />
          <FAQ />
        </>
      )}
    </main>
    <Footer />
  </div>
);
```

- [ ] **Step 4: Verify build**

```bash
npm run build
```

Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add app/page.tsx
git commit -m "feat: gate upload/processing behind auth, show login CTA for guests"
```

---

### Task 14: Update Hero for Unauthenticated CTA

**Files:**
- Modify: `src/components/Hero.tsx`

- [ ] **Step 1: Update Hero button text based on auth**

The Hero component receives `onUploadClick` as a prop. When unauthenticated, the parent passes `signIn("google")` as the handler. The button text should reflect this.

Add an optional `isAuthenticated` prop:

```typescript
interface HeroProps {
  onUploadClick: () => void;
  isAuthenticated?: boolean;
}

export default function Hero({ onUploadClick, isAuthenticated = true }: HeroProps) {
```

Update the button text:

```tsx
<button onClick={onUploadClick} className="...">
  {isAuthenticated ? "Upload Images" : "Sign in to Start"}
</button>
```

In `page.tsx`, pass `isAuthenticated={false}` when rendering for unauthenticated users.

- [ ] **Step 2: Commit**

```bash
git add src/components/Hero.tsx app/page.tsx
git commit -m "feat: update Hero CTA text based on auth state"
```

---

## Chunk 4: Finalization

### Task 15: Update Environment & Documentation

**Files:**
- Modify: project `CLAUDE.md`

- [ ] **Step 1: Update CLAUDE.md**

Add to the project structure section:
- `auth.ts` — Auth.js configuration
- `middleware.ts` — API route protection
- `migrations/` — D1 schema migrations
- `src/lib/db.ts` — D1 access helper
- `src/lib/usage.ts` — Usage tracking logic

Update "关键设计决策" section:
- Add: Auth.js v5 (beta) with JWT strategy for Google OAuth
- Add: Cloudflare D1 for user and usage storage
- Add: Free tier 3 calls/month, enforced in API route
- Remove: references to "无存储架构"

Update "环境变量" section:
- Add: AUTH_SECRET, AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with auth architecture and D1 storage"
```

---

### Task 16: Apply D1 Migration to Production

- [ ] **Step 1: Apply migration to remote D1**

```bash
cd "/home/memory-work/01 项目/image-background-remover"
npx wrangler d1 migrations apply image-bg-remover-db --remote
```

Expected: Tables created in production D1.

- [ ] **Step 2: Set environment variables on Cloudflare**

Via Cloudflare dashboard (Pages → image-background-remover → Settings → Environment variables) or wrangler:

```bash
# Set production secrets
npx wrangler pages secret put AUTH_SECRET --project-name=image-background-remover
npx wrangler pages secret put AUTH_GOOGLE_ID --project-name=image-background-remover
npx wrangler pages secret put AUTH_GOOGLE_SECRET --project-name=image-background-remover
```

---

### Task 17: Build & Deploy

- [ ] **Step 1: Full build test**

```bash
cd "/home/memory-work/01 项目/image-background-remover"
npm run build
```

Expected: Build succeeds.

- [ ] **Step 2: Deploy to Cloudflare Pages**

```bash
npx opennextjs-cloudflare build
cp .open-next/worker.js .open-next/assets/_worker.js
cp -r .open-next/cloudflare .open-next/assets/
cp -r .open-next/.build .open-next/assets/
cp -r .open-next/middleware .open-next/assets/
cp -r .open-next/server-functions .open-next/assets/
npx wrangler pages deploy .open-next/assets \
  --project-name=image-background-remover --branch=main --commit-dirty=true
```

- [ ] **Step 3: Smoke test**

1. Visit https://imagebackgroundremover.live
2. Verify: Landing page loads, "Sign in with Google" button visible
3. Click sign in → redirected to Google → authorize → redirected back
4. Verify: Upload functionality visible, user avatar in header
5. Upload an image → verify it processes and quota is tracked
6. Check UserMenu dropdown shows "2/3 remaining"
7. Sign out → verify upload UI is hidden

---

## Implementation Notes

### Import Path for auth.ts

Since `auth.ts` is at project root and `@/*` maps to `src/*`, API routes import it as:
```typescript
import { auth } from "@/../../auth";
```

If this feels awkward, an alternative is to add a path alias in `tsconfig.json`:
```json
"paths": {
  "@/*": ["./src/*"],
  "@auth": ["./auth"]
}
```

### Drizzle Adapter Schema Compatibility

The Drizzle adapter expects specific column names. Our schema aligns with these expectations. The custom `plan` and `created_at` columns on `users` are extra — the adapter ignores them. If the adapter version changes and expects different columns, the migration needs updating.

### Auth.js Lazy Initializer

The `NextAuth(() => {...})` pattern (function returning config) ensures D1 is accessed at request time. Without this, `getD1()` would be called at module import time when the Cloudflare binding isn't available yet, causing a runtime error.
