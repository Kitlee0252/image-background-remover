import { NextResponse } from "next/server";
import { auth } from "../../../../auth";
import { cancelSubscription } from "@/lib/paypal";
import { getD1 } from "@/lib/db";

export async function POST() {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 }
    );
  }

  const userId = session.user.id;
  const db = getD1();

  // Look up the user's active PayPal subscription ID
  const userRow = await db
    .prepare("SELECT paypal_subscription_id FROM user WHERE id = ?")
    .bind(userId)
    .first<{ paypal_subscription_id: string | null }>();

  const subId = userRow?.paypal_subscription_id ?? null;
  if (!subId) {
    return NextResponse.json(
      { error: "No active subscription." },
      { status: 400 }
    );
  }

  // Cancel via PayPal API
  try {
    await cancelSubscription(subId, "User requested cancellation");
  } catch (err) {
    console.error("[PayPal] cancelSubscription error:", err);
    return NextResponse.json(
      { error: "Failed to cancel subscription with PayPal. Please try again." },
      { status: 502 }
    );
  }

  // Update subscription_status — keep plan and plan_expires_at unchanged
  // so the user retains access until the period ends
  await db
    .prepare(
      "UPDATE user SET subscription_status = 'cancelled' WHERE id = ?"
    )
    .bind(userId)
    .run();

  return NextResponse.json({ success: true });
}
