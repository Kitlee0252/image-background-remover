import { NextRequest, NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/paypal";
import { recordTransaction } from "@/lib/credits";
import { getD1 } from "@/lib/db";

// No auth required — this endpoint receives inbound calls from PayPal.
// The middleware at /middleware.ts already exempts /api/webhooks/* paths.

export async function POST(req: NextRequest) {
  // Read body as raw text so we can pass the original bytes to signature verification.
  const body = await req.text();

  // Collect headers into a plain Record<string, string> for verifyWebhookSignature.
  const headers: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    headers[key] = value;
  });

  // Verify signature. If invalid, log but still return 200 to prevent PayPal retries.
  const isValid = await verifyWebhookSignature(headers, body).catch((err) => {
    console.error("[PayPal Webhook] Signature verification error:", err);
    return false;
  });

  if (!isValid) {
    console.error("[PayPal Webhook] Invalid signature — ignoring event");
    return NextResponse.json({ received: true }, { status: 200 });
  }

  // Parse event and dispatch.
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const event = JSON.parse(body) as any;

    switch (event.event_type as string) {
      // -----------------------------------------------------------------------
      // Subscription activated (user approved the subscription on PayPal)
      // -----------------------------------------------------------------------
      case "BILLING.SUBSCRIPTION.ACTIVATED": {
        const subId: string = event.resource?.id;
        if (!subId) {
          console.warn("[PayPal Webhook] ACTIVATED: missing resource.id");
          break;
        }
        const db = getD1();
        await db
          .prepare(
            "UPDATE user SET subscription_status = 'active' WHERE paypal_subscription_id = ?"
          )
          .bind(subId)
          .run();
        console.log(`[PayPal Webhook] ACTIVATED: subscription ${subId} marked active`);
        break;
      }

      // -----------------------------------------------------------------------
      // Subscription renewal payment completed
      // -----------------------------------------------------------------------
      case "BILLING.SUBSCRIPTION.PAYMENT.COMPLETED": {
        const subId: string =
          event.resource?.billing_agreement_id ?? event.resource?.id;
        const paypalTxId: string = event.resource?.id;
        const amountStr: string =
          event.resource?.amount?.total ??
          event.resource?.amount?.value ??
          "0";
        const amountUsd = parseFloat(amountStr) || 0;

        if (!subId) {
          console.warn(
            "[PayPal Webhook] PAYMENT.COMPLETED: could not determine subscription ID"
          );
          break;
        }

        const db = getD1();

        // Find the user associated with this subscription.
        const userRow = await db
          .prepare(
            "SELECT id, subscription_status FROM user WHERE paypal_subscription_id = ?"
          )
          .bind(subId)
          .first<{ id: string; subscription_status: string | null }>();

        if (!userRow) {
          console.warn(
            `[PayPal Webhook] PAYMENT.COMPLETED: no user found for subscription ${subId}`
          );
          break;
        }

        // If the subscription is already cancelled, do not extend.
        if (userRow.subscription_status === "cancelled") {
          console.log(
            `[PayPal Webhook] PAYMENT.COMPLETED: subscription ${subId} is cancelled — skipping renewal extension`
          );
          break;
        }

        // Extend plan_expires_at by 30 days from now.
        const expiresAt = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
        await db
          .prepare(
            "UPDATE user SET plan_expires_at = ? WHERE paypal_subscription_id = ?"
          )
          .bind(expiresAt, subId)
          .run();

        // Record the renewal transaction. Wrap in try/catch to handle duplicate
        // events gracefully (UNIQUE constraint on paypal_transaction_id).
        try {
          await recordTransaction({
            userId: userRow.id,
            type: "subscription_renewal",
            amountUsd,
            paypalTransactionId: paypalTxId,
            status: "completed",
          });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.toLowerCase().includes("unique") || msg.toLowerCase().includes("constraint")) {
            console.log(
              `[PayPal Webhook] PAYMENT.COMPLETED: duplicate transaction ${paypalTxId} — already processed, skipping`
            );
          } else {
            console.error(
              `[PayPal Webhook] PAYMENT.COMPLETED: recordTransaction error for tx ${paypalTxId}:`,
              err
            );
          }
        }

        console.log(
          `[PayPal Webhook] PAYMENT.COMPLETED: user ${userRow.id} plan extended to ${expiresAt}`
        );
        break;
      }

      // -----------------------------------------------------------------------
      // Subscription cancelled
      // -----------------------------------------------------------------------
      case "BILLING.SUBSCRIPTION.CANCELLED": {
        const subId: string = event.resource?.id;
        if (!subId) {
          console.warn("[PayPal Webhook] CANCELLED: missing resource.id");
          break;
        }
        const db = getD1();
        await db
          .prepare(
            "UPDATE user SET subscription_status = 'cancelled' WHERE paypal_subscription_id = ?"
          )
          .bind(subId)
          .run();
        console.log(`[PayPal Webhook] CANCELLED: subscription ${subId} marked cancelled`);
        break;
      }

      // -----------------------------------------------------------------------
      // Subscription suspended (e.g. payment failure)
      // -----------------------------------------------------------------------
      case "BILLING.SUBSCRIPTION.SUSPENDED": {
        const subId: string = event.resource?.id;
        if (!subId) {
          console.warn("[PayPal Webhook] SUSPENDED: missing resource.id");
          break;
        }
        const db = getD1();
        await db
          .prepare(
            "UPDATE user SET subscription_status = 'suspended' WHERE paypal_subscription_id = ?"
          )
          .bind(subId)
          .run();
        console.log(`[PayPal Webhook] SUSPENDED: subscription ${subId} marked suspended`);
        break;
      }

      // -----------------------------------------------------------------------
      // Payment sale completed — production PayPal uses this for subscription
      // recurring payments instead of BILLING.SUBSCRIPTION.PAYMENT.COMPLETED
      // -----------------------------------------------------------------------
      case "PAYMENT.SALE.COMPLETED": {
        const subId: string = event.resource?.billing_agreement_id;
        const paypalTxId: string = event.resource?.id;
        const amountStr: string =
          event.resource?.amount?.total ??
          event.resource?.amount?.value ??
          "0";
        const amountUsd = parseFloat(amountStr) || 0;

        if (!subId) {
          // Not a subscription payment — could be a one-time sale, ignore
          console.log("[PayPal Webhook] SALE.COMPLETED: no billing_agreement_id — not a subscription payment, skipping");
          break;
        }

        const db5 = getD1();

        const userRow5 = await db5
          .prepare(
            "SELECT id, subscription_status FROM user WHERE paypal_subscription_id = ?"
          )
          .bind(subId)
          .first<{ id: string; subscription_status: string | null }>();

        if (!userRow5) {
          console.warn(`[PayPal Webhook] SALE.COMPLETED: no user found for subscription ${subId}`);
          break;
        }

        if (userRow5.subscription_status === "cancelled") {
          console.log(`[PayPal Webhook] SALE.COMPLETED: subscription ${subId} is cancelled — skipping`);
          break;
        }

        const expiresAt5 = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
        await db5
          .prepare("UPDATE user SET plan_expires_at = ? WHERE paypal_subscription_id = ?")
          .bind(expiresAt5, subId)
          .run();

        try {
          await recordTransaction({
            userId: userRow5.id,
            type: "subscription_renewal",
            amountUsd,
            paypalTransactionId: paypalTxId,
            status: "completed",
          });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.toLowerCase().includes("unique") || msg.toLowerCase().includes("constraint")) {
            console.log(`[PayPal Webhook] SALE.COMPLETED: duplicate transaction ${paypalTxId} — skipping`);
          } else {
            console.error(`[PayPal Webhook] SALE.COMPLETED: recordTransaction error:`, err);
          }
        }

        console.log(`[PayPal Webhook] SALE.COMPLETED: user ${userRow5.id} plan extended to ${expiresAt5}`);
        break;
      }

      default:
        console.log(`[PayPal Webhook] Unhandled event type: ${event.event_type}`);
        break;
    }
  } catch (err) {
    // Never let processing errors change the HTTP response — PayPal must always
    // receive 200 or it will retry indefinitely.
    console.error("[PayPal Webhook] Unhandled error during event processing:", err);
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
