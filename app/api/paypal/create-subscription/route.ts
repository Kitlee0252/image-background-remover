import { NextRequest, NextResponse } from "next/server";
import { auth } from "../../../../auth";
import { PLANS, type PlanId } from "@/lib/plans";
import {
  createSubscription,
  getSubscription,
  cancelSubscription as paypalCancel,
} from "@/lib/paypal";
import { recordTransaction } from "@/lib/credits";
import { getD1 } from "@/lib/db";

export async function POST(req: NextRequest) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 }
    );
  }

  const userId = session.user.id;

  let planId: string;
  let subscriptionId: string | undefined;
  try {
    const body = await req.json() as { planId: string; subscriptionId?: string };
    planId = body.planId;
    subscriptionId = body.subscriptionId;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  // Validate planId
  if (!planId || !(planId in PLANS) || planId === "free") {
    return NextResponse.json(
      { error: "Invalid plan. Must be 'basic' or 'pro'." },
      { status: 400 }
    );
  }

  // Read env vars at request time (not module level) for Cloudflare Workers compatibility
  const PAYPAL_PLAN_MAP: Record<string, string | undefined> = {
    basic: process.env.PAYPAL_PLAN_BASIC,
    pro: process.env.PAYPAL_PLAN_PRO,
  };

  const paypalPlanId = PAYPAL_PLAN_MAP[planId];
  if (!paypalPlanId) {
    return NextResponse.json(
      { error: `PayPal plan ID not configured for plan '${planId}'.` },
      { status: 500 }
    );
  }

  // --- Branch 1: frontend already created the subscription via JS SDK ---
  if (subscriptionId) {
    let subDetails;
    try {
      subDetails = await getSubscription(subscriptionId);
    } catch (err) {
      console.error("[PayPal] getSubscription error:", err);
      return NextResponse.json(
        { error: "Failed to verify subscription with PayPal." },
        { status: 502 }
      );
    }

    if (subDetails.status !== "ACTIVE" && subDetails.status !== "APPROVED") {
      return NextResponse.json(
        { error: `Subscription status is '${subDetails.status}', expected ACTIVE or APPROVED.` },
        { status: 400 }
      );
    }

    const db = getD1();

    // Check if user has an existing subscription — cancel it if different
    const userRow = await db
      .prepare("SELECT paypal_subscription_id FROM user WHERE id = ?")
      .bind(userId)
      .first<{ paypal_subscription_id: string | null }>();

    const oldSubId = userRow?.paypal_subscription_id ?? null;
    if (oldSubId && oldSubId !== subscriptionId) {
      try {
        await paypalCancel(oldSubId, "Replaced by new subscription");
      } catch (err) {
        console.warn(
          `[PayPal] Failed to cancel old subscription ${oldSubId}:`,
          err
        );
      }
    }

    // Update user record
    const expiresAt = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60; // +30 days
    await db
      .prepare(
        `UPDATE user SET
           plan = ?,
           plan_expires_at = ?,
           paypal_subscription_id = ?,
           paypal_email = ?,
           subscription_status = 'active'
         WHERE id = ?`
      )
      .bind(planId, expiresAt, subscriptionId, subDetails.subscriberEmail, userId)
      .run();

    // Record transaction
    await recordTransaction({
      userId,
      type: "subscription",
      amountUsd: PLANS[planId as PlanId].priceUsd,
      plan: planId,
      paypalTransactionId: subscriptionId,
      status: "completed",
    });

    return NextResponse.json({ success: true, plan: planId, expiresAt });
  }

  // --- Branch 2: server-side subscription creation fallback ---
  try {
    const result = await createSubscription(paypalPlanId);
    return NextResponse.json({
      subscriptionId: result.subscriptionId,
      approveUrl: result.approveUrl,
    });
  } catch (err) {
    console.error("[PayPal] createSubscription error:", err);
    return NextResponse.json(
      { error: "Failed to create subscription. Please try again." },
      { status: 500 }
    );
  }
}
