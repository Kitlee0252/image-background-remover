/**
 * One-time setup script: creates PayPal Product and Subscription Plans.
 *
 * Usage:
 *   npx tsx scripts/setup-paypal-plans.ts
 *
 * Required env vars (in .env.local):
 *   PAYPAL_CLIENT_ID
 *   PAYPAL_CLIENT_SECRET
 *   PAYPAL_MODE   (optional, defaults to "sandbox"; set to "live" for production)
 */

import "dotenv/config";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const MODE = process.env.PAYPAL_MODE ?? "sandbox";
const BASE_URL =
  MODE === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";

const CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error(
    "ERROR: PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET must be set in .env.local"
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// PayPal API helpers
// ---------------------------------------------------------------------------

async function getAccessToken(): Promise<string> {
  const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString(
    "base64"
  );

  const res = await fetch(`${BASE_URL}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to get access token (${res.status}): ${text}`);
  }

  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

async function createProduct(token: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/v1/catalogs/products`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": `create-product-image-bg-remover-${Date.now()}`,
    },
    body: JSON.stringify({
      name: "Image Background Remover",
      type: "SERVICE",
      category: "SOFTWARE",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to create product (${res.status}): ${text}`);
  }

  const data = (await res.json()) as { id: string };
  console.log(`  Product created: ${data.id}`);
  return data.id;
}

interface PlanConfig {
  name: string;
  price: string;
}

async function createPlan(
  token: string,
  productId: string,
  config: PlanConfig
): Promise<string> {
  const res = await fetch(`${BASE_URL}/v1/billing/plans`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": `create-plan-${config.name.replace(/\s+/g, "-").toLowerCase()}-${Date.now()}`,
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      product_id: productId,
      name: config.name,
      billing_cycles: [
        {
          frequency: {
            interval_unit: "MONTH",
            interval_count: 1,
          },
          tenure_type: "REGULAR",
          sequence: 1,
          total_cycles: 0,
          pricing_scheme: {
            fixed_price: {
              value: config.price,
              currency_code: "USD",
            },
          },
        },
      ],
      payment_preferences: {
        auto_bill_outstanding: true,
        payment_failure_threshold: 3,
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Failed to create plan "${config.name}" (${res.status}): ${text}`
    );
  }

  const data = (await res.json()) as { id: string };
  console.log(`  Plan "${config.name}" created: ${data.id}`);
  return data.id;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`\nPayPal Plan Setup`);
  console.log(`  Mode: ${MODE}`);
  console.log(`  Base URL: ${BASE_URL}`);
  console.log("");

  // 1. Authenticate
  console.log("Step 1: Authenticating with PayPal...");
  const token = await getAccessToken();
  console.log("  Access token obtained.\n");

  // 2. Create Product
  console.log("Step 2: Creating Product...");
  const productId = await createProduct(token);
  console.log("");

  // 3. Create Plans
  console.log("Step 3: Creating Subscription Plans...");
  const basicPlanId = await createPlan(token, productId, {
    name: "Basic Monthly",
    price: "9.99",
  });
  const proPlanId = await createPlan(token, productId, {
    name: "Pro Monthly",
    price: "24.99",
  });
  console.log("");

  // 4. Output results
  console.log("=".repeat(60));
  console.log("Setup complete! Add the following to your .env.local:\n");
  console.log(`PAYPAL_BASIC_PLAN_ID=${basicPlanId}`);
  console.log(`PAYPAL_PRO_PLAN_ID=${proPlanId}`);
  console.log(`PAYPAL_PRODUCT_ID=${productId}`);
  console.log("=".repeat(60));
  console.log("");
}

main().catch((err) => {
  console.error("\nSetup failed:", err.message);
  process.exit(1);
});
