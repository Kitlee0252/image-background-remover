# Billing System Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a hybrid billing system (credits + monthly subscription) with PhotoRoom API migration and user center.

**Architecture:** Replace remove.bg with PhotoRoom API ($0.02/image). Add credits + subscription billing via PayPal. Build `/account` user center with plan management. All on Cloudflare D1 + Next.js 16 App Router.

**Tech Stack:** Next.js 16, Cloudflare D1 (SQLite), PhotoRoom API, PayPal REST API, Auth.js v5, TypeScript, Tailwind CSS 4

**Spec:** `docs/superpowers/specs/2026-03-18-billing-system-design.md`

### Critical Implementation Notes

1. **Credit deduction MUST happen after API success** — never deduct before calling PhotoRoom. Failed images must not consume credits (per spec FAQ).
2. **Migration 0003 is a hard prerequisite** — existing `usage.ts` code (`getMonthlyUsage`, `recordUsage`) uses column names (`user_id`, `created_at`, `quality`) that don't match the current schema (`userId`, `createdAt`, no `quality`). Code works only after migration 0003 recreates the table.
3. **Store PayPal subscription ID before redirecting to PayPal** — the webhook handler needs it to find the user.
4. **`process.env` in Cloudflare Workers** — access env vars inside request handlers, not at module top level.

### Deferred to Follow-Up

These spec items are scoped out of this plan to keep MVP manageable:
- **Overage purchase flow** — subscribers can buy extra images at $0.12/$0.08. Will add after core billing works.
- **remove.bg fallback** — emergency fallback when PhotoRoom is down. Will add as a config switch.
- **Account deletion** — UI + API for permanent data removal. Will add in a privacy/compliance pass.

---

## File Structure

### New files

| File | Responsibility |
|------|---------------|
| `migrations/0003_fix_schema.sql` | Fix existing schema issues (prerequisite) |
| `migrations/0004_billing.sql` | Add credits, transactions tables + user columns |
| `src/lib/photoroom.ts` | PhotoRoom API client (remove background) |
| `src/lib/plans.ts` | Plan definitions, limits, privilege checks |
| `src/lib/credits.ts` | Credits balance management (get, deduct, add) |
| `src/lib/paypal.ts` | PayPal REST API client (orders, subscriptions, webhooks) |
| `app/api/checkout/credits/route.ts` | PayPal order creation for credit packs |
| `app/api/checkout/capture/route.ts` | PayPal order capture after approval |
| `app/api/checkout/subscribe/route.ts` | PayPal subscription creation |
| `app/api/webhooks/paypal/route.ts` | PayPal webhook handler |
| `app/api/account/route.ts` | GET full account info |
| `app/api/account/cancel/route.ts` | POST cancel subscription |
| `app/account/page.tsx` | User center page (3 tabs) |
| `src/components/account/OverviewTab.tsx` | Account overview |
| `src/components/account/PlansTab.tsx` | Plan comparison + credit packs |
| `src/components/account/BillingTab.tsx` | Payment method + transactions |
| `src/components/account/PlanCard.tsx` | Single plan card |
| `src/components/account/CreditPackCard.tsx` | Single credit pack card |
| `src/components/account/TransactionHistory.tsx` | Transaction list with pagination |

### Files to modify

| File | Changes |
|------|---------|
| `src/types.ts` | Add billing types, update `QualitySize`, make limits plan-aware |
| `src/lib/usage.ts` | Fix SQL table names, update `PLAN_LIMITS`, integrate credits |
| `src/env.d.ts` | Add `PHOTOROOM_API_KEY`, `PAYPAL_*` env var types |
| `app/api/remove-background/route.ts` | Switch to PhotoRoom, add credit consumption, plan-aware file size |
| `src/components/UserMenu.tsx` | Add credits display, "Account Settings" link |
| `src/components/UsageBanner.tsx` | Add upgrade link to `/account` |
| `src/components/FAQ.tsx` | Categorized 4-tab FAQ with billing content |
| `src/components/UploadZone.tsx` | Plan-aware MAX_FILES |
| `middleware.ts` | Exclude `/api/webhooks/paypal` from auth (PayPal calls it) |

---

## Chunk 1: Foundation — Schema Fix + PhotoRoom Migration

### Task 1: Prerequisite Schema Migration

**Files:**
- Create: `migrations/0003_fix_schema.sql`
- Modify: `src/lib/usage.ts`

- [ ] **Step 1: Write the migration SQL**

Create `migrations/0003_fix_schema.sql`:

```sql
-- Prerequisite: fix existing schema issues before billing
-- App is pre-launch, no production data — safe to drop+recreate

-- 1. Recreate usage table with correct column names
DROP TABLE IF EXISTS usage;
CREATE TABLE usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  quality TEXT,
  created_at INTEGER NOT NULL
);

-- 2. Add plan column to user table
ALTER TABLE user ADD COLUMN plan TEXT DEFAULT 'free';
```

- [ ] **Step 2: Fix table name in usage.ts**

In `src/lib/usage.ts`, fix `getUserPlan()` — change `users` to `user`:

```typescript
// Line 15: change "users" to "user"
.prepare("SELECT plan FROM user WHERE id = ?")
```

- [ ] **Step 3: Update PLAN_LIMITS**

In `src/lib/usage.ts`, update the plan limits:

```typescript
export const PLAN_LIMITS: Record<string, number> = {
  free: 3,
  basic: 40,
  pro: 100,
};
```

- [ ] **Step 4: Apply migration locally**

Run: `npx wrangler d1 execute AUTH_DB --local --file=migrations/0003_fix_schema.sql`

Verify: `npx wrangler d1 execute AUTH_DB --local --command="PRAGMA table_info(usage); PRAGMA table_info(user);"`

Expected: `usage` has columns `id, user_id, quality, created_at`. `user` has column `plan`.

- [ ] **Step 5: Commit**

```bash
git add migrations/0003_fix_schema.sql src/lib/usage.ts
git commit -m "fix: prerequisite schema — fix table names, add plan column"
```

---

### Task 2: PhotoRoom API Client

**Files:**
- Create: `src/lib/photoroom.ts`
- Modify: `src/env.d.ts`

**Reference:** PhotoRoom API docs — `POST https://sdk.photoroom.com/v1/segment`, auth via `x-api-key` header, response is binary image (not JSON). Size values: `preview`, `medium`, `hd`, `full`.

- [ ] **Step 1: Add env type**

In `src/env.d.ts`, add `PHOTOROOM_API_KEY` to the `CloudflareEnv` interface:

```typescript
interface CloudflareEnv {
  AUTH_DB: D1Database;
  PHOTOROOM_API_KEY: string;
  REMOVE_BG_API_KEY?: string; // fallback, optional
}
```

- [ ] **Step 2: Create PhotoRoom client**

Create `src/lib/photoroom.ts`:

```typescript
/**
 * PhotoRoom Remove Background API client.
 * Endpoint: POST https://sdk.photoroom.com/v1/segment
 * Auth: x-api-key header
 * Response: binary image data
 * Docs: https://docs.photoroom.com/remove-background-api-basic-plan
 */

// Map our internal size names to PhotoRoom's size parameter values.
// remove.bg used "auto" — PhotoRoom uses "medium" for the equivalent.
const SIZE_MAP: Record<string, string> = {
  preview: "preview",
  auto: "medium",
  medium: "medium",
  hd: "hd",
  full: "full",
};

export interface PhotoRoomResult {
  ok: true;
  imageBuffer: ArrayBuffer;
  contentType: string;
}

export interface PhotoRoomError {
  ok: false;
  status: number;
  message: string;
}

export async function removeBackground(
  apiKey: string,
  imageBlob: Blob,
  fileName: string,
  size: string
): Promise<PhotoRoomResult | PhotoRoomError> {
  const formData = new FormData();
  formData.append("image_file", imageBlob, fileName);
  formData.append("size", SIZE_MAP[size] ?? "full");
  formData.append("format", "png");

  const response = await fetch("https://sdk.photoroom.com/v1/segment", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    let message = "Failed to remove background.";
    try {
      const errorData = JSON.parse(errorText);
      if (errorData.message) message = errorData.message;
    } catch {}
    return { ok: false, status: response.status, message };
  }

  const contentType = response.headers.get("content-type") || "image/png";
  const imageBuffer = await response.arrayBuffer();
  return { ok: true, imageBuffer, contentType };
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/photoroom.ts src/env.d.ts
git commit -m "feat: add PhotoRoom API client"
```

---

### Task 3: Migrate remove-background route to PhotoRoom

**Files:**
- Modify: `app/api/remove-background/route.ts`
- Modify: `src/types.ts`

- [ ] **Step 1: Update QualitySize type and size options**

In `src/types.ts`, update `QualitySize` to include `medium` and update `QUALITY_OPTIONS`:

```typescript
export type QualitySize = "preview" | "auto" | "hd" | "full";

export const QUALITY_OPTIONS: {
  value: QualitySize;
  label: string;
  description: string;
}[] = [
  { value: "preview", label: "Preview", description: "Low res, fastest" },
  { value: "auto", label: "Standard", description: "Good for most uses" },
  { value: "hd", label: "HD", description: "Up to 4 MP" },
  { value: "full", label: "Ultra HD", description: "Up to 36 MP" },
];
```

No change to `QualitySize` type itself — we keep `auto` as the internal name and let `photoroom.ts` map it to `medium`.

- [ ] **Step 2: Rewrite the remove-background route**

Replace the entire `app/api/remove-background/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "../../../auth";
import { getMonthlyUsage, recordUsage } from "@/lib/usage";
import { removeBackground } from "@/lib/photoroom";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const ALLOWED_SIZES = ["preview", "auto", "hd", "full"] as const;

// Plan-aware file size limits (bytes)
const FILE_SIZE_LIMITS: Record<string, number> = {
  free: 5 * 1024 * 1024,     // 5MB
  basic: 25 * 1024 * 1024,   // 25MB
  pro: 25 * 1024 * 1024,     // 25MB
};

// Plan-aware quality ceilings: max allowed size index
// preview=0, auto=1, hd=2, full=3
const SIZE_INDEX: Record<string, number> = {
  preview: 0, auto: 1, hd: 2, full: 3,
};
const QUALITY_CEILING: Record<string, number> = {
  free: 2,    // max HD
  basic: 3,   // max Ultra HD (full)
  pro: 3,     // max Ultra HD (full)
};

export async function POST(request: NextRequest) {
  // --- Auth check ---
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 }
    );
  }

  // --- Get user plan and usage ---
  const { used, limit, plan } = await getMonthlyUsage(session.user.id);
  if (used >= limit) {
    // TODO (Task 7): Check credits before returning quota_exceeded
    return NextResponse.json(
      {
        error: `Monthly quota exceeded (${used}/${limit} on ${plan} plan).`,
        code: "quota_exceeded",
        used,
        limit,
      },
      { status: 403 }
    );
  }

  // --- API key check ---
  const apiKey = process.env.PHOTOROOM_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Service is not configured." },
      { status: 500 }
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get("image_file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No image file provided." }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Unsupported file format. Please upload JPG, PNG, or WebP." },
        { status: 400 }
      );
    }

    // Plan-aware file size check
    const maxSize = FILE_SIZE_LIMITS[plan] ?? FILE_SIZE_LIMITS.free;
    if (file.size > maxSize) {
      const limitMB = Math.round(maxSize / (1024 * 1024));
      return NextResponse.json(
        { error: `File size exceeds ${limitMB}MB limit for ${plan} plan.` },
        { status: 400 }
      );
    }

    // Validate and cap quality by plan
    const requestedSize = (formData.get("size") as string) || "auto";
    let size = (ALLOWED_SIZES as readonly string[]).includes(requestedSize)
      ? requestedSize
      : "auto";

    const maxSizeIndex = QUALITY_CEILING[plan] ?? QUALITY_CEILING.free;
    if ((SIZE_INDEX[size] ?? 0) > maxSizeIndex) {
      // Cap to the highest allowed quality for this plan
      const capped = Object.entries(SIZE_INDEX).find(([, v]) => v === maxSizeIndex);
      size = capped ? capped[0] : "hd";
    }

    const arrayBuffer = await file.arrayBuffer();
    const blob = new Blob([arrayBuffer], { type: file.type });

    // Call PhotoRoom API
    const result = await removeBackground(apiKey, blob, file.name || "image.png", size);

    if (!result.ok) {
      console.error("PhotoRoom API error:", result.status, result.message);
      return NextResponse.json({ error: result.message }, { status: 502 });
    }

    // Convert binary response to base64
    const bytes = new Uint8Array(result.imageBuffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);

    // Record usage after successful processing
    await recordUsage(session.user.id, size);

    return NextResponse.json({
      image: `data:image/png;base64,${base64}`,
    });
  } catch (error) {
    console.error("remove-background error:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again later." },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 3: Test locally**

Run: `npm run dev`

Test: Upload an image, verify it processes via PhotoRoom (check server logs for "PhotoRoom" instead of "remove.bg").

- [ ] **Step 4: Commit**

```bash
git add app/api/remove-background/route.ts src/types.ts
git commit -m "feat: migrate from remove.bg to PhotoRoom API"
```

---

## Chunk 2: Billing Core — Credits + Plan Privileges

### Task 4: Billing Database Migration

**Files:**
- Create: `migrations/0004_billing.sql`

- [ ] **Step 1: Write the billing migration**

Create `migrations/0004_billing.sql`:

```sql
-- Billing system: credits balance + transaction history

CREATE TABLE IF NOT EXISTS credits (
  user_id TEXT PRIMARY KEY REFERENCES user(id),
  balance INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user(id),
  type TEXT NOT NULL,
  amount_usd REAL NOT NULL,
  credits_added INTEGER,
  plan TEXT,
  paypal_transaction_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_paypal_id ON transactions(paypal_transaction_id);

-- Add subscription columns to user table (plan column already added in 0003)
ALTER TABLE user ADD COLUMN plan_expires_at INTEGER;
ALTER TABLE user ADD COLUMN paypal_email TEXT;
ALTER TABLE user ADD COLUMN paypal_subscription_id TEXT;
```

- [ ] **Step 2: Apply migration locally**

Run: `npx wrangler d1 execute AUTH_DB --local --file=migrations/0004_billing.sql`

Verify: `npx wrangler d1 execute AUTH_DB --local --command="PRAGMA table_info(credits); PRAGMA table_info(transactions);"`

- [ ] **Step 3: Commit**

```bash
git add migrations/0004_billing.sql
git commit -m "feat: add billing tables — credits, transactions"
```

---

### Task 5: Plan Definitions and Privileges

**Files:**
- Create: `src/lib/plans.ts`

- [ ] **Step 1: Create plan definitions module**

Create `src/lib/plans.ts`:

```typescript
/**
 * Plan definitions, limits, and privilege checks.
 * Source of truth for all plan-related business rules.
 */

export type PlanId = "free" | "basic" | "pro";

export interface PlanConfig {
  id: PlanId;
  label: string;
  priceUsd: number;           // 0 for free
  monthlyQuota: number;
  maxFileSizeBytes: number;
  maxQuality: string;         // highest allowed size value
  maxBatchFiles: number;
  overagePriceUsd: number | null;  // null = not available
}

export const PLANS: Record<PlanId, PlanConfig> = {
  free: {
    id: "free",
    label: "Free",
    priceUsd: 0,
    monthlyQuota: 3,
    maxFileSizeBytes: 5 * 1024 * 1024,
    maxQuality: "hd",
    maxBatchFiles: 1,
    overagePriceUsd: null,
  },
  basic: {
    id: "basic",
    label: "Basic",
    priceUsd: 9.99,
    monthlyQuota: 40,
    maxFileSizeBytes: 25 * 1024 * 1024,
    maxQuality: "full",
    maxBatchFiles: 10,
    overagePriceUsd: 0.12,
  },
  pro: {
    id: "pro",
    label: "Pro",
    priceUsd: 24.99,
    monthlyQuota: 100,
    maxFileSizeBytes: 25 * 1024 * 1024,
    maxQuality: "full",
    maxBatchFiles: 20,
    overagePriceUsd: 0.08,
  },
};

export interface CreditPack {
  id: string;
  label: string;
  credits: number;
  priceUsd: number;
  perImage: string;  // display string
}

export const CREDIT_PACKS: CreditPack[] = [
  { id: "starter", label: "Starter", credits: 10, priceUsd: 2.99, perImage: "$0.30" },
  { id: "popular", label: "Popular", credits: 35, priceUsd: 7.99, perImage: "$0.23" },
  { id: "value", label: "Value", credits: 100, priceUsd: 19.99, perImage: "$0.20" },
];

/**
 * Get effective plan config for a user.
 * "Credit User" is a derived state: Free user with credits > 0 gets upgraded limits.
 */
export function getEffectivePlan(plan: PlanId, creditBalance: number): PlanConfig {
  if (plan === "free" && creditBalance > 0) {
    // Credit User: Free plan but with paid-user file/batch limits
    return {
      ...PLANS.free,
      maxFileSizeBytes: 25 * 1024 * 1024,
      maxBatchFiles: 10,
      // Quality stays at HD — only subscribers get Ultra HD
    };
  }
  return PLANS[plan] ?? PLANS.free;
}

/** Quality hierarchy for ceiling checks */
const QUALITY_ORDER = ["preview", "auto", "hd", "full"];

export function isQualityAllowed(requestedSize: string, plan: PlanConfig): boolean {
  const requestedIndex = QUALITY_ORDER.indexOf(requestedSize);
  const maxIndex = QUALITY_ORDER.indexOf(plan.maxQuality);
  if (requestedIndex === -1 || maxIndex === -1) return true;
  return requestedIndex <= maxIndex;
}

export function capQuality(requestedSize: string, plan: PlanConfig): string {
  if (isQualityAllowed(requestedSize, plan)) return requestedSize;
  return plan.maxQuality;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/plans.ts
git commit -m "feat: add plan definitions and privilege logic"
```

---

### Task 6: Credits Management

**Files:**
- Create: `src/lib/credits.ts`

- [ ] **Step 1: Create credits module**

Create `src/lib/credits.ts`:

```typescript
import { getD1 } from "./db";

/**
 * Get the user's credit balance. Returns 0 if no record exists.
 */
export async function getCreditBalance(userId: string): Promise<number> {
  const db = getD1();
  const row = await db
    .prepare("SELECT balance FROM credits WHERE user_id = ?")
    .bind(userId)
    .first<{ balance: number }>();
  return row?.balance ?? 0;
}

/**
 * Add credits to a user's balance. Creates the row if it doesn't exist.
 */
export async function addCredits(userId: string, amount: number): Promise<number> {
  const db = getD1();
  const now = Math.floor(Date.now() / 1000);

  // Upsert: insert or update
  await db
    .prepare(
      `INSERT INTO credits (user_id, balance, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         balance = balance + ?,
         updated_at = ?`
    )
    .bind(userId, amount, now, amount, now)
    .run();

  return getCreditBalance(userId);
}

/**
 * Deduct 1 credit atomically. Returns true if successful, false if insufficient balance.
 */
export async function deductCredit(userId: string): Promise<boolean> {
  const db = getD1();
  const now = Math.floor(Date.now() / 1000);

  const result = await db
    .prepare(
      `UPDATE credits SET balance = balance - 1, updated_at = ?
       WHERE user_id = ? AND balance > 0`
    )
    .bind(now, userId)
    .run();

  return (result.meta?.changes ?? 0) > 0;
}

/**
 * Record a transaction.
 */
export async function recordTransaction(params: {
  userId: string;
  type: "credit_purchase" | "subscription" | "subscription_renewal" | "overage" | "refund";
  amountUsd: number;
  creditsAdded?: number;
  plan?: string;
  paypalTransactionId?: string;
  status?: "completed" | "pending" | "refunded";
}): Promise<void> {
  const db = getD1();
  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);

  await db
    .prepare(
      `INSERT INTO transactions (id, user_id, type, amount_usd, credits_added, plan, paypal_transaction_id, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      params.userId,
      params.type,
      params.amountUsd,
      params.creditsAdded ?? null,
      params.plan ?? null,
      params.paypalTransactionId ?? null,
      params.status ?? "completed",
      now
    )
    .run();
}

/**
 * Get transaction history for a user, paginated.
 */
export async function getTransactions(
  userId: string,
  limit: number = 10,
  offset: number = 0
): Promise<Array<{
  id: string;
  type: string;
  amount_usd: number;
  credits_added: number | null;
  plan: string | null;
  status: string;
  created_at: number;
}>> {
  const db = getD1();
  const { results } = await db
    .prepare(
      `SELECT id, type, amount_usd, credits_added, plan, status, created_at
       FROM transactions
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`
    )
    .bind(userId, limit, offset)
    .all();
  return results as any[];
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/credits.ts
git commit -m "feat: add credits management — balance, deduct, transactions"
```

---

### Task 7: Update Consumption Logic with Credits

**Files:**
- Modify: `app/api/remove-background/route.ts`
- Modify: `src/lib/usage.ts`

- [ ] **Step 1: Add plan expiry check to usage.ts**

Add to `src/lib/usage.ts` a function to check and lazy-downgrade expired subscriptions:

```typescript
/**
 * Check plan expiry. If expired, downgrade to 'free'. Returns current effective plan.
 */
export async function checkPlanExpiry(userId: string): Promise<string> {
  const db = getD1();
  const row = await db
    .prepare("SELECT plan, plan_expires_at FROM user WHERE id = ?")
    .bind(userId)
    .first<{ plan: string; plan_expires_at: number | null }>();

  if (!row) return "free";

  const plan = row.plan ?? "free";
  if (plan !== "free" && row.plan_expires_at) {
    const now = Math.floor(Date.now() / 1000);
    if (now > row.plan_expires_at) {
      // Lazy downgrade
      await db
        .prepare("UPDATE user SET plan = 'free', plan_expires_at = NULL WHERE id = ?")
        .bind(userId)
        .run();
      return "free";
    }
  }
  return plan;
}
```

- [ ] **Step 2: Update the remove-background route to use credits fallback**

In `app/api/remove-background/route.ts`, replace the quota check block (the `TODO` from Task 3) with the full consumption priority logic:

```typescript
import { checkPlanExpiry, getMonthlyUsage, recordUsage } from "@/lib/usage";
import { getCreditBalance, deductCredit } from "@/lib/credits";
import { getEffectivePlan, capQuality, type PlanId } from "@/lib/plans";

// Inside POST handler, replace the quota check section:

  // --- Plan expiry check (lazy downgrade) ---
  const plan = await checkPlanExpiry(session.user.id) as PlanId;
  const creditBalance = await getCreditBalance(session.user.id);
  const effectivePlan = getEffectivePlan(plan, creditBalance);

  // --- Quota + credits pre-check (DO NOT deduct yet — deduct after API success) ---
  const { used, limit } = await getMonthlyUsage(session.user.id);
  const quotaAvailable = used < limit;

  if (!quotaAvailable && creditBalance <= 0) {
    return NextResponse.json(
      { error: `Monthly quota exceeded (${used}/${limit}).`, code: "quota_exceeded", used, limit },
      { status: 403 }
    );
  }

  // Use effectivePlan for file size and quality checks.
  // IMPORTANT: Remove the inline FILE_SIZE_LIMITS/QUALITY_CEILING constants from Task 3.
  // Instead use: effectivePlan.maxFileSizeBytes, capQuality(size, effectivePlan)

  // ... (file validation, PhotoRoom API call — same as Task 3) ...

  // === AFTER SUCCESSFUL API RESPONSE ONLY ===
  // Deduct credits or record quota usage. Never deduct before the API call.
  if (!quotaAvailable) {
    // Quota exhausted — deduct 1 credit
    const deducted = await deductCredit(session.user.id);
    if (!deducted) {
      // Race condition edge case — image was already processed, log it
      console.warn("Credit deduction failed post-processing, user:", session.user.id);
    }
  }
  await recordUsage(session.user.id, size); // Always record for history
```

- [ ] **Step 3: Test the full flow locally**

Run: `npm run dev`

Test scenarios:
1. Free user with 0 credits — should get 3 images, then `quota_exceeded`
2. Verify quality capping — free user requesting `full` gets capped to `hd`
3. Verify file size limit — free user uploading >5MB gets rejected

- [ ] **Step 4: Commit**

```bash
git add src/lib/usage.ts app/api/remove-background/route.ts
git commit -m "feat: consumption priority — quota then credits, plan-aware limits"
```

---

## Chunk 3: PayPal Integration

### Task 8: PayPal API Client

**Files:**
- Create: `src/lib/paypal.ts`
- Modify: `src/env.d.ts`

- [ ] **Step 1: Add PayPal env types**

In `src/env.d.ts`:

```typescript
interface CloudflareEnv {
  AUTH_DB: D1Database;
  PHOTOROOM_API_KEY: string;
  REMOVE_BG_API_KEY?: string;
  PAYPAL_CLIENT_ID: string;
  PAYPAL_CLIENT_SECRET: string;
  PAYPAL_WEBHOOK_ID: string;
  PAYPAL_PLAN_ID_BASIC: string;
  PAYPAL_PLAN_ID_PRO: string;
}
```

- [ ] **Step 2: Create PayPal client**

Create `src/lib/paypal.ts`:

```typescript
/**
 * PayPal REST API client for orders, subscriptions, and webhook verification.
 * Docs: https://developer.paypal.com/docs/api/
 */

// Note: Do NOT use process.env at module top level in Cloudflare Workers.
// Access it inside functions only.
function getPayPalBase(): string {
  return process.env.NODE_ENV === "production"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
}

/**
 * Get an access token using client credentials.
 */
async function getAccessToken(): Promise<string> {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("PayPal credentials not configured");

  const auth = btoa(`${clientId}:${clientSecret}`);
  const res = await fetch(`${getPayPalBase()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) throw new Error(`PayPal auth failed: ${res.status}`);
  const data = await res.json() as { access_token: string };
  return data.access_token;
}

/**
 * Create a PayPal order (one-time payment for credit packs).
 */
export async function createOrder(amountUsd: string, description: string): Promise<{
  id: string;
  approveUrl: string;
}> {
  const token = await getAccessToken();
  const res = await fetch(`${getPayPalBase()}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [{
        amount: { currency_code: "USD", value: amountUsd },
        description,
      }],
      application_context: {
        return_url: `${process.env.AUTH_URL || ""}/api/checkout/capture`,
        cancel_url: `${process.env.AUTH_URL || ""}/account?tab=plans`,
        user_action: "PAY_NOW",
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`PayPal create order failed: ${err}`);
  }

  const data = await res.json() as { id: string; links: Array<{ rel: string; href: string }> };
  const approveUrl = data.links.find((l) => l.rel === "approve")?.href;
  if (!approveUrl) throw new Error("No approve URL in PayPal response");
  return { id: data.id, approveUrl };
}

/**
 * Capture a PayPal order after user approval.
 */
export async function captureOrder(orderId: string): Promise<{
  transactionId: string;
  status: string;
  payerEmail: string;
}> {
  const token = await getAccessToken();
  const res = await fetch(`${getPayPalBase()}/v2/checkout/orders/${orderId}/capture`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`PayPal capture failed: ${err}`);
  }

  const data = await res.json() as any;
  const capture = data.purchase_units?.[0]?.payments?.captures?.[0];
  return {
    transactionId: capture?.id ?? orderId,
    status: data.status,
    payerEmail: data.payer?.email_address ?? "",
  };
}

/**
 * Create a PayPal subscription for a plan.
 */
export async function createSubscription(planId: string, returnUrl: string, cancelUrl: string): Promise<{
  subscriptionId: string;
  approveUrl: string;
}> {
  const token = await getAccessToken();
  const res = await fetch(`${getPayPalBase()}/v1/billing/subscriptions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      plan_id: planId,  // PayPal plan ID (created in PayPal dashboard)
      application_context: {
        return_url: returnUrl,
        cancel_url: cancelUrl,
        user_action: "SUBSCRIBE_NOW",
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`PayPal create subscription failed: ${err}`);
  }

  const data = await res.json() as { id: string; links: Array<{ rel: string; href: string }> };
  const approveUrl = data.links.find((l) => l.rel === "approve")?.href;
  if (!approveUrl) throw new Error("No approve URL in PayPal response");
  return { subscriptionId: data.id, approveUrl };
}

/**
 * Cancel a PayPal subscription.
 */
export async function cancelSubscription(subscriptionId: string, reason: string): Promise<void> {
  const token = await getAccessToken();
  const res = await fetch(`${getPayPalBase()}/v1/billing/subscriptions/${subscriptionId}/cancel`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ reason }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`PayPal cancel subscription failed: ${err}`);
  }
}

/**
 * Verify a PayPal webhook signature.
 * Returns true if the webhook is authentic.
 */
export async function verifyWebhookSignature(
  headers: Record<string, string>,
  body: string
): Promise<boolean> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) throw new Error("PAYPAL_WEBHOOK_ID not configured");

  const token = await getAccessToken();
  const res = await fetch(`${getPayPalBase()}/v1/notifications/verify-webhook-signature`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      auth_algo: headers["paypal-auth-algo"],
      cert_url: headers["paypal-cert-url"],
      transmission_id: headers["paypal-transmission-id"],
      transmission_sig: headers["paypal-transmission-sig"],
      transmission_time: headers["paypal-transmission-time"],
      webhook_id: webhookId,
      webhook_event: JSON.parse(body),
    }),
  });

  if (!res.ok) return false;
  const data = await res.json() as { verification_status: string };
  return data.verification_status === "SUCCESS";
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/paypal.ts src/env.d.ts
git commit -m "feat: add PayPal REST API client — orders, subscriptions, webhooks"
```

---

### Task 9: Credit Purchase API Routes

**Files:**
- Create: `app/api/checkout/credits/route.ts`
- Create: `app/api/checkout/capture/route.ts`

- [ ] **Step 1: Create credit purchase endpoint**

Create `app/api/checkout/credits/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "../../../../auth";
import { createOrder } from "@/lib/paypal";
import { CREDIT_PACKS } from "@/lib/plans";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { packId } = await request.json();
  const pack = CREDIT_PACKS.find((p) => p.id === packId);
  if (!pack) {
    return NextResponse.json({ error: "Invalid credit pack" }, { status: 400 });
  }

  try {
    const { id, approveUrl } = await createOrder(
      pack.priceUsd.toFixed(2),
      `${pack.credits} credits — ${pack.label} Pack`
    );

    // Store order context in a cookie for capture callback
    const orderMeta = JSON.stringify({
      orderId: id,
      packId: pack.id,
      credits: pack.credits,
      userId: session.user.id,
    });

    const response = NextResponse.json({ approveUrl });
    response.cookies.set("paypal_order", orderMeta, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 3600, // 1 hour
      path: "/",
    });
    return response;
  } catch (error) {
    console.error("PayPal create order error:", error);
    return NextResponse.json({ error: "Payment initialization failed" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create capture callback endpoint**

Create `app/api/checkout/capture/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "../../../../auth";
import { captureOrder } from "@/lib/paypal";
import { addCredits, recordTransaction } from "@/lib/credits";
import { CREDIT_PACKS } from "@/lib/plans";
import { getD1 } from "@/lib/db";

export async function GET(request: NextRequest) {
  // Verify authenticated session — prevent cookie tampering
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/?error=auth_required", request.url));
  }

  const token = request.nextUrl.searchParams.get("token"); // PayPal order ID
  const orderCookie = request.cookies.get("paypal_order")?.value;

  if (!token || !orderCookie) {
    return NextResponse.redirect(new URL("/account?error=missing_order", request.url));
  }

  let orderMeta: { orderId: string; packId: string; credits: number; userId: string };
  try {
    orderMeta = JSON.parse(orderCookie);
  } catch {
    return NextResponse.redirect(new URL("/account?error=invalid_order", request.url));
  }

  // Security: verify the cookie's userId matches the authenticated session
  if (orderMeta.orderId !== token || orderMeta.userId !== session.user.id) {
    return NextResponse.redirect(new URL("/account?error=order_mismatch", request.url));
  }

  try {
    const result = await captureOrder(token);
    const pack = CREDIT_PACKS.find((p) => p.id === orderMeta.packId);

    if (result.status === "COMPLETED") {
      // Add credits
      await addCredits(orderMeta.userId, orderMeta.credits);

      // Record transaction with actual amount
      await recordTransaction({
        userId: orderMeta.userId,
        type: "credit_purchase",
        amountUsd: pack?.priceUsd ?? 0,
        creditsAdded: orderMeta.credits,
        paypalTransactionId: result.transactionId,
        status: "completed",
      });

      // Update PayPal email
      if (result.payerEmail) {
        const db = getD1();
        await db
          .prepare("UPDATE user SET paypal_email = ? WHERE id = ?")
          .bind(result.payerEmail, orderMeta.userId)
          .run();
      }
    }

    // Clear cookie and redirect to account
    const response = NextResponse.redirect(new URL("/account?tab=plans&success=credits", request.url));
    response.cookies.delete("paypal_order");
    return response;
  } catch (error) {
    console.error("PayPal capture error:", error);
    return NextResponse.redirect(new URL("/account?error=capture_failed", request.url));
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add app/api/checkout/credits/route.ts app/api/checkout/capture/route.ts
git commit -m "feat: credit purchase flow — PayPal order + capture"
```

---

### Task 10: Subscription API Routes

**Files:**
- Create: `app/api/checkout/subscribe/route.ts`
- Create: `app/api/account/cancel/route.ts`

- [ ] **Step 1: Create subscription endpoint**

Create `app/api/checkout/subscribe/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "../../../../auth";
import { createSubscription } from "@/lib/paypal";

// PayPal plan IDs — created in PayPal dashboard.
// These must be configured as env vars or constants after PayPal setup.
const PAYPAL_PLAN_IDS: Record<string, string> = {
  basic: process.env.PAYPAL_PLAN_ID_BASIC || "",
  pro: process.env.PAYPAL_PLAN_ID_PRO || "",
};

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { plan } = await request.json();
  const paypalPlanId = PAYPAL_PLAN_IDS[plan];
  if (!paypalPlanId) {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }

  try {
    const baseUrl = process.env.AUTH_URL || request.nextUrl.origin;
    const { subscriptionId, approveUrl } = await createSubscription(
      paypalPlanId,
      `${baseUrl}/account?tab=plans&success=subscription`,
      `${baseUrl}/account?tab=plans`
    );

    // Store subscriptionId on user row BEFORE redirect — webhook handler needs this to find the user
    const db = (await import("@/lib/db")).getD1();
    await db
      .prepare("UPDATE user SET paypal_subscription_id = ? WHERE id = ?")
      .bind(subscriptionId, session.user.id)
      .run();

    return NextResponse.json({ approveUrl, subscriptionId });
  } catch (error) {
    console.error("PayPal subscription error:", error);
    return NextResponse.json({ error: "Subscription initialization failed" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create cancel subscription endpoint**

Create `app/api/account/cancel/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "../../../../auth";
import { cancelSubscription } from "@/lib/paypal";
import { getD1 } from "@/lib/db";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getD1();
  const user = await db
    .prepare("SELECT plan, paypal_subscription_id, plan_expires_at FROM user WHERE id = ?")
    .bind(session.user.id)
    .first<{ plan: string; paypal_subscription_id: string | null; plan_expires_at: number | null }>();

  if (!user || user.plan === "free") {
    return NextResponse.json({ error: "No active subscription" }, { status: 400 });
  }

  if (!user.paypal_subscription_id) {
    return NextResponse.json({ error: "No PayPal subscription found" }, { status: 400 });
  }

  try {
    await cancelSubscription(user.paypal_subscription_id, "User requested cancellation");

    // Do NOT downgrade immediately — keep access until plan_expires_at
    // The PayPal subscription will not renew, and lazy expiry check handles downgrade

    return NextResponse.json({
      message: "Subscription cancelled. Access continues until end of billing period.",
      expiresAt: user.plan_expires_at,
    });
  } catch (error) {
    console.error("Cancel subscription error:", error);
    return NextResponse.json({ error: "Failed to cancel subscription" }, { status: 500 });
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add app/api/checkout/subscribe/route.ts app/api/account/cancel/route.ts
git commit -m "feat: subscription flow — create + cancel via PayPal"
```

---

### Task 11: PayPal Webhook Handler

**Files:**
- Create: `app/api/webhooks/paypal/route.ts`
- Modify: `middleware.ts`

- [ ] **Step 1: Exclude webhook route from auth middleware**

In `middleware.ts`, add webhook exemption:

```typescript
// Add after the auth route check:
if (pathname.startsWith("/api/webhooks")) {
  return NextResponse.next();
}
```

- [ ] **Step 2: Create webhook handler**

Create `app/api/webhooks/paypal/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/paypal";
import { addCredits, recordTransaction } from "@/lib/credits";
import { getD1 } from "@/lib/db";

export async function POST(request: NextRequest) {
  const body = await request.text();
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => { headers[key] = value; });

  // Verify webhook signature
  const isValid = await verifyWebhookSignature(headers, body);
  if (!isValid) {
    console.error("PayPal webhook signature verification failed");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const event = JSON.parse(body);
  const eventType = event.event_type as string;

  try {
    switch (eventType) {
      case "BILLING.SUBSCRIPTION.ACTIVATED": {
        await handleSubscriptionActivated(event);
        break;
      }
      case "PAYMENT.SALE.COMPLETED": {
        await handlePaymentCompleted(event);
        break;
      }
      case "BILLING.SUBSCRIPTION.CANCELLED":
      case "BILLING.SUBSCRIPTION.EXPIRED": {
        await handleSubscriptionEnded(event);
        break;
      }
      default:
        console.log("Unhandled PayPal webhook event:", eventType);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Webhook handler error:", error);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}

async function handleSubscriptionActivated(event: any) {
  const subscriptionId = event.resource?.id;
  const planId = event.resource?.plan_id;
  // Map PayPal plan ID back to our plan name
  const plan = getOurPlanFromPayPalId(planId);
  const payerEmail = event.resource?.subscriber?.email_address;

  if (!subscriptionId || !plan) return;

  // Find user by PayPal subscription ID or email
  const db = getD1();
  // The subscription ID was stored when the user initiated checkout
  const user = await db
    .prepare("SELECT id FROM user WHERE paypal_subscription_id = ? OR paypal_email = ?")
    .bind(subscriptionId, payerEmail)
    .first<{ id: string }>();

  if (!user) {
    console.error("No user found for subscription:", subscriptionId);
    return;
  }

  const expiresAt = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60; // +30 days

  await db
    .prepare(
      `UPDATE user SET plan = ?, plan_expires_at = ?, paypal_subscription_id = ?, paypal_email = ?
       WHERE id = ?`
    )
    .bind(plan, expiresAt, subscriptionId, payerEmail, user.id)
    .run();

  await recordTransaction({
    userId: user.id,
    type: "subscription",
    amountUsd: plan === "basic" ? 9.99 : 24.99,
    plan,
    paypalTransactionId: subscriptionId,
    status: "completed",
  });
}

async function handlePaymentCompleted(event: any) {
  const billingAgreementId = event.resource?.billing_agreement_id;
  if (!billingAgreementId) return; // Not a subscription payment

  // Idempotency check
  const saleId = event.resource?.id;
  const db = getD1();

  const existing = await db
    .prepare("SELECT id FROM transactions WHERE paypal_transaction_id = ?")
    .bind(saleId)
    .first();
  if (existing) return; // Already processed

  const user = await db
    .prepare("SELECT id, plan FROM user WHERE paypal_subscription_id = ?")
    .bind(billingAgreementId)
    .first<{ id: string; plan: string }>();

  if (!user) return;

  // Extend plan by 30 days
  const expiresAt = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
  await db
    .prepare("UPDATE user SET plan_expires_at = ? WHERE id = ?")
    .bind(expiresAt, user.id)
    .run();

  const amount = parseFloat(event.resource?.amount?.total ?? "0");
  await recordTransaction({
    userId: user.id,
    type: "subscription_renewal",
    amountUsd: amount,
    plan: user.plan,
    paypalTransactionId: saleId,
    status: "completed",
  });
}

async function handleSubscriptionEnded(event: any) {
  const subscriptionId = event.resource?.id;
  if (!subscriptionId) return;

  const db = getD1();
  // Don't downgrade immediately — lazy expiry check will handle it
  // Just log that the subscription is cancelled
  console.log("Subscription ended:", subscriptionId);
}

function getOurPlanFromPayPalId(paypalPlanId: string): string | null {
  // Reverse lookup from PayPal plan ID to our plan name
  // These IDs come from env vars set after PayPal dashboard setup
  const basic = process.env.PAYPAL_PLAN_ID_BASIC;
  const pro = process.env.PAYPAL_PLAN_ID_PRO;
  if (paypalPlanId === basic) return "basic";
  if (paypalPlanId === pro) return "pro";
  return null;
}
```

- [ ] **Step 3: Commit**

```bash
git add app/api/webhooks/paypal/route.ts middleware.ts
git commit -m "feat: PayPal webhook handler — subscription lifecycle + idempotency"
```

---

## Chunk 4: Account API + User Center UI

### Task 12: Account API

**Files:**
- Create: `app/api/account/route.ts`

- [ ] **Step 1: Create account info endpoint**

Create `app/api/account/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "../../../auth";
import { checkPlanExpiry, getMonthlyUsage } from "@/lib/usage";
import { getCreditBalance, getTransactions } from "@/lib/credits";
import { getEffectivePlan, PLANS, CREDIT_PACKS, type PlanId } from "@/lib/plans";
import { getD1 } from "@/lib/db";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  // Support pagination for transaction history
  const txLimit = parseInt(request.nextUrl.searchParams.get("transactions_limit") || "5");
  const txOffset = parseInt(request.nextUrl.searchParams.get("transactions_offset") || "0");

  const plan = await checkPlanExpiry(userId) as PlanId;
  const creditBalance = await getCreditBalance(userId);
  const effectivePlan = getEffectivePlan(plan, creditBalance);
  const { used, limit } = await getMonthlyUsage(userId);
  const recentTransactions = await getTransactions(userId, txLimit, txOffset);

  // Get user details
  const db = getD1();
  const user = await db
    .prepare("SELECT plan_expires_at, paypal_email, paypal_subscription_id FROM user WHERE id = ?")
    .bind(userId)
    .first<{ plan_expires_at: number | null; paypal_email: string | null; paypal_subscription_id: string | null }>();

  return NextResponse.json({
    plan: plan,
    planConfig: PLANS[plan],
    effectivePlan,
    credits: creditBalance,
    usage: { used, limit },
    subscription: {
      active: plan !== "free",
      expiresAt: user?.plan_expires_at ?? null,
      paypalEmail: user?.paypal_email ?? null,
      canCancel: !!user?.paypal_subscription_id,
    },
    recentTransactions,
    plans: PLANS,
    creditPacks: CREDIT_PACKS,
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/account/route.ts
git commit -m "feat: account API — plan, credits, usage, transactions"
```

---

### Task 13: Account Page Layout

**Files:**
- Create: `app/account/page.tsx`

- [ ] **Step 1: Create the account page with tab navigation**

Create `app/account/page.tsx`:

```tsx
"use client";

import { useSession } from "next-auth/react";
import { useSearchParams, useRouter } from "next/navigation";
import { useState, useEffect, useCallback, Suspense } from "react";
import { OverviewTab } from "@/components/account/OverviewTab";
import { PlansTab } from "@/components/account/PlansTab";
import { BillingTab } from "@/components/account/BillingTab";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

type TabId = "overview" | "plans" | "billing";

const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "plans", label: "Plans & Credits" },
  { id: "billing", label: "Billing" },
];

function AccountContent() {
  const { data: session, status } = useSession();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabId>(
    (searchParams.get("tab") as TabId) || "overview"
  );
  const [accountData, setAccountData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchAccount = useCallback(async () => {
    try {
      const res = await fetch("/api/account");
      if (res.ok) {
        setAccountData(await res.json());
      }
    } catch (err) {
      console.error("Failed to fetch account:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "authenticated") fetchAccount();
  }, [status, fetchAccount]);

  if (status === "loading" || loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500" />
      </div>
    );
  }

  if (!session) {
    router.push("/");
    return null;
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Tab navigation */}
      <div className="flex gap-1 mb-8 border-b border-gray-200">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors relative ${
              activeTab === tab.id
                ? "text-indigo-600 after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-indigo-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {accountData && (
        <>
          {activeTab === "overview" && (
            <OverviewTab session={session} data={accountData} />
          )}
          {activeTab === "plans" && (
            <PlansTab data={accountData} onRefresh={fetchAccount} />
          )}
          {activeTab === "billing" && (
            <BillingTab data={accountData} onRefresh={fetchAccount} />
          )}
        </>
      )}
    </div>
  );
}

export default function AccountPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header />
      <main className="flex-1">
        <Suspense fallback={
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500" />
          </div>
        }>
          <AccountContent />
        </Suspense>
      </main>
      <Footer />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/account/page.tsx
git commit -m "feat: account page layout with tab navigation"
```

---

### Task 14: Overview Tab

**Files:**
- Create: `src/components/account/OverviewTab.tsx`

- [ ] **Step 1: Create OverviewTab component**

Create `src/components/account/OverviewTab.tsx`:

```tsx
"use client";

import type { Session } from "next-auth";

interface OverviewTabProps {
  session: Session;
  data: any;
}

const PLAN_COLORS: Record<string, string> = {
  free: "bg-gray-100 text-gray-700",
  basic: "bg-blue-100 text-blue-700",
  pro: "bg-purple-100 text-purple-700",
};

export function OverviewTab({ session, data }: OverviewTabProps) {
  const { plan, credits, usage } = data;
  const usagePercent = Math.min((usage.used / usage.limit) * 100, 100);
  const barColor =
    usagePercent >= 100 ? "bg-red-500" : usagePercent >= 80 ? "bg-orange-500" : "bg-indigo-500";

  return (
    <div className="space-y-6">
      {/* Profile card */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 flex items-center gap-4">
        {session.user?.image && (
          <img
            src={session.user.image}
            alt=""
            className="w-14 h-14 rounded-full"
          />
        )}
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-gray-900">{session.user?.name}</h2>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${PLAN_COLORS[plan] ?? PLAN_COLORS.free}`}>
              {plan} Plan
            </span>
          </div>
          <p className="text-sm text-gray-500">{session.user?.email}</p>
        </div>
      </div>

      {/* Usage + Credits */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h3 className="text-sm font-medium text-gray-500 mb-3">This Month Usage</h3>
          <div className="flex justify-between text-sm mb-2">
            <span className="font-semibold text-gray-900">{usage.used} / {usage.limit}</span>
            <span className="text-gray-500">images</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2">
            <div className={`${barColor} h-2 rounded-full transition-all`} style={{ width: `${usagePercent}%` }} />
          </div>
        </div>
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h3 className="text-sm font-medium text-gray-500 mb-3">Credits Balance</h3>
          <p className="text-3xl font-bold text-gray-900">{credits}</p>
          <p className="text-sm text-gray-500 mt-1">credits (never expire)</p>
        </div>
      </div>

      {/* Quick actions */}
      <div className="flex gap-3">
        <a href="/account?tab=plans" className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors">
          Buy Credits
        </a>
        {plan === "free" && (
          <a href="/account?tab=plans" className="px-4 py-2 border border-indigo-600 text-indigo-600 text-sm font-medium rounded-lg hover:bg-indigo-50 transition-colors">
            Upgrade Plan
          </a>
        )}
      </div>

      {/* Recent activity */}
      {data.recentTransactions.length > 0 && (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h3 className="text-sm font-medium text-gray-500 mb-4">Recent Activity</h3>
          <div className="space-y-3">
            {data.recentTransactions.map((tx: any) => (
              <div key={tx.id} className="flex justify-between items-center text-sm">
                <div>
                  <span className="text-gray-900 capitalize">{tx.type.replace(/_/g, " ")}</span>
                  {tx.credits_added && <span className="text-gray-500 ml-2">+{tx.credits_added} credits</span>}
                </div>
                <div className="text-right">
                  <span className="text-gray-900">${tx.amount_usd.toFixed(2)}</span>
                  <span className="text-gray-400 text-xs ml-2">
                    {new Date(tx.created_at * 1000).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/account/OverviewTab.tsx
git commit -m "feat: account Overview tab — profile, usage, credits, activity"
```

---

### Task 15: Plans & Credits Tab

**Files:**
- Create: `src/components/account/PlansTab.tsx`
- Create: `src/components/account/PlanCard.tsx`
- Create: `src/components/account/CreditPackCard.tsx`

- [ ] **Step 1: Create PlanCard**

Create `src/components/account/PlanCard.tsx`:

```tsx
"use client";

interface PlanCardProps {
  plan: any;
  isCurrent: boolean;
  onSelect: (planId: string) => void;
  loading: boolean;
}

export function PlanCard({ plan, isCurrent, onSelect, loading }: PlanCardProps) {
  const features = [
    `${plan.monthlyQuota} images/month`,
    `Up to ${plan.maxQuality === "full" ? "Ultra HD (36MP)" : "HD (4MP)"}`,
    `Max ${Math.round(plan.maxFileSizeBytes / (1024 * 1024))}MB upload`,
    plan.maxBatchFiles > 1 ? `Batch up to ${plan.maxBatchFiles}` : "Single image",
  ];

  return (
    <div className={`rounded-xl border-2 p-6 flex flex-col ${
      isCurrent ? "border-indigo-500 bg-indigo-50/50" : "border-gray-200 bg-white"
    }`}>
      <h3 className="text-lg font-semibold text-gray-900 capitalize">{plan.label}</h3>
      <div className="mt-2 mb-4">
        <span className="text-3xl font-bold text-gray-900">
          {plan.priceUsd === 0 ? "Free" : `$${plan.priceUsd}`}
        </span>
        {plan.priceUsd > 0 && <span className="text-gray-500 text-sm">/month</span>}
      </div>
      <ul className="space-y-2 flex-1">
        {features.map((f, i) => (
          <li key={i} className="flex items-center gap-2 text-sm text-gray-600">
            <svg className="w-4 h-4 text-indigo-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
            </svg>
            {f}
          </li>
        ))}
      </ul>
      <button
        onClick={() => onSelect(plan.id)}
        disabled={isCurrent || loading}
        className={`mt-6 w-full py-2.5 rounded-lg text-sm font-medium transition-colors ${
          isCurrent
            ? "bg-gray-100 text-gray-500 cursor-default"
            : "bg-indigo-600 text-white hover:bg-indigo-700"
        }`}
      >
        {isCurrent ? "Current Plan" : plan.priceUsd === 0 ? "Downgrade" : "Upgrade"}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Create CreditPackCard**

Create `src/components/account/CreditPackCard.tsx`:

```tsx
"use client";

interface CreditPackCardProps {
  pack: { id: string; label: string; credits: number; priceUsd: number; perImage: string };
  onBuy: (packId: string) => void;
  loading: boolean;
}

export function CreditPackCard({ pack, onBuy, loading }: CreditPackCardProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 flex flex-col">
      <h4 className="font-semibold text-gray-900">{pack.label}</h4>
      <div className="mt-2">
        <span className="text-2xl font-bold text-gray-900">${pack.priceUsd}</span>
      </div>
      <p className="text-sm text-gray-500 mt-1">
        {pack.credits} credits · {pack.perImage}/image
      </p>
      <button
        onClick={() => onBuy(pack.id)}
        disabled={loading}
        className="mt-4 w-full py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-50"
      >
        {loading ? "Processing..." : "Buy"}
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Create PlansTab**

Create `src/components/account/PlansTab.tsx`:

```tsx
"use client";

import { useState } from "react";
import { PlanCard } from "./PlanCard";
import { CreditPackCard } from "./CreditPackCard";

interface PlansTabProps {
  data: any;
  onRefresh: () => void;
}

export function PlansTab({ data, onRefresh }: PlansTabProps) {
  const [loading, setLoading] = useState(false);

  const handleSelectPlan = async (planId: string) => {
    if (planId === "free") return; // Can't subscribe to free
    setLoading(true);
    try {
      const res = await fetch("/api/checkout/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: planId }),
      });
      const { approveUrl } = await res.json();
      if (approveUrl) window.location.href = approveUrl;
    } catch (err) {
      console.error("Subscribe error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleBuyCredits = async (packId: string) => {
    setLoading(true);
    try {
      const res = await fetch("/api/checkout/credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packId }),
      });
      const { approveUrl } = await res.json();
      if (approveUrl) window.location.href = approveUrl;
    } catch (err) {
      console.error("Buy credits error:", err);
    } finally {
      setLoading(false);
    }
  };

  const planEntries = Object.values(data.plans);

  return (
    <div className="space-y-10">
      {/* Plans */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Choose a Plan</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {planEntries.map((plan: any) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              isCurrent={plan.id === data.plan}
              onSelect={handleSelectPlan}
              loading={loading}
            />
          ))}
        </div>
      </section>

      {/* Credit Packs */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Buy Credits</h2>
        <p className="text-sm text-gray-500 mb-4">Credits never expire. Use them anytime.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {data.creditPacks.map((pack: any) => (
            <CreditPackCard key={pack.id} pack={pack} onBuy={handleBuyCredits} loading={loading} />
          ))}
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/account/PlansTab.tsx src/components/account/PlanCard.tsx src/components/account/CreditPackCard.tsx
git commit -m "feat: Plans & Credits tab — plan cards + credit packs"
```

---

### Task 16: Billing Tab

**Files:**
- Create: `src/components/account/BillingTab.tsx`
- Create: `src/components/account/TransactionHistory.tsx`

- [ ] **Step 1: Create TransactionHistory**

Create `src/components/account/TransactionHistory.tsx`:

```tsx
"use client";

import { useState } from "react";

interface TransactionHistoryProps {
  userId: string;
  initialTransactions: any[];
}

export function TransactionHistory({ userId, initialTransactions }: TransactionHistoryProps) {
  const [transactions, setTransactions] = useState(initialTransactions);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(initialTransactions.length >= 5);

  const loadMore = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/account?transactions_offset=${transactions.length}&transactions_limit=10`);
      if (res.ok) {
        const data = await res.json();
        const newTxns = data.recentTransactions || [];
        setTransactions((prev) => [...prev, ...newTxns]);
        if (newTxns.length < 10) setHasMore(false);
      }
    } catch (err) {
      console.error("Load more error:", err);
    } finally {
      setLoading(false);
    }
  };

  const TYPE_LABELS: Record<string, string> = {
    credit_purchase: "Credit Pack",
    subscription: "Subscription",
    subscription_renewal: "Renewal",
    overage: "Overage",
    refund: "Refund",
  };

  if (transactions.length === 0) {
    return <p className="text-sm text-gray-500">No transactions yet.</p>;
  }

  return (
    <div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-gray-500 border-b">
            <th className="pb-2 font-medium">Date</th>
            <th className="pb-2 font-medium">Description</th>
            <th className="pb-2 font-medium text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((tx: any) => (
            <tr key={tx.id} className="border-b border-gray-50">
              <td className="py-3 text-gray-600">
                {new Date(tx.created_at * 1000).toLocaleDateString()}
              </td>
              <td className="py-3 text-gray-900">
                {TYPE_LABELS[tx.type] || tx.type}
                {tx.credits_added ? ` (${tx.credits_added} credits)` : ""}
                {tx.plan ? ` — ${tx.plan}` : ""}
              </td>
              <td className="py-3 text-right text-gray-900">
                {tx.type === "refund" ? "-" : ""}${tx.amount_usd.toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {hasMore && (
        <button
          onClick={loadMore}
          disabled={loading}
          className="mt-4 text-sm text-indigo-600 hover:text-indigo-700 font-medium"
        >
          {loading ? "Loading..." : "Load More"}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create BillingTab**

Create `src/components/account/BillingTab.tsx`:

```tsx
"use client";

import { useState } from "react";
import { TransactionHistory } from "./TransactionHistory";

interface BillingTabProps {
  data: any;
  onRefresh: () => void;
}

export function BillingTab({ data, onRefresh }: BillingTabProps) {
  const [cancelling, setCancelling] = useState(false);
  const { subscription } = data;

  const handleCancel = async () => {
    if (!confirm("Cancel your subscription? You'll keep access until the end of your billing period.")) return;
    setCancelling(true);
    try {
      const res = await fetch("/api/account/cancel", { method: "POST" });
      if (res.ok) {
        onRefresh();
      } else {
        const err = await res.json();
        alert(err.error || "Failed to cancel");
      }
    } catch (err) {
      console.error("Cancel error:", err);
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Payment Method */}
      {subscription.paypalEmail && (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h3 className="text-sm font-medium text-gray-500 mb-3">Payment Method</h3>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
                <span className="text-blue-600 font-bold text-xs">PP</span>
              </div>
              <span className="text-sm text-gray-900">
                PayPal · {subscription.paypalEmail.replace(/(.{2})(.*)(@.*)/, "$1***$3")}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Current Subscription */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
        <h3 className="text-sm font-medium text-gray-500 mb-3">Current Subscription</h3>
        {subscription.active ? (
          <div>
            <p className="text-gray-900 font-medium capitalize">{data.plan} Plan — ${data.planConfig.priceUsd}/month</p>
            {subscription.expiresAt && (
              <p className="text-sm text-gray-500 mt-1">
                Next billing: {new Date(subscription.expiresAt * 1000).toLocaleDateString()}
              </p>
            )}
            {subscription.canCancel && (
              <button
                onClick={handleCancel}
                disabled={cancelling}
                className="mt-3 text-sm text-red-600 hover:text-red-700 font-medium"
              >
                {cancelling ? "Cancelling..." : "Cancel Subscription"}
              </button>
            )}
          </div>
        ) : (
          <div>
            <p className="text-gray-900">Free Plan</p>
            <a href="/account?tab=plans" className="text-sm text-indigo-600 hover:text-indigo-700 font-medium mt-1 inline-block">
              Upgrade Plan →
            </a>
          </div>
        )}
      </div>

      {/* Transaction History */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
        <h3 className="text-sm font-medium text-gray-500 mb-4">Transaction History</h3>
        <TransactionHistory userId="" initialTransactions={data.recentTransactions} />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/account/BillingTab.tsx src/components/account/TransactionHistory.tsx
git commit -m "feat: Billing tab — payment method, subscription, transactions"
```

---

### Task 17: Update UserMenu + UsageBanner

**Files:**
- Modify: `src/components/UserMenu.tsx`
- Modify: `src/components/UsageBanner.tsx`

- [ ] **Step 1: Update UserMenu to show credits and link to account**

In `src/components/UserMenu.tsx`, add to the dropdown:
- Credits balance display
- "Account Settings" link → `/account`

Key additions inside the dropdown:

```tsx
{/* After the usage bar section, add: */}
<div className="px-4 py-2 border-t border-gray-100">
  <span className="text-sm text-gray-600">🎫 {usage?.credits ?? 0} Credits</span>
</div>
<a
  href="/account"
  className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
>
  Account Settings
</a>
```

Also update the fetch URL to use `/api/account` instead of `/api/usage` to get credits too.

- [ ] **Step 2: Update UsageBanner with upgrade link**

In `src/components/UsageBanner.tsx`, add an upgrade link:

```tsx
<a href="/account?tab=plans" className="text-indigo-700 underline font-medium ml-2">
  Upgrade
</a>
```

- [ ] **Step 3: Commit**

```bash
git add src/components/UserMenu.tsx src/components/UsageBanner.tsx
git commit -m "feat: UserMenu shows credits + account link, UsageBanner has upgrade link"
```

---

## Chunk 5: FAQ Redesign + Finalization

### Task 18: Categorized FAQ

**Files:**
- Modify: `src/components/FAQ.tsx`

- [ ] **Step 1: Rewrite FAQ with categorized tabs**

Replace `src/components/FAQ.tsx` with a 4-tab categorized accordion. Tab categories: Pricing (default), Usage, Account, Technical. Content from spec section 5.2.

The component should:
- Show horizontal tab buttons at top (Pricing / Usage / Account / Technical)
- Filter FAQ items by selected category
- Keep the existing accordion expand/collapse pattern
- Default to "Pricing" tab

- [ ] **Step 2: Test the FAQ visually**

Run: `npm run dev`, navigate to homepage, verify FAQ shows 4 tabs with correct content.

- [ ] **Step 3: Commit**

```bash
git add src/components/FAQ.tsx
git commit -m "feat: categorized FAQ with billing content — 4 tabs, 17 Q&As"
```

---

### Task 19: Update UploadZone for Plan-Aware Limits

**Files:**
- Modify: `src/components/UploadZone.tsx`
- Modify: `src/types.ts`

- [ ] **Step 1: Make MAX_FILES and MAX_FILE_SIZE dynamic**

In `src/types.ts`, keep the constants as defaults but add plan-aware exports:

```typescript
// Default limits (Free plan) — used as fallback on client
export const DEFAULT_MAX_FILES = 1;
export const DEFAULT_MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
```

- [ ] **Step 2: Update UploadZone to accept dynamic limits**

In `src/components/UploadZone.tsx`, accept `maxFiles` and `maxFileSize` as props instead of using constants. The parent page (`app/page.tsx`) fetches user plan info and passes the appropriate limits.

- [ ] **Step 3: Commit**

```bash
git add src/types.ts src/components/UploadZone.tsx app/page.tsx
git commit -m "feat: plan-aware upload limits — dynamic MAX_FILES and MAX_FILE_SIZE"
```

---

### Task 20: Update Project CLAUDE.md

**Files:**
- Modify: `CLAUDE.md` (project-level, at image-background-remover root)

- [ ] **Step 1: Update CLAUDE.md**

Update the following sections:
1. Replace "remove.bg" references with "PhotoRoom (primary) + remove.bg (fallback)"
2. Update credit model description
3. Add new env vars (`PHOTOROOM_API_KEY`, `PAYPAL_*`)
4. Add new routes to project structure
5. Add `/account` page to structure
6. Update billing model description

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for PhotoRoom + billing system"
```

---

## Verification Checklist

After all tasks are complete, verify:

- [ ] Free user: can process 3 images, gets blocked at 4th, quality capped at HD, upload max 5MB
- [ ] Credit purchase: PayPal flow works, credits appear in balance
- [ ] Credit consumption: after quota exhausted, credits auto-deduct
- [ ] Subscription: PayPal subscription flow works, plan upgrades, quota increases
- [ ] Plan-aware limits: Basic=10 batch/25MB/Ultra HD, Pro=20 batch/25MB/Ultra HD
- [ ] Cancel subscription: access continues until period end, then downgrades
- [ ] Account page: all 3 tabs render correctly with live data
- [ ] UserMenu: shows credits + plan + account link
- [ ] FAQ: 4 tabs with billing content
- [ ] Build succeeds: `npm run build` passes
