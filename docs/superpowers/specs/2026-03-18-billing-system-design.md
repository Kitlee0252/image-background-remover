# Billing System Design — Image Background Remover

**Date**: 2026-03-18
**Status**: Approved
**Scope**: Pricing model, user center, FAQ, API migration

---

## 1. Overview

Design a hybrid billing system (credits + monthly subscription) for the image background remover. Target audience: international individual users + small businesses, USD pricing, PayPal.cn payment.

### Key Decisions

- **API Provider**: Migrate from remove.bg ($0.178/image) to **PhotoRoom** ($0.02/image) as primary API
- **Billing Model**: Credits (pay-as-you-go) + Monthly Subscriptions (hybrid)
- **Payment Gateway**: PayPal.cn
- **Currency**: USD

---

## 2. API Migration: remove.bg → PhotoRoom

### Why PhotoRoom

| | PhotoRoom | remove.bg |
|--|-----------|-----------|
| Cost per image | **$0.02** | $0.178 (500 credits tier) |
| Accuracy (3rd-party benchmark) | **70.8%** | 41.7% |
| Median latency | **~300ms** | ~500ms-1s |
| Free tier | 10 images/mo + 1,000 sandbox | 50 preview/mo |
| Max input | 50MB, 25MP | 25MB, 12MP (free) |
| Output formats | PNG, JPG, WebP | PNG, JPG, ZIP |

### Migration Path

PhotoRoom provides a **remove.bg compatibility mode**. Migration requires only:

1. Endpoint URL: `api.remove.bg/v1.0/removebg` → `sdk.photoroom.com/v1/segment`
2. API key header: `X-Api-Key` (same pattern)
3. Response handling: PhotoRoom returns binary image (current codebase already has base64 conversion layer, minor adaptation needed)

Parameter names are intentionally compatible — no other code changes needed.

### Fallback Strategy

- PhotoRoom = primary API (99%+ of calls)
- remove.bg = emergency fallback only (when PhotoRoom is down)
- **remove.bg is NOT viable as primary** — subscription plans become unprofitable at remove.bg cost

---

## 3. Pricing Model

### 3.1 Monthly Subscription Plans

| | Free | Basic | Pro |
|--|------|-------|-----|
| **Price** | $0 | $9.99/mo | $24.99/mo |
| **Monthly quota** | 3 | 40 | 100 |
| **Upload size** | 5MB | 25MB | 25MB |
| **Output quality** | Up to HD (4MP) | All incl. Ultra HD (36MP) | All incl. Ultra HD (36MP) |
| **Batch processing** | Single image | Up to 10 | Up to 20 |
| **Overage pricing** | N/A | $0.12/image | $0.08/image |

**Competitive positioning** (vs remove.bg):

- remove.bg: 40 images at $9/mo — our Basic: 40 images at $9.99/mo with Ultra HD included
- remove.bg: 200 images at $39/mo — our Pro: 100 images at $24.99/mo (lower price point, different segment)

### 3.2 Credit Packs (never expire)

| Pack | Price | Credits | Per image | Cost | Margin |
|------|-------|---------|-----------|------|--------|
| Starter | $2.99 | 10 | $0.299 | $0.20 | **93%** |
| Popular | $7.99 | 35 | $0.228 | $0.70 | **91%** |
| Value | $19.99 | 100 | $0.200 | $2.00 | **90%** |

### 3.3 Margin Analysis (PhotoRoom $0.02/image)

| Plan | Revenue | Cost (full usage) | Margin |
|------|---------|-------------------|--------|
| Free | $0 | 3 × $0.02 = $0.06 | Acquisition cost |
| Basic | $9.99 | 40 × $0.02 = $0.80 | **92%** |
| Pro | $24.99 | 100 × $0.02 = $2.00 | **92%** |
| Credit Starter | $2.99 | 10 × $0.02 = $0.20 | **93%** |
| Credit Popular | $7.99 | 35 × $0.02 = $0.70 | **91%** |
| Credit Value | $19.99 | 100 × $0.02 = $2.00 | **90%** |

All tiers ≥ 70% target ✓

### 3.4 Credits + Subscription Interaction

- Subscription quota is a **separate monthly allowance**, resets on the 1st of each month, does not carry over
- Credits are **permanent**, never expire
- When monthly quota is exhausted, credits are consumed automatically (if available)
- Subscribers can also purchase credit packs as overflow reserve
- Overage purchases ($0.12/image Basic, $0.08/image Pro) deduct directly, no credits involved

### 3.5 Feature Privileges

| Feature | Free | Credit User | Basic | Pro |
|---------|------|-------------|-------|-----|
| Monthly free quota | 3 | — | 40 | 100 |
| Upload size | 5MB | 25MB | 25MB | 25MB |
| Output quality max | HD | HD | Ultra HD | Ultra HD |
| Batch processing | Single | 10 | 10 | 20 |
| Overage purchase | ✗ | — | $0.12/ea | $0.08/ea |

### 3.6 Credit Consumption Rule

1 credit = 1 image, regardless of output quality. Quality ceiling is determined by user tier, not per-image cost. This keeps UX simple and is possible because PhotoRoom charges a flat $0.02 for all output resolutions.

---

## 4. User Center Design

### 4.1 Page Structure

New page at `/account` with 3 tabs:

#### Tab 1: Overview (default)

- **Profile card**: Avatar, name, email (from Google OAuth, read-only), plan badge (color-coded: Free=gray, Basic=blue, Pro=purple)
- **Usage summary**: This month progress bar (turns orange at 80%, red at 100%) + credits balance
- **Quick actions**: [Buy Credits] [Upgrade Plan]
- **Recent activity**: Last 5 processed images (date, filename, quality, credit/quota used), [View All →] link

#### Tab 2: Plans & Credits

- **Plan comparison cards** (3 cards: Free, Basic, Pro):
  - Current plan highlighted with "Current Plan" label
  - Other plans show [Upgrade] or [Downgrade] button
  - Each card: price, monthly quota, quality max, batch limit

- **Credit packs section** ("Buy Credits — never expire"):
  - 3 cards (Starter $2.99/10, Popular $7.99/35, Value $19.99/100)
  - Each shows per-image price
  - [Buy] button → PayPal checkout

#### Tab 3: Billing

- **Payment method**: PayPal email (masked), [Change] [Remove] actions
- **Current subscription**: Plan name, next billing date, [Cancel Subscription] button
  - Cancel = access until end of billing period, then downgrade to Free
- **Transaction history**: Table (date, description, amount), [Load More] pagination

### 4.2 UserMenu Dropdown (existing, modified)

```
┌─────────────────┐
│ [Avatar] Name    │
│ Free Plan        │
│ ██████░░ 2/3     │
│─────────────────│
│ 0 Credits       │
│ Account Settings│  → navigates to /account
│ Sign Out        │
└─────────────────┘
```

- Credits balance always visible
- Usage bar with plan indicator
- "Account Settings" links to `/account`

### 4.3 Entry Points

| From | To | Trigger |
|------|----|---------|
| UserMenu → "Account Settings" | `/account` Overview | Always |
| UsageBanner "Upgrade" link | `/account` Plans & Credits tab | Quota exceeded |
| API 403 `quota_exceeded` response | Show UsageBanner | Processing fails |

---

## 5. FAQ Design

### 5.1 Structure

Categorized accordion with 4 tabs: **Pricing** (default) / **Usage** / **Account** / **Technical**

Placed on:
- Main page: full FAQ (all 4 categories)
- `/account` page: compact FAQ (Pricing category only, at page bottom)

### 5.2 Content

#### Pricing & Credits

**How much does it cost?**
Free users get 3 images per month at up to HD quality. For more, you can buy credit packs starting at $2.99 for 10 credits, or subscribe to Basic ($9.99/mo, 40 images) or Pro ($24.99/mo, 100 images) for extra features like Ultra HD output and batch processing.

**What's the difference between credits and a subscription?**
Credits are one-time purchases that never expire — great for occasional use. Subscriptions give you a monthly quota plus perks like Ultra HD quality and higher batch limits. If you're a subscriber and your monthly quota runs out, your credits are used automatically.

**Do unused credits or monthly quota roll over?**
Credits never expire and always roll over. Monthly subscription quota resets on the 1st of each month and does not carry over.

**Can I get a refund?**
Unused credit packs are eligible for a refund within 7 days of purchase. Subscriptions can be cancelled anytime — you'll keep access until the end of your billing period, but we don't offer partial refunds for the current month.

**What payment methods do you accept?**
We accept PayPal. All prices are in USD.

#### Usage & Limits

**What are the upload limits?**
Free users: up to 5MB per image. Paid users (credits or subscription): up to 25MB per image. Supported formats: JPG, PNG, WebP.

**What quality options are available?**
Preview (0.25MP), Standard, HD (4MP), and Ultra HD (up to 36MP). Free users can use up to HD. Ultra HD is available for Basic and Pro subscribers.

**How does batch processing work?**
Upload multiple images at once — they'll be processed in parallel. Free users process one image at a time. Basic/Credit users can batch up to 10, Pro users up to 20.

**What counts as one credit / one usage?**
Each successfully processed image costs 1 credit (or 1 usage from your monthly quota), regardless of output quality. Failed or rejected images are not counted.

**What happens when I hit my limit?**
Free users see an upgrade prompt. Subscribers can purchase additional images at $0.12/image (Basic) or $0.08/image (Pro), or buy a credit pack.

#### Account & Security

**Do I need an account?**
Yes. Sign in with Google to use the service. This lets us track your usage and credits securely.

**Is my data safe?**
We do not store your images. Photos are processed in real-time and never saved to our servers. Only your usage records (date, quality, count) are stored. See our Privacy Policy for details.

**How do I cancel my subscription?**
Go to Account → Billing → Cancel Subscription. You'll keep your plan benefits until the end of the current billing period.

**Can I delete my account?**
Yes. Go to Account → Billing → Delete Account. This will permanently remove your profile, usage history, and any remaining credits.

#### Technical

**What image formats are supported?**
Input: JPG, PNG, WebP. Output: PNG with transparent background.

**Why was my image rejected?**
Images with no clear foreground subject (solid colors, abstract patterns) may be rejected by our AI. Try a different image with a distinct subject.

**How long does processing take?**
Typically under 1 second per image. Batch processing runs 2 images in parallel.

---

## 6. Database Schema Changes

### New tables needed

```sql
-- Credits balance per user
CREATE TABLE credits (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user(id),
  balance INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

-- Credit/subscription purchase transactions
CREATE TABLE transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user(id),
  type TEXT NOT NULL,          -- 'credit_purchase' | 'subscription' | 'overage' | 'refund'
  amount_usd REAL NOT NULL,    -- charged amount
  credits_added INTEGER,       -- for credit purchases
  plan TEXT,                   -- for subscription changes
  paypal_transaction_id TEXT,
  status TEXT NOT NULL,        -- 'completed' | 'pending' | 'refunded'
  created_at INTEGER NOT NULL
);
```

### Existing table modifications

```sql
-- Add columns to user table
ALTER TABLE user ADD COLUMN plan TEXT NOT NULL DEFAULT 'free';
ALTER TABLE user ADD COLUMN plan_expires_at INTEGER;         -- subscription expiry (unix timestamp)
ALTER TABLE user ADD COLUMN paypal_email TEXT;
```

### Existing table: usage (no changes)

The current `usage` table already tracks per-image processing records. No schema changes needed.

---

## 7. Implementation Notes

### PayPal.cn Integration

- Use PayPal REST API (server-side) for creating orders and capturing payments
- Subscription plans use PayPal Subscriptions API (recurring billing)
- Credit packs use PayPal Orders API (one-time payment)
- Webhook endpoint needed for payment confirmations and subscription lifecycle events

### API Route Changes

- `/api/remove-background/route.ts`: Add credit deduction logic, check both quota and credits
- New routes:
  - `POST /api/checkout/credits` — create PayPal order for credit pack
  - `POST /api/checkout/subscribe` — create PayPal subscription
  - `POST /api/webhooks/paypal` — handle PayPal webhooks
  - `GET /api/account` — return full account info (plan, credits, usage)
  - `POST /api/account/cancel` — cancel subscription

### Consumption Priority

When processing an image:
1. Check monthly quota (if subscribed) → deduct from quota
2. If quota exhausted → check credits balance → deduct 1 credit
3. If no credits → return `quota_exceeded` error (or offer overage purchase)
