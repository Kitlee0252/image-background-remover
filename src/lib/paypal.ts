/**
 * PayPal REST API client.
 * Supports Orders v2, Subscriptions v1, and Webhook verification.
 *
 * Base URL:
 *   PAYPAL_MODE=live  → https://api-m.paypal.com
 *   otherwise         → https://api-m.sandbox.paypal.com
 *
 * Required env vars:
 *   PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET
 *   PAYPAL_WEBHOOK_ID  (optional — webhook verification returns true with a warning if absent)
 */

const BASE_URL =
  process.env.PAYPAL_MODE === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface CaptureResult {
  id: string;           // PayPal order ID
  status: string;       // e.g. "COMPLETED"
  captureId: string;    // capture resource ID (used for refunds)
  amount: string;       // e.g. "2.99"
  payerEmail: string;   // payer's email address
}

export interface SubscriptionDetails {
  id: string;
  status: string;                  // e.g. "ACTIVE", "CANCELLED", "SUSPENDED"
  planId: string;
  subscriberEmail: string;
  createTime: string;              // ISO 8601
  nextBillingTime: string | null;  // null when cancelled
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Obtain an OAuth2 Bearer token via client_credentials grant.
 * No caching — Cloudflare Workers have no shared in-process state between
 * requests, so we fetch a fresh token per invocation.
 */
export async function getAccessToken(): Promise<string> {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET must be set");
  }

  const credentials = btoa(`${clientId}:${clientSecret}`);

  const response = await fetch(`${BASE_URL}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `PayPal token request failed (${response.status}): ${text}`
    );
  }

  const data = (await response.json()) as { access_token: string };
  return data.access_token;
}

// ---------------------------------------------------------------------------
// Orders API (v2)
// ---------------------------------------------------------------------------

/**
 * Create a one-time payment order.
 * Returns the PayPal order ID.
 */
export async function createOrder(
  amount: string,
  description: string
): Promise<string> {
  const token = await getAccessToken();

  const response = await fetch(`${BASE_URL}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          description,
          amount: {
            currency_code: "USD",
            value: amount,
          },
        },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `PayPal createOrder failed (${response.status}): ${text}`
    );
  }

  const data = (await response.json()) as { id: string };
  return data.id;
}

/**
 * Capture a previously approved order.
 * Returns a CaptureResult with the order ID, status, capture ID, amount, and
 * payer email.
 */
export async function captureOrder(orderId: string): Promise<CaptureResult> {
  const token = await getAccessToken();

  const response = await fetch(
    `${BASE_URL}/v2/checkout/orders/${orderId}/capture`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  );

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `PayPal captureOrder failed (${response.status}): ${text}`
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (await response.json()) as any;

  const purchaseUnit = data.purchase_units?.[0];
  const capture = purchaseUnit?.payments?.captures?.[0];

  return {
    id: data.id,
    status: data.status,
    captureId: capture?.id ?? "",
    amount: capture?.amount?.value ?? "0.00",
    payerEmail: data.payer?.email_address ?? "",
  };
}

// ---------------------------------------------------------------------------
// Subscriptions API (v1)
// ---------------------------------------------------------------------------

/**
 * Create a new subscription for the given PayPal plan ID.
 * Returns the subscription ID and the PayPal approval URL the user must visit.
 */
export async function createSubscription(
  planId: string
): Promise<{ subscriptionId: string; approveUrl: string }> {
  const token = await getAccessToken();

  const response = await fetch(`${BASE_URL}/v1/billing/subscriptions`, {
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

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `PayPal createSubscription failed (${response.status}): ${text}`
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (await response.json()) as any;

  const approveLink = (data.links as Array<{ rel: string; href: string }>)?.find(
    (l) => l.rel === "approve"
  );

  if (!approveLink) {
    throw new Error("PayPal createSubscription: no approve link in response");
  }

  return {
    subscriptionId: data.id,
    approveUrl: approveLink.href,
  };
}

/**
 * Retrieve details for an existing subscription.
 */
export async function getSubscription(
  subscriptionId: string
): Promise<SubscriptionDetails> {
  const token = await getAccessToken();

  const response = await fetch(
    `${BASE_URL}/v1/billing/subscriptions/${subscriptionId}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  );

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `PayPal getSubscription failed (${response.status}): ${text}`
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (await response.json()) as any;

  return {
    id: data.id,
    status: data.status,
    planId: data.plan_id,
    subscriberEmail: data.subscriber?.email_address ?? "",
    createTime: data.create_time,
    nextBillingTime: data.billing_info?.next_billing_time ?? null,
  };
}

/**
 * Cancel an active subscription.
 */
export async function cancelSubscription(
  subscriptionId: string,
  reason: string
): Promise<void> {
  const token = await getAccessToken();

  const response = await fetch(
    `${BASE_URL}/v1/billing/subscriptions/${subscriptionId}/cancel`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ reason }),
    }
  );

  // 204 No Content is the success response for cancellation
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `PayPal cancelSubscription failed (${response.status}): ${text}`
    );
  }
}

// ---------------------------------------------------------------------------
// Webhook verification
// ---------------------------------------------------------------------------

/**
 * Verify an incoming PayPal webhook signature.
 * Returns true if the signature is valid (or if PAYPAL_WEBHOOK_ID is not set,
 * in which case verification is skipped with a console warning).
 *
 * @param headers - The raw HTTP request headers from the webhook call
 * @param body    - The raw request body string (must be the original bytes)
 */
export async function verifyWebhookSignature(
  headers: Record<string, string>,
  body: string
): Promise<boolean> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;

  if (!webhookId) {
    console.warn(
      "[PayPal] PAYPAL_WEBHOOK_ID is not set — skipping webhook signature verification"
    );
    return true;
  }

  const token = await getAccessToken();

  const response = await fetch(
    `${BASE_URL}/v1/notifications/verify-webhook-signature`,
    {
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
    }
  );

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `PayPal verifyWebhookSignature failed (${response.status}): ${text}`
    );
  }

  const data = (await response.json()) as { verification_status: string };
  return data.verification_status === "SUCCESS";
}
