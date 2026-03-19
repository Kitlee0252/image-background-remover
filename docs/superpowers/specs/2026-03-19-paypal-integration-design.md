# PayPal Payment Integration Design

## Overview

Integrate PayPal payment functionality into the image-background-remover project using PayPal JS SDK (frontend) + REST API (backend). Supports two payment scenarios: one-time credit pack purchases and monthly subscription plans. Sandbox environment first, production switch requires only credential changes.

## Payment Scenarios

### 1. Credit Pack Purchase (One-time)

| Pack | Credits | Price | Per-credit |
|------|---------|-------|------------|
| Starter | 10 | $2.99 | $0.30 |
| Popular | 35 | $7.99 | $0.23 |
| Value | 100 | $19.99 | $0.20 |

**API**: PayPal Orders API (create → capture)

**Flow**:
1. User clicks "Buy" on CreditPackCard
2. Frontend `createOrder` callback → `POST /api/paypal/create-order` with pack ID
3. Backend creates order via PayPal Orders API (amount from server-side `CREDIT_PACKS` constant)
4. PayPal popup opens, user approves payment
5. Frontend `onApprove` callback → `POST /api/paypal/capture-order` with order ID
6. Backend captures payment, verifies amount matches expected price
7. On success: `addCredits()` + `recordTransaction(type: 'credit_purchase')`
8. Frontend refreshes account data, shows success toast

### 2. Subscription (Monthly Recurring)

| Plan | Price | Monthly Quota |
|------|-------|---------------|
| Basic | $9.99/mo | 40 images |
| Pro | $24.99/mo | 100 images |

**API**: PayPal Subscriptions API

**Prerequisite**: PayPal Plan objects must be created once via setup script (see Setup section).

**Flow**:
1. User clicks "Upgrade" on PlanCard
2. Frontend `createSubscription` callback → `POST /api/paypal/create-subscription` with plan ID (basic/pro)
3. Backend maps plan ID to PayPal Plan ID (`PAYPAL_PLAN_BASIC` / `PAYPAL_PLAN_PRO`), creates subscription via PayPal API
4. PayPal popup opens, user approves subscription
5. Frontend `onApprove` callback → backend verifies subscription is ACTIVE via PayPal GET subscription
6. Backend updates `user` table: `plan`, `plan_expires_at` (+1 month), `paypal_subscription_id`, `paypal_email`
7. `recordTransaction(type: 'subscription')`
8. Frontend refreshes, shows new plan status

**Downgrade (Pro → Basic)**:
1. Create new Basic subscription first (user approves in PayPal popup)
2. Only after new subscription is confirmed ACTIVE → cancel old Pro subscription
3. Update user table with new plan, subscription ID, and plan_expires_at
4. If step 1 fails (user cancels popup), no changes — old Pro subscription remains intact

### 3. Cancel Subscription

**Flow**:
1. User clicks "Cancel Subscription" on BillingTab
2. Confirmation dialog appears
3. On confirm → `POST /api/paypal/cancel-subscription`
4. Backend calls PayPal Subscriptions API to cancel
5. Backend sets `subscription_status = 'cancelled'`, keeps `plan` and `plan_expires_at` unchanged — user retains access until expiry
6. BillingTab shows "Cancels on {date}" instead of "Renews on {date}"
7. Existing logic in `remove-background` API auto-downgrades to free when `plan_expires_at` is past

### 4. Subscription Renewal (Automatic)

**Handled via webhook** — no user interaction.

1. PayPal auto-charges monthly
2. PayPal sends `BILLING.SUBSCRIPTION.PAYMENT.COMPLETED` webhook
3. Backend verifies webhook signature
4. Checks `subscription_status` is `active` (skip if already cancelled)
5. Extends `plan_expires_at` by 1 month
6. `recordTransaction(type: 'subscription_renewal')`

## Architecture

### New Files

```
src/lib/paypal.ts                           # PayPal REST API client
app/api/paypal/create-order/route.ts        # Credit pack order creation
app/api/paypal/capture-order/route.ts       # Credit pack payment capture
app/api/paypal/create-subscription/route.ts # Subscription creation
app/api/paypal/cancel-subscription/route.ts # Subscription cancellation
app/api/webhooks/paypal/route.ts            # Webhook event handler (under /api/webhooks/* to match middleware exemption)
migrations/0005_subscription_status.sql     # Add subscription_status column to user table
scripts/setup-paypal-plans.ts               # One-time Plan creation script
```

### Modified Files

```
src/components/account/CreditPackCard.tsx   # Replace stub with PayPalButtons
src/components/account/PlanCard.tsx         # Replace stub with PayPalButtons
src/components/account/BillingTab.tsx       # Implement cancel subscription
app/account/page.tsx                        # Add PayPalScriptProvider
.env.local                                  # Add PayPal credentials
next.config.ts                              # Expose PAYPAL_CLIENT_ID to frontend
package.json                                # Add @paypal/react-paypal-js
```

### PayPal REST API Client (`src/lib/paypal.ts`)

Shared utility module:

- `getAccessToken()`: OAuth2 client_credentials → Bearer token (fetched per request — no persistent cache on Cloudflare Workers)
- `createOrder(amount, description)`: POST /v2/checkout/orders
- `captureOrder(orderId)`: POST /v2/checkout/orders/{id}/capture
- `createSubscription(planId)`: POST /v1/billing/subscriptions
- `getSubscription(subscriptionId)`: GET /v1/billing/subscriptions/{id}
- `cancelSubscription(subscriptionId, reason)`: POST /v1/billing/subscriptions/{id}/cancel
- `verifyWebhookSignature(headers, body)`: POST /v1/notifications/verify-webhook-signature

Base URL: `https://api-m.sandbox.paypal.com` (sandbox) / `https://api-m.paypal.com` (production). Determined by env var or config flag.

### Webhook Events

| Event | Action |
|-------|--------|
| `BILLING.SUBSCRIPTION.ACTIVATED` | Subscription confirmed active (backup for onApprove) |
| `BILLING.SUBSCRIPTION.PAYMENT.COMPLETED` | Recurring payment success → extend plan_expires_at +1 month, record transaction |
| `BILLING.SUBSCRIPTION.CANCELLED` | Mark subscription_status='cancelled', retain access until expiry |
| `BILLING.SUBSCRIPTION.SUSPENDED` | Mark subscription_status='suspended', retain access until expiry |

**Idempotency**: Use `paypal_transaction_id` (from webhook payload) to deduplicate. Enforce atomically via INSERT ... ON CONFLICT on `paypal_transaction_id` (requires UNIQUE constraint — see migration 0005). For transactions without a PayPal ID (e.g., free tier), the column remains NULL and is excluded from the constraint.

**Signature verification**: Validate webhook using PayPal's verify-webhook-signature API with `PAYPAL_WEBHOOK_ID`.

**Response behavior**: Always return HTTP 200 quickly, even if post-processing fails. Log errors for manual resolution. PayPal retries failed webhooks for up to 3 days — returning 5xx would trigger unnecessary retries.

### Database Migration (`migrations/0005_subscription_status.sql`)

```sql
-- Add subscription_status to track active/cancelled/suspended state
ALTER TABLE user ADD COLUMN subscription_status TEXT DEFAULT 'none';
-- Values: 'none' | 'active' | 'cancelled' | 'suspended'

-- Add UNIQUE constraint on paypal_transaction_id for idempotent webhook processing
-- NULL values are excluded (SQLite allows multiple NULLs in UNIQUE columns)
CREATE UNIQUE INDEX idx_transactions_paypal_id_unique
  ON transactions(paypal_transaction_id) WHERE paypal_transaction_id IS NOT NULL;

-- Drop the old non-unique index
DROP INDEX IF EXISTS idx_transactions_paypal_id;
```

## Security

- **Server-side amount determination**: Frontend sends only pack ID or plan ID. All prices resolved from server-side constants (`CREDIT_PACKS`, `PLANS`). No client-supplied amounts.
- **Post-capture amount verification**: After capturing, compare PayPal's returned amount against expected price. Reject mismatches.
- **Webhook signature verification**: All webhook requests validated before processing.
- **Authentication**: All `/api/paypal/*` endpoints (except webhook) require JWT session via existing middleware.
- **Idempotent writes**: Deduplicate by `paypal_transaction_id` to prevent double-crediting from webhook retries.

## Environment Variables

```
PAYPAL_CLIENT_ID=xxx                 # PayPal Client ID (sandbox or production)
PAYPAL_CLIENT_SECRET=xxx             # PayPal Client Secret (server-side only)
PAYPAL_PLAN_BASIC=P-xxx              # Generated by setup script
PAYPAL_PLAN_PRO=P-xxx                # Generated by setup script
PAYPAL_WEBHOOK_ID=xxx                # Created in PayPal Developer Dashboard
```

`PAYPAL_CLIENT_ID` exposed to frontend via `NEXT_PUBLIC_PAYPAL_CLIENT_ID` or `next.config.ts` env config.

## Setup Script (`scripts/setup-paypal-plans.ts`)

Run once per environment (sandbox / production):

1. Authenticate with PayPal REST API
2. Create Product: "Image Background Remover"
3. Create Plan: Basic Monthly ($9.99/month)
4. Create Plan: Pro Monthly ($24.99/month)
5. Output Plan IDs → user copies to `.env.local`

```bash
npx tsx scripts/setup-paypal-plans.ts
```

## Frontend Integration

### PayPalScriptProvider

Wrap account page (not global layout — only needed on account page) with:

```tsx
<PayPalScriptProvider options={{
  clientId: process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID,
  currency: "USD",
  intent: "capture",        // for orders
  vault: true,               // for subscriptions
}}>
```

### CreditPackCard Changes

Replace `alert("PayPal integration coming soon!")` with `<PayPalButtons>`:
- `createOrder`: POST to `/api/paypal/create-order` with `{ packId }`
- `onApprove`: POST to `/api/paypal/capture-order` with `{ orderId }`
- `onCancel`: show "Payment cancelled" message, no server-side action
- `onError`: show error toast
- Button styled to match existing card design (small, contained)

### PlanCard Changes

Replace stub with `<PayPalButtons>` in subscription mode:
- `createSubscription`: POST to `/api/paypal/create-subscription` with `{ planId }`
- `onApprove`: POST to verify + activate subscription
- Only shown for upgrade actions (not current plan, not downgrade-to-free)

### BillingTab Changes

"Cancel Subscription" button:
- Show confirmation dialog with message: "Your plan will remain active until {expiry date}"
- On confirm: POST to `/api/paypal/cancel-subscription`
- On success: refresh account data

## Out of Scope

- Overage per-image purchase (users buy credit packs instead)
- Account deletion
- Refund API (handled manually via PayPal Dashboard)
- Prorated upgrade/downgrade refunds (cancel retains until month end)
- PayPal webhook for production (configured when deploying to production)

## Sandbox → Production Migration

Four steps:
1. Replace `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` with production credentials
2. PayPal API base URL automatically switches (determined by env var `PAYPAL_MODE=live`)
3. Run setup script again with production credentials to create production Plans
4. Configure production webhook in PayPal Developer Dashboard, update `PAYPAL_WEBHOOK_ID`
