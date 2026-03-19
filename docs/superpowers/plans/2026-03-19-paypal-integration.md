# PayPal Payment Integration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate PayPal sandbox payments for credit pack purchases and subscription management.

**Architecture:** PayPal JS SDK on the frontend (`@paypal/react-paypal-js`) renders payment buttons inside existing account page components. Backend API routes handle order creation/capture (credits) and subscription lifecycle. A webhook endpoint processes recurring payment events. All amounts are server-side determined.

**Tech Stack:** PayPal JS SDK, PayPal REST API v2 (Orders) + v1 (Subscriptions), Next.js API routes, Cloudflare D1

---

## Chunk 1: Foundation — Environment, Migration, PayPal Client

### Task 1: Environment variables and dependencies

**Files:**
- Modify: `.env.local`
- Modify: `next.config.ts` (line 6-8)
- Modify: `package.json` (line 12-20)

- [ ] **Step 1: Add PayPal env vars to .env.local**

Append to `.env.local`:

```
PAYPAL_CLIENT_ID=AU3e4AhYQTsMyqXfXFg9J4_ZWFAxQhFU94nawEP2m-rwerMWJcPxy4Z9zL0BFtupmC2m_0g2mW8L-1Xr
PAYPAL_CLIENT_SECRET=EPLe4yMZQRhaLkS_a6iscvmnfqHuL06m5XL39AJCmOwWgytwBkPS8qxT4tp_h4JQcwejSuUgkma8j9E1
NEXT_PUBLIC_PAYPAL_CLIENT_ID=AU3e4AhYQTsMyqXfXFg9J4_ZWFAxQhFU94nawEP2m-rwerMWJcPxy4Z9zL0BFtupmC2m_0g2mW8L-1Xr
PAYPAL_PLAN_BASIC=
PAYPAL_PLAN_PRO=
PAYPAL_WEBHOOK_ID=
```

Note: `PAYPAL_PLAN_BASIC` and `PAYPAL_PLAN_PRO` will be populated after running the setup script in Task 7.

- [ ] **Step 2: Expose PAYPAL_CLIENT_ID to the frontend via next.config.ts**

In `next.config.ts`, add `env` to the config object:

```ts
const nextConfig: NextConfig = {
  allowedDevOrigins: ["*.loca.lt", "*.lhr.life"],
  env: {
    NEXT_PUBLIC_PAYPAL_CLIENT_ID: process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID,
  },
};
```

- [ ] **Step 3: Install @paypal/react-paypal-js**

```bash
npm install @paypal/react-paypal-js
```

- [ ] **Step 4: Verify build still works**

```bash
npm run build
```

Expected: Build succeeds with no new errors.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json next.config.ts
git commit -m "chore: add PayPal SDK dependency and expose client ID to frontend"
```

Note: Do NOT commit `.env.local`.

---

### Task 2: Database migration — subscription_status + unique index

**Files:**
- Create: `migrations/0005_subscription_status.sql`

- [ ] **Step 1: Create migration file**

Create `migrations/0005_subscription_status.sql`:

```sql
-- Add subscription_status to track active/cancelled/suspended state
ALTER TABLE user ADD COLUMN subscription_status TEXT DEFAULT 'none';

-- Add UNIQUE constraint on paypal_transaction_id for idempotent webhook processing
-- NULL values are excluded (SQLite allows multiple NULLs in UNIQUE columns)
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_paypal_id_unique
  ON transactions(paypal_transaction_id) WHERE paypal_transaction_id IS NOT NULL;

-- Drop the old non-unique index
DROP INDEX IF EXISTS idx_transactions_paypal_id;
```

- [ ] **Step 2: Apply migration locally**

```bash
npx wrangler d1 execute AUTH_DB --local --file=migrations/0005_subscription_status.sql
```

Expected: No errors.

- [ ] **Step 3: Verify schema change**

```bash
npx wrangler d1 execute AUTH_DB --local --command="PRAGMA table_info(user);" | grep subscription_status
```

Expected: Row showing `subscription_status` column.

- [ ] **Step 4: Commit**

```bash
git add migrations/0005_subscription_status.sql
git commit -m "feat: add migration 0005 — subscription_status column and unique PayPal transaction index"
```

---

### Task 3: PayPal REST API client

**Files:**
- Create: `src/lib/paypal.ts`

- [ ] **Step 1: Create the PayPal API client module**

Create `src/lib/paypal.ts`:

```ts
const PAYPAL_BASE_URL = process.env.PAYPAL_MODE === "live"
  ? "https://api-m.paypal.com"
  : "https://api-m.sandbox.paypal.com";

async function getAccessToken(): Promise<string> {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("PayPal credentials not configured");
  }

  const credentials = btoa(`${clientId}:${clientSecret}`);
  const res = await fetch(`${PAYPAL_BASE_URL}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PayPal auth failed: ${res.status} ${text}`);
  }

  const data = await res.json() as { access_token: string };
  return data.access_token;
}

export async function createOrder(amount: string, description: string): Promise<string> {
  const token = await getAccessToken();
  const res = await fetch(`${PAYPAL_BASE_URL}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [{
        amount: { currency_code: "USD", value: amount },
        description,
      }],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PayPal createOrder failed: ${res.status} ${text}`);
  }

  const data = await res.json() as { id: string };
  return data.id;
}

export interface CaptureResult {
  id: string;
  status: string;
  captureId: string;
  amount: string;
  payerEmail: string;
}

export async function captureOrder(orderId: string): Promise<CaptureResult> {
  const token = await getAccessToken();
  const res = await fetch(`${PAYPAL_BASE_URL}/v2/checkout/orders/${orderId}/capture`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PayPal captureOrder failed: ${res.status} ${text}`);
  }

  const data = await res.json() as any;
  const capture = data.purchase_units?.[0]?.payments?.captures?.[0];

  return {
    id: data.id,
    status: data.status,
    captureId: capture?.id ?? "",
    amount: capture?.amount?.value ?? "0",
    payerEmail: data.payer?.email_address ?? "",
  };
}

export async function createSubscription(planId: string): Promise<{ subscriptionId: string; approveUrl: string }> {
  const token = await getAccessToken();
  const res = await fetch(`${PAYPAL_BASE_URL}/v1/billing/subscriptions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      plan_id: planId,
      application_context: {
        brand_name: "Image Background Remover",
        shipping_preference: "NO_SHIPPING",
        user_action: "SUBSCRIBE_NOW",
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PayPal createSubscription failed: ${res.status} ${text}`);
  }

  const data = await res.json() as { id: string; links: Array<{ rel: string; href: string }> };
  const approveLink = data.links.find((l) => l.rel === "approve");

  return {
    subscriptionId: data.id,
    approveUrl: approveLink?.href ?? "",
  };
}

export interface SubscriptionDetails {
  id: string;
  status: string;
  planId: string;
  subscriberEmail: string;
  startTime: string;
  nextBillingTime: string | null;
}

export async function getSubscription(subscriptionId: string): Promise<SubscriptionDetails> {
  const token = await getAccessToken();
  const res = await fetch(`${PAYPAL_BASE_URL}/v1/billing/subscriptions/${subscriptionId}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PayPal getSubscription failed: ${res.status} ${text}`);
  }

  const data = await res.json() as any;
  return {
    id: data.id,
    status: data.status,
    planId: data.plan_id,
    subscriberEmail: data.subscriber?.email_address ?? "",
    startTime: data.start_time ?? "",
    nextBillingTime: data.billing_info?.next_billing_time ?? null,
  };
}

export async function cancelSubscription(subscriptionId: string, reason: string): Promise<void> {
  const token = await getAccessToken();
  const res = await fetch(`${PAYPAL_BASE_URL}/v1/billing/subscriptions/${subscriptionId}/cancel`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ reason }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PayPal cancelSubscription failed: ${res.status} ${text}`);
  }
}

export async function verifyWebhookSignature(
  headers: Record<string, string>,
  body: string
): Promise<boolean> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) {
    console.warn("PAYPAL_WEBHOOK_ID not set, skipping signature verification");
    return true;
  }

  const token = await getAccessToken();
  const res = await fetch(`${PAYPAL_BASE_URL}/v1/notifications/verify-webhook-signature`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      auth_algo: headers["paypal-auth-algo"] ?? "",
      cert_url: headers["paypal-cert-url"] ?? "",
      transmission_id: headers["paypal-transmission-id"] ?? "",
      transmission_sig: headers["paypal-transmission-sig"] ?? "",
      transmission_time: headers["paypal-transmission-time"] ?? "",
      webhook_id: webhookId,
      webhook_event: JSON.parse(body),
    }),
  });

  if (!res.ok) return false;
  const data = await res.json() as { verification_status: string };
  return data.verification_status === "SUCCESS";
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit src/lib/paypal.ts 2>&1 || true
```

Note: May have isolated TS config issues; a full `npm run build` check comes at end of chunk.

- [ ] **Step 3: Commit**

```bash
git add src/lib/paypal.ts
git commit -m "feat: add PayPal REST API client (orders, subscriptions, webhook verification)"
```

---

## Chunk 2: Backend API Routes

### Task 4: Credit pack order endpoints (create-order + capture-order)

**Files:**
- Create: `app/api/paypal/create-order/route.ts`
- Create: `app/api/paypal/capture-order/route.ts`

- [ ] **Step 1: Create the create-order endpoint**

Create `app/api/paypal/create-order/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "../../../../auth";
import { CREDIT_PACKS } from "@/lib/plans";
import { createOrder } from "@/lib/paypal";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json() as { packId: string };
  const pack = CREDIT_PACKS.find((p) => p.id === body.packId);

  if (!pack) {
    return NextResponse.json({ error: "Invalid pack ID" }, { status: 400 });
  }

  try {
    const orderId = await createOrder(
      pack.priceUsd.toFixed(2),
      `${pack.credits} credits — ${pack.label} Pack`
    );
    return NextResponse.json({ orderId });
  } catch (error) {
    console.error("PayPal create-order error:", error);
    return NextResponse.json({ error: "Failed to create order" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create the capture-order endpoint**

Create `app/api/paypal/capture-order/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "../../../../auth";
import { CREDIT_PACKS } from "@/lib/plans";
import { captureOrder } from "@/lib/paypal";
import { addCredits, recordTransaction } from "@/lib/credits";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json() as { orderId: string; packId: string };
  const pack = CREDIT_PACKS.find((p) => p.id === body.packId);

  if (!pack) {
    return NextResponse.json({ error: "Invalid pack ID" }, { status: 400 });
  }

  try {
    const result = await captureOrder(body.orderId);

    // Verify captured amount matches expected price
    if (parseFloat(result.amount) !== pack.priceUsd) {
      console.error(
        `PayPal amount mismatch: expected ${pack.priceUsd}, got ${result.amount}`
      );
      return NextResponse.json({ error: "Payment amount mismatch" }, { status: 400 });
    }

    if (result.status !== "COMPLETED") {
      return NextResponse.json({ error: "Payment not completed" }, { status: 400 });
    }

    // Credit the user
    const newBalance = await addCredits(session.user.id, pack.credits);

    // Record the transaction
    await recordTransaction({
      userId: session.user.id,
      type: "credit_purchase",
      amountUsd: pack.priceUsd,
      creditsAdded: pack.credits,
      paypalTransactionId: result.captureId,
      status: "completed",
    });

    return NextResponse.json({
      success: true,
      credits: newBalance,
      payerEmail: result.payerEmail,
    });
  } catch (error) {
    console.error("PayPal capture-order error:", error);
    return NextResponse.json({ error: "Failed to capture payment" }, { status: 500 });
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add app/api/paypal/create-order/route.ts app/api/paypal/capture-order/route.ts
git commit -m "feat: add PayPal create-order and capture-order API routes for credit pack purchases"
```

---

### Task 5: Subscription endpoints (create + cancel)

**Files:**
- Create: `app/api/paypal/create-subscription/route.ts`
- Create: `app/api/paypal/cancel-subscription/route.ts`

- [ ] **Step 1: Create the create-subscription endpoint**

Create `app/api/paypal/create-subscription/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "../../../../auth";
import { PLANS, type PlanId } from "@/lib/plans";
import { createSubscription, getSubscription, cancelSubscription as paypalCancel } from "@/lib/paypal";
import { recordTransaction } from "@/lib/credits";
import { getD1 } from "@/lib/db";

const PAYPAL_PLAN_MAP: Record<string, string | undefined> = {
  basic: process.env.PAYPAL_PLAN_BASIC,
  pro: process.env.PAYPAL_PLAN_PRO,
};

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json() as { planId: string; subscriptionId?: string };
  const planId = body.planId as PlanId;

  if (!PLANS[planId] || planId === "free") {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }

  const paypalPlanId = PAYPAL_PLAN_MAP[planId];
  if (!paypalPlanId) {
    return NextResponse.json({ error: "PayPal plan not configured" }, { status: 500 });
  }

  try {
    // If subscriptionId is provided, the frontend already created the subscription
    // via PayPal JS SDK — we just need to verify and activate it
    if (body.subscriptionId) {
      const sub = await getSubscription(body.subscriptionId);

      if (sub.status !== "ACTIVE" && sub.status !== "APPROVED") {
        return NextResponse.json({ error: "Subscription not active" }, { status: 400 });
      }

      const db = getD1();
      const userId = session.user.id;

      // Check if user has an existing subscription to cancel (downgrade scenario)
      const userRow = await db
        .prepare("SELECT paypal_subscription_id, plan FROM user WHERE id = ?")
        .bind(userId)
        .first<{ paypal_subscription_id: string | null; plan: string | null }>();

      if (userRow?.paypal_subscription_id && userRow.paypal_subscription_id !== body.subscriptionId) {
        // Cancel old subscription after new one is confirmed
        try {
          await paypalCancel(userRow.paypal_subscription_id, `Switching to ${planId} plan`);
        } catch (e) {
          console.warn("Failed to cancel old subscription:", e);
        }
      }

      // Set plan_expires_at to 1 month from now
      const expiresAt = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;

      await db
        .prepare(
          `UPDATE user SET plan = ?, plan_expires_at = ?, paypal_subscription_id = ?,
           paypal_email = ?, subscription_status = 'active' WHERE id = ?`
        )
        .bind(planId, expiresAt, body.subscriptionId, sub.subscriberEmail, userId)
        .run();

      await recordTransaction({
        userId,
        type: "subscription",
        amountUsd: PLANS[planId].priceUsd,
        plan: planId,
        paypalTransactionId: body.subscriptionId,
        status: "completed",
      });

      return NextResponse.json({
        success: true,
        plan: planId,
        expiresAt,
      });
    }

    // Fallback: create subscription server-side (not typical with JS SDK)
    const result = await createSubscription(paypalPlanId);
    return NextResponse.json({
      subscriptionId: result.subscriptionId,
      approveUrl: result.approveUrl,
    });
  } catch (error) {
    console.error("PayPal create-subscription error:", error);
    return NextResponse.json({ error: "Failed to create subscription" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create the cancel-subscription endpoint**

Create `app/api/paypal/cancel-subscription/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "../../../../auth";
import { cancelSubscription } from "@/lib/paypal";
import { getD1 } from "@/lib/db";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getD1();
  const userId = session.user.id;

  const userRow = await db
    .prepare("SELECT paypal_subscription_id, plan FROM user WHERE id = ?")
    .bind(userId)
    .first<{ paypal_subscription_id: string | null; plan: string | null }>();

  if (!userRow?.paypal_subscription_id) {
    return NextResponse.json({ error: "No active subscription" }, { status: 400 });
  }

  try {
    await cancelSubscription(userRow.paypal_subscription_id, "User requested cancellation");

    // Mark as cancelled but keep plan active until expiry
    await db
      .prepare("UPDATE user SET subscription_status = 'cancelled' WHERE id = ?")
      .bind(userId)
      .run();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("PayPal cancel-subscription error:", error);
    return NextResponse.json({ error: "Failed to cancel subscription" }, { status: 500 });
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add app/api/paypal/create-subscription/route.ts app/api/paypal/cancel-subscription/route.ts
git commit -m "feat: add PayPal subscription create and cancel API routes"
```

---

### Task 6: Webhook endpoint

**Files:**
- Create: `app/api/webhooks/paypal/route.ts`

- [ ] **Step 1: Create the webhook handler**

Create `app/api/webhooks/paypal/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/paypal";
import { recordTransaction } from "@/lib/credits";
import { getD1 } from "@/lib/db";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const headers: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    headers[key] = value;
  });

  // Verify webhook signature
  const isValid = await verifyWebhookSignature(headers, body);
  if (!isValid) {
    console.error("PayPal webhook signature verification failed");
    return NextResponse.json({ error: "Invalid signature" }, { status: 200 });
    // Return 200 even on failure to prevent retries
  }

  const event = JSON.parse(body) as {
    event_type: string;
    resource: any;
  };

  const db = getD1();

  try {
    switch (event.event_type) {
      case "BILLING.SUBSCRIPTION.ACTIVATED": {
        // Backup activation — primary is handled in create-subscription onApprove
        const subId = event.resource.id;
        const email = event.resource.subscriber?.email_address;
        if (subId) {
          await db
            .prepare(
              "UPDATE user SET subscription_status = 'active' WHERE paypal_subscription_id = ?"
            )
            .bind(subId)
            .run();
        }
        break;
      }

      case "BILLING.SUBSCRIPTION.PAYMENT.COMPLETED": {
        const subId = event.resource.billing_agreement_id ?? event.resource.id;
        const paypalTxId = event.resource.id;
        const amount = event.resource.amount?.total ?? event.resource.amount?.value ?? "0";

        // Find user by subscription ID
        const user = await db
          .prepare(
            "SELECT id, plan, subscription_status FROM user WHERE paypal_subscription_id = ?"
          )
          .bind(subId)
          .first<{ id: string; plan: string; subscription_status: string }>();

        if (!user) {
          console.warn(`Webhook: no user found for subscription ${subId}`);
          break;
        }

        // Skip if subscription already cancelled
        if (user.subscription_status === "cancelled") {
          console.log(`Webhook: skipping renewal for cancelled subscription ${subId}`);
          break;
        }

        // Extend plan_expires_at by 1 month
        const newExpiry = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
        await db
          .prepare("UPDATE user SET plan_expires_at = ? WHERE id = ?")
          .bind(newExpiry, user.id)
          .run();

        // Record transaction (idempotent via UNIQUE constraint)
        try {
          await recordTransaction({
            userId: user.id,
            type: "subscription_renewal",
            amountUsd: parseFloat(amount),
            plan: user.plan,
            paypalTransactionId: paypalTxId,
            status: "completed",
          });
        } catch (e: any) {
          // UNIQUE constraint violation = already processed
          if (e.message?.includes("UNIQUE")) {
            console.log(`Webhook: duplicate transaction ${paypalTxId}, skipping`);
          } else {
            throw e;
          }
        }
        break;
      }

      case "BILLING.SUBSCRIPTION.CANCELLED":
      case "BILLING.SUBSCRIPTION.SUSPENDED": {
        const subId = event.resource.id;
        const status = event.event_type.includes("CANCELLED") ? "cancelled" : "suspended";
        await db
          .prepare("UPDATE user SET subscription_status = ? WHERE paypal_subscription_id = ?")
          .bind(status, subId)
          .run();
        break;
      }

      default:
        console.log(`Webhook: unhandled event type ${event.event_type}`);
    }
  } catch (error) {
    console.error("Webhook processing error:", error);
    // Still return 200 to prevent retries
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/webhooks/paypal/route.ts
git commit -m "feat: add PayPal webhook handler for subscription lifecycle events"
```

---

### Task 7: Setup script for PayPal Plans

**Files:**
- Create: `scripts/setup-paypal-plans.ts`

- [ ] **Step 1: Create the setup script**

Create `scripts/setup-paypal-plans.ts`:

```ts
/**
 * One-time setup script: creates PayPal Product and Subscription Plans.
 * Run: npx tsx scripts/setup-paypal-plans.ts
 *
 * Requires PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in .env.local or environment.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

const BASE_URL = process.env.PAYPAL_MODE === "live"
  ? "https://api-m.paypal.com"
  : "https://api-m.sandbox.paypal.com";

async function getAccessToken(): Promise<string> {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET");
  }

  const res = await fetch(`${BASE_URL}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`Auth failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

async function createProduct(token: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/v1/catalogs/products`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: "Image Background Remover",
      description: "Online image background removal service",
      type: "SERVICE",
      category: "SOFTWARE",
    }),
  });
  if (!res.ok) throw new Error(`Product creation failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { id: string };
  console.log(`Product created: ${data.id}`);
  return data.id;
}

async function createPlan(
  token: string,
  productId: string,
  name: string,
  price: string
): Promise<string> {
  const res = await fetch(`${BASE_URL}/v1/billing/plans`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      product_id: productId,
      name,
      billing_cycles: [
        {
          frequency: { interval_unit: "MONTH", interval_count: 1 },
          tenure_type: "REGULAR",
          sequence: 1,
          total_cycles: 0, // infinite
          pricing_scheme: {
            fixed_price: { value: price, currency_code: "USD" },
          },
        },
      ],
      payment_preferences: {
        auto_bill_outstanding: true,
        payment_failure_threshold: 3,
      },
    }),
  });
  if (!res.ok) throw new Error(`Plan creation failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { id: string };
  console.log(`Plan "${name}" created: ${data.id}`);
  return data.id;
}

async function main() {
  console.log(`Using PayPal ${process.env.PAYPAL_MODE === "live" ? "PRODUCTION" : "SANDBOX"}`);
  console.log(`Base URL: ${BASE_URL}\n`);

  const token = await getAccessToken();
  console.log("Authenticated successfully.\n");

  const productId = await createProduct(token);

  const basicPlanId = await createPlan(token, productId, "Basic Monthly", "9.99");
  const proPlanId = await createPlan(token, productId, "Pro Monthly", "24.99");

  console.log("\n=== Add these to your .env.local ===");
  console.log(`PAYPAL_PLAN_BASIC=${basicPlanId}`);
  console.log(`PAYPAL_PLAN_PRO=${proPlanId}`);
}

main().catch((err) => {
  console.error("Setup failed:", err);
  process.exit(1);
});
```

- [ ] **Step 2: Install dotenv as dev dependency**

```bash
npm install -D dotenv
```

- [ ] **Step 3: Run the setup script**

```bash
npx tsx scripts/setup-paypal-plans.ts
```

Expected output:
```
Using PayPal SANDBOX
Base URL: https://api-m.sandbox.paypal.com

Authenticated successfully.

Product created: PROD-xxxxx
Plan "Basic Monthly" created: P-xxxxx
Plan "Pro Monthly" created: P-xxxxx

=== Add these to your .env.local ===
PAYPAL_PLAN_BASIC=P-xxxxx
PAYPAL_PLAN_PRO=P-xxxxx
```

- [ ] **Step 4: Copy the Plan IDs to .env.local**

Update `.env.local` with the output Plan IDs:
```
PAYPAL_PLAN_BASIC=P-xxxxx
PAYPAL_PLAN_PRO=P-xxxxx
```

- [ ] **Step 5: Commit**

```bash
git add scripts/setup-paypal-plans.ts package.json package-lock.json
git commit -m "feat: add PayPal subscription plan setup script"
```

---

### Task 8: Update account API to include subscription_status

**Files:**
- Modify: `app/api/account/route.ts` (lines 39, 54-67)

- [ ] **Step 1: Add subscription_status to the account query and response**

In `app/api/account/route.ts`, update the SQL query to also select `subscription_status`:

Change the `userRow` query (around line 38):
```ts
    getD1()
      .prepare(
        "SELECT plan, plan_expires_at, paypal_email, paypal_subscription_id FROM user WHERE id = ?"
      )
```

To:
```ts
    getD1()
      .prepare(
        "SELECT plan, plan_expires_at, paypal_email, paypal_subscription_id, subscription_status FROM user WHERE id = ?"
      )
```

Update the type annotation to include `subscription_status: string | null`:
```ts
      .first<{
        plan: string;
        plan_expires_at: number | null;
        paypal_email: string | null;
        paypal_subscription_id: string | null;
        subscription_status: string | null;
      }>(),
```

Add `subscriptionStatus` to the subscription response object (around line 64):
```ts
    subscription: {
      planExpiresAt: userRow?.plan_expires_at ?? null,
      paypalEmail: userRow?.paypal_email ?? null,
      paypalSubscriptionId: userRow?.paypal_subscription_id ?? null,
      subscriptionStatus: userRow?.subscription_status ?? "none",
    },
```

- [ ] **Step 2: Commit**

```bash
git add app/api/account/route.ts
git commit -m "feat: include subscription_status in account API response"
```

---

## Chunk 3: Frontend Integration

### Task 9: Add PayPalScriptProvider to account page

**Files:**
- Modify: `app/account/page.tsx` (lines 129-147)

- [ ] **Step 1: Wrap the account page content with PayPalScriptProvider**

In `app/account/page.tsx`, add the import at the top:

```ts
import { PayPalScriptProvider } from "@paypal/react-paypal-js";
```

Then wrap the content in `AccountPage` component. Replace the existing `AccountPage` function (lines 129-147):

```tsx
export default function AccountPage() {
  return (
    <PayPalScriptProvider
      options={{
        clientId: process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID || "",
        currency: "USD",
        intent: "capture",
        vault: true,
      }}
    >
      <div className="min-h-screen flex flex-col bg-white">
        <Header />
        <main className="flex-1">
          <Suspense
            fallback={
              <div className="flex items-center justify-center py-32">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-indigo-500" />
              </div>
            }
          >
            <AccountContent />
          </Suspense>
        </main>
        <Footer />
      </div>
    </PayPalScriptProvider>
  );
}
```

- [ ] **Step 2: Pass refreshAccount callback to child components**

In the `AccountContent` function, add a `refreshAccount` callback and pass it down. After the existing `useEffect` (around line 55-69), add:

```ts
  const refreshAccount = useCallback(() => {
    fetch("/api/account")
      .then((r) => r.json() as Promise<AccountData>)
      .then((data) => setAccountData(data))
      .catch(console.error);
  }, []);
```

Then update the tab renders to pass `onRefresh`:

```tsx
      {activeTab === "plans" && (
        <PlansTab
          currentPlan={accountData.plan}
          plans={accountData.plans}
          creditPacks={accountData.creditPacks}
          onRefresh={refreshAccount}
        />
      )}
      {activeTab === "billing" && (
        <BillingTab
          accountData={accountData}
          onRefresh={refreshAccount}
        />
      )}
```

- [ ] **Step 3: Commit**

```bash
git add app/account/page.tsx
git commit -m "feat: add PayPalScriptProvider wrapper and refreshAccount to account page"
```

---

### Task 10: Replace CreditPackCard stub with PayPal Buttons

**Files:**
- Modify: `src/components/account/CreditPackCard.tsx` (full rewrite)

- [ ] **Step 1: Rewrite CreditPackCard with PayPalButtons**

Replace the full content of `src/components/account/CreditPackCard.tsx`:

```tsx
"use client";

import { useState } from "react";
import { PayPalButtons } from "@paypal/react-paypal-js";
import type { CreditPack } from "@/lib/plans";

interface CreditPackCardProps {
  pack: CreditPack;
  onSuccess?: () => void;
}

export default function CreditPackCard({ pack, onSuccess }: CreditPackCardProps) {
  const [status, setStatus] = useState<"idle" | "processing" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  return (
    <div className="rounded-xl border border-gray-100 shadow-sm p-6 flex flex-col">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-900">{pack.label}</h3>
        <div className="mt-2 flex items-baseline gap-1">
          <span className="text-3xl font-bold text-gray-900">
            ${pack.priceUsd}
          </span>
        </div>
      </div>

      <div className="space-y-2 text-sm text-gray-600 mb-6 flex-1">
        <p className="flex items-center gap-2">
          <svg className="w-4 h-4 text-indigo-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          {pack.credits} credits
        </p>
        <p className="flex items-center gap-2">
          <svg className="w-4 h-4 text-indigo-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          {pack.perImage} per image
        </p>
        <p className="flex items-center gap-2">
          <svg className="w-4 h-4 text-indigo-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          Never expire
        </p>
      </div>

      {status === "success" ? (
        <div className="w-full py-2.5 text-sm font-medium text-center text-green-700 bg-green-50 rounded-lg">
          {message}
        </div>
      ) : status === "error" ? (
        <div className="w-full py-2.5 text-sm font-medium text-center text-red-700 bg-red-50 rounded-lg">
          {message}
        </div>
      ) : (
        <div className="w-full">
          <PayPalButtons
            style={{
              layout: "horizontal",
              color: "blue",
              shape: "rect",
              label: "pay",
              height: 40,
              tagline: false,
            }}
            disabled={status === "processing"}
            createOrder={async () => {
              setStatus("processing");
              const res = await fetch("/api/paypal/create-order", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ packId: pack.id }),
              });
              const data = await res.json();
              if (!res.ok) throw new Error(data.error);
              return data.orderId;
            }}
            onApprove={async (data) => {
              const res = await fetch("/api/paypal/capture-order", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ orderId: data.orderID, packId: pack.id }),
              });
              const result = await res.json();
              if (!res.ok) {
                setStatus("error");
                setMessage(result.error || "Payment failed");
                return;
              }
              setStatus("success");
              setMessage(`+${pack.credits} credits added!`);
              onSuccess?.();
            }}
            onCancel={() => {
              setStatus("idle");
              setMessage("");
            }}
            onError={(err) => {
              console.error("PayPal error:", err);
              setStatus("error");
              setMessage("Payment failed. Please try again.");
            }}
          />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Update PlansTab to pass onSuccess to CreditPackCard**

In `src/components/account/PlansTab.tsx`, add `onRefresh` prop:

Update the interface:
```ts
interface PlansTabProps {
  currentPlan: string;
  plans: Record<string, PlanConfig>;
  creditPacks: CreditPack[];
  onRefresh?: () => void;
}
```

Update the function signature:
```ts
export default function PlansTab({
  currentPlan,
  plans,
  creditPacks,
  onRefresh,
}: PlansTabProps) {
```

Pass to CreditPackCard:
```tsx
<CreditPackCard key={pack.id} pack={pack} onSuccess={onRefresh} />
```

- [ ] **Step 3: Commit**

```bash
git add src/components/account/CreditPackCard.tsx src/components/account/PlansTab.tsx
git commit -m "feat: replace CreditPackCard stub with PayPal Buttons for credit purchases"
```

---

### Task 11: Replace PlanCard stub with PayPal Subscription Buttons

**Files:**
- Modify: `src/components/account/PlanCard.tsx` (full rewrite)

- [ ] **Step 1: Rewrite PlanCard with PayPal subscription flow**

Replace the full content of `src/components/account/PlanCard.tsx`:

```tsx
"use client";

import { useState } from "react";
import { PayPalButtons } from "@paypal/react-paypal-js";
import type { PlanConfig } from "@/lib/plans";

interface PlanCardProps {
  plan: PlanConfig;
  isCurrent: boolean;
  isDowngrade: boolean;
  onSuccess?: () => void;
}

function formatFileSize(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))}MB`;
}

const qualityLabels: Record<string, string> = {
  preview: "Preview",
  auto: "Standard",
  hd: "HD",
  full: "Ultra HD",
};

export default function PlanCard({ plan, isCurrent, isDowngrade, onSuccess }: PlanCardProps) {
  const [status, setStatus] = useState<"idle" | "processing" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const showPayPal = !isCurrent && plan.id !== "free" && !isDowngrade;

  return (
    <div
      className={`rounded-xl border shadow-sm p-6 flex flex-col ${
        isCurrent
          ? "border-indigo-300 ring-2 ring-indigo-100"
          : "border-gray-100"
      }`}
    >
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-900">{plan.label}</h3>
        <div className="mt-2 flex items-baseline gap-1">
          {plan.priceUsd === 0 ? (
            <span className="text-3xl font-bold text-gray-900">Free</span>
          ) : (
            <>
              <span className="text-3xl font-bold text-gray-900">
                ${plan.priceUsd}
              </span>
              <span className="text-sm text-gray-500">/month</span>
            </>
          )}
        </div>
      </div>

      <ul className="space-y-2 text-sm text-gray-600 mb-6 flex-1">
        <li className="flex items-center gap-2">
          <svg className="w-4 h-4 text-indigo-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          {plan.monthlyQuota} images/month
        </li>
        <li className="flex items-center gap-2">
          <svg className="w-4 h-4 text-indigo-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          Up to {qualityLabels[plan.maxQuality] ?? plan.maxQuality} quality
        </li>
        <li className="flex items-center gap-2">
          <svg className="w-4 h-4 text-indigo-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          Max {formatFileSize(plan.maxFileSizeBytes)} file size
        </li>
        <li className="flex items-center gap-2">
          <svg className="w-4 h-4 text-indigo-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          {plan.maxBatchFiles === 1
            ? "Single file processing"
            : `Batch up to ${plan.maxBatchFiles} files`}
        </li>
        {plan.overagePriceUsd !== null && (
          <li className="flex items-center gap-2">
            <svg className="w-4 h-4 text-indigo-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            Overage at ${plan.overagePriceUsd}/image
          </li>
        )}
      </ul>

      {isCurrent ? (
        <div className="w-full py-2.5 text-sm font-medium text-center text-indigo-600 bg-indigo-50 rounded-lg">
          Current Plan
        </div>
      ) : status === "success" ? (
        <div className="w-full py-2.5 text-sm font-medium text-center text-green-700 bg-green-50 rounded-lg">
          {message}
        </div>
      ) : status === "error" ? (
        <div className="w-full py-2.5 text-sm font-medium text-center text-red-700 bg-red-50 rounded-lg">
          {message}
        </div>
      ) : showPayPal ? (
        <div className="w-full">
          <PayPalButtons
            style={{
              layout: "horizontal",
              color: "gold",
              shape: "rect",
              label: "subscribe",
              height: 40,
              tagline: false,
            }}
            disabled={status === "processing"}
            createSubscription={async (_data, actions) => {
              setStatus("processing");
              // Get the PayPal plan ID from server
              const res = await fetch("/api/paypal/create-subscription", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ planId: plan.id }),
              });
              const result = await res.json();
              if (result.subscriptionId) {
                // Server created it, return the ID
                return result.subscriptionId;
              }
              throw new Error(result.error || "Failed to create subscription");
            }}
            onApprove={async (data) => {
              const res = await fetch("/api/paypal/create-subscription", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  planId: plan.id,
                  subscriptionId: data.subscriptionID,
                }),
              });
              const result = await res.json();
              if (!res.ok) {
                setStatus("error");
                setMessage(result.error || "Activation failed");
                return;
              }
              setStatus("success");
              setMessage(`Upgraded to ${plan.label}!`);
              onSuccess?.();
            }}
            onCancel={() => {
              setStatus("idle");
            }}
            onError={(err) => {
              console.error("PayPal subscription error:", err);
              setStatus("error");
              setMessage("Something went wrong. Please try again.");
            }}
          />
        </div>
      ) : plan.id === "free" ? (
        <div className="w-full py-2.5 text-sm font-medium text-center text-gray-400 bg-gray-50 rounded-lg">
          Free Plan
        </div>
      ) : (
        <button
          disabled
          className="w-full py-2.5 text-sm font-medium text-gray-400 border border-gray-200 rounded-lg cursor-not-allowed"
        >
          Downgrade
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Update PlansTab to pass onSuccess to PlanCard**

In `src/components/account/PlansTab.tsx`, update the PlanCard usage:

```tsx
<PlanCard
  key={planId}
  plan={plan}
  isCurrent={planId === currentPlan}
  isDowngrade={idx < currentIndex}
  onSuccess={onRefresh}
/>
```

- [ ] **Step 3: Commit**

```bash
git add src/components/account/PlanCard.tsx src/components/account/PlansTab.tsx
git commit -m "feat: replace PlanCard stub with PayPal subscription buttons"
```

---

### Task 12: Implement cancel subscription in BillingTab

**Files:**
- Modify: `src/components/account/BillingTab.tsx` (lines 72-111)

- [ ] **Step 1: Add cancel subscription functionality and subscription_status display**

Replace the full content of `src/components/account/BillingTab.tsx`:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import TransactionHistory from "./TransactionHistory";

interface AccountData {
  plan: string;
  planConfig: { label: string };
  subscription: {
    planExpiresAt: number | null;
    paypalEmail: string | null;
    paypalSubscriptionId: string | null;
    subscriptionStatus: string;
  };
  recentTransactions: Array<{
    id: string;
    type: string;
    amount_usd: number;
    credits_added: number | null;
    plan: string | null;
    status: string;
    created_at: number;
  }>;
}

interface BillingTabProps {
  accountData: AccountData;
  onRefresh?: () => void;
}

function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default function BillingTab({ accountData, onRefresh }: BillingTabProps) {
  const { plan, planConfig, subscription, recentTransactions } = accountData;
  const [cancelling, setCancelling] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [cancelMessage, setCancelMessage] = useState("");

  const handleCancelSubscription = async () => {
    setCancelling(true);
    setCancelMessage("");
    try {
      const res = await fetch("/api/paypal/cancel-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok) {
        setCancelMessage(data.error || "Failed to cancel subscription");
        return;
      }
      setCancelMessage("Subscription cancelled. Your plan remains active until the end of the billing period.");
      setShowConfirm(false);
      onRefresh?.();
    } catch {
      setCancelMessage("Something went wrong. Please try again.");
    } finally {
      setCancelling(false);
    }
  };

  const isCancelled = subscription.subscriptionStatus === "cancelled";
  const isSuspended = subscription.subscriptionStatus === "suspended";

  return (
    <div className="space-y-8">
      {/* Payment method */}
      <div className="rounded-xl border border-gray-100 shadow-sm p-6">
        <h3 className="text-sm font-medium text-gray-500 mb-4">
          Payment Method
        </h3>
        {subscription.paypalEmail ? (
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
              <svg
                className="w-6 h-6 text-blue-600"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M7.076 21.337H2.47a.641.641 0 0 1-.633-.74L4.944 3.72a.771.771 0 0 1 .76-.654h6.577c2.18 0 3.703.588 4.53 1.749.826 1.16.986 2.727.476 4.662-.04.152-.084.307-.134.467-.497 1.604-1.334 2.856-2.49 3.723-1.156.867-2.631 1.307-4.384 1.307H8.24a.773.773 0 0 0-.762.654l-.997 5.707a.642.642 0 0 1-.633.543l.228.06z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">PayPal</p>
              <p className="text-xs text-gray-500">
                {subscription.paypalEmail}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-400">
            No payment method on file. Add one when you upgrade or buy credits.
          </p>
        )}
      </div>

      {/* Current subscription */}
      <div className="rounded-xl border border-gray-100 shadow-sm p-6">
        <h3 className="text-sm font-medium text-gray-500 mb-4">
          Current Subscription
        </h3>
        {plan === "free" ? (
          <div>
            <p className="text-sm text-gray-900 mb-2">
              You are on the{" "}
              <span className="font-medium">Free Plan</span>.
            </p>
            <Link
              href="/account?tab=plans"
              className="text-sm text-indigo-600 hover:text-indigo-700 font-medium transition-colors"
            >
              Upgrade for more images and features
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-gray-900">
              <span className="font-medium capitalize">
                {planConfig.label} Plan
              </span>
              {isCancelled && (
                <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700">
                  Cancelling
                </span>
              )}
              {isSuspended && (
                <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">
                  Suspended
                </span>
              )}
            </p>
            {subscription.planExpiresAt && (
              <p className="text-xs text-gray-500">
                {isCancelled
                  ? `Cancels on ${formatDate(subscription.planExpiresAt)}`
                  : subscription.planExpiresAt * 1000 > Date.now()
                    ? `Renews on ${formatDate(subscription.planExpiresAt)}`
                    : `Expired on ${formatDate(subscription.planExpiresAt)}`}
              </p>
            )}
            {subscription.paypalSubscriptionId && (
              <p className="text-xs text-gray-400">
                Subscription ID: {subscription.paypalSubscriptionId}
              </p>
            )}

            {/* Cancel button */}
            {subscription.paypalSubscriptionId && !isCancelled && !isSuspended && (
              <div className="pt-2">
                {showConfirm ? (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg space-y-3">
                    <p className="text-sm text-amber-800">
                      Your plan will remain active until{" "}
                      {subscription.planExpiresAt
                        ? formatDate(subscription.planExpiresAt)
                        : "the end of the billing period"}
                      . After that, you will be downgraded to the Free plan.
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={handleCancelSubscription}
                        disabled={cancelling}
                        className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
                      >
                        {cancelling ? "Cancelling..." : "Confirm Cancel"}
                      </button>
                      <button
                        onClick={() => setShowConfirm(false)}
                        disabled={cancelling}
                        className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 hover:bg-gray-50 rounded-lg transition-colors cursor-pointer"
                      >
                        Keep Subscription
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowConfirm(true)}
                    className="text-sm text-red-600 hover:text-red-700 font-medium transition-colors cursor-pointer"
                  >
                    Cancel Subscription
                  </button>
                )}
              </div>
            )}

            {cancelMessage && (
              <p className={`text-sm ${cancelMessage.includes("Failed") || cancelMessage.includes("wrong") ? "text-red-600" : "text-green-600"}`}>
                {cancelMessage}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Transaction history */}
      <div className="rounded-xl border border-gray-100 shadow-sm p-6">
        <h3 className="text-sm font-medium text-gray-500 mb-4">
          Transaction History
        </h3>
        <TransactionHistory initialTransactions={recentTransactions} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/account/BillingTab.tsx
git commit -m "feat: implement cancel subscription with confirmation dialog in BillingTab"
```

---

## Chunk 4: Verification and Deployment

### Task 13: Build verification

**Files:** None (verification only)

- [ ] **Step 1: Run full build**

```bash
npm run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 2: Fix any TypeScript/build errors**

If errors occur, fix them. Common issues:
- Missing type imports for PayPal SDK
- Prop type mismatches after adding `onRefresh`/`onSuccess`

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve build errors from PayPal integration"
```

(Skip if no fixes needed.)

### Task 14: Apply remote D1 migration

**Files:** None (deployment step)

- [ ] **Step 1: Apply migration 0005 to remote D1**

```bash
npx wrangler d1 execute AUTH_DB --remote --file=migrations/0005_subscription_status.sql
```

Expected: No errors.

- [ ] **Step 2: Verify remote schema**

```bash
npx wrangler d1 execute AUTH_DB --remote --command="PRAGMA table_info(user);" | grep subscription_status
```

Expected: Row showing `subscription_status` column.

### Task 15: Deploy to Cloudflare Pages

**Files:** None (deployment step)

- [ ] **Step 1: Build for Cloudflare**

```bash
npx opennextjs-cloudflare build
```

- [ ] **Step 2: Copy worker files to assets**

```bash
cp .open-next/worker.js .open-next/assets/_worker.js
cp -r .open-next/cloudflare .open-next/assets/
cp -r .open-next/.build .open-next/assets/
cp -r .open-next/middleware .open-next/assets/
cp -r .open-next/server-functions .open-next/assets/
```

- [ ] **Step 3: Set PayPal env vars in Cloudflare Pages**

Via Cloudflare Dashboard or wrangler, set:
- `PAYPAL_CLIENT_ID`
- `PAYPAL_CLIENT_SECRET`
- `NEXT_PUBLIC_PAYPAL_CLIENT_ID`
- `PAYPAL_PLAN_BASIC` (from setup script output)
- `PAYPAL_PLAN_PRO` (from setup script output)

- [ ] **Step 4: Deploy**

```bash
npx wrangler pages deploy .open-next/assets \
  --project-name=image-background-remover --branch=main --commit-dirty=true
```

- [ ] **Step 5: Test credit pack purchase on live site**

1. Navigate to `imagebackgroundremover.live/account?tab=plans`
2. Click "Buy Credits" PayPal button on Starter pack ($2.99)
3. Log in with PayPal sandbox buyer account
4. Complete payment
5. Verify credits balance updated

- [ ] **Step 6: Test subscription on live site**

1. On Plans tab, click Upgrade on Basic plan
2. Approve the subscription in PayPal popup
3. Verify plan changed to Basic with expiry date shown
4. Check BillingTab shows subscription details and "Renews on" date

- [ ] **Step 7: Test cancel subscription**

1. Navigate to Billing tab
2. Click "Cancel Subscription"
3. Confirm cancellation
4. Verify status shows "Cancelling" badge and "Cancels on" date
