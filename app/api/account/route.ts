import { NextRequest, NextResponse } from "next/server";
import { auth } from "../../../auth";
import { checkPlanExpiry, getMonthlyUsage } from "@/lib/usage";
import { getCreditBalance, getTransactions } from "@/lib/credits";
import { PLANS, CREDIT_PACKS, getEffectivePlan, type PlanId } from "@/lib/plans";
import { getD1 } from "@/lib/db";

export async function GET(req: NextRequest) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 }
    );
  }

  const userId = session.user.id;

  // Parse pagination params
  const { searchParams } = new URL(req.url);
  const transactionsLimit = Math.min(
    Math.max(parseInt(searchParams.get("transactions_limit") || "10", 10), 1),
    50
  );
  const transactionsOffset = Math.max(
    parseInt(searchParams.get("transactions_offset") || "0", 10),
    0
  );

  // Run all queries in parallel
  const [plan, usage, credits, recentTransactions, userRow] = await Promise.all([
    checkPlanExpiry(userId),
    getMonthlyUsage(userId),
    getCreditBalance(userId),
    getTransactions(userId, transactionsLimit, transactionsOffset),
    getD1()
      .prepare(
        "SELECT plan, plan_expires_at, paypal_email, paypal_subscription_id FROM user WHERE id = ?"
      )
      .bind(userId)
      .first<{
        plan: string;
        plan_expires_at: number | null;
        paypal_email: string | null;
        paypal_subscription_id: string | null;
      }>(),
  ]);

  const planId = (plan as PlanId) || "free";
  const planConfig = PLANS[planId] ?? PLANS.free;
  const effectivePlan = getEffectivePlan(planId, credits);

  return NextResponse.json({
    plan: planId,
    planConfig,
    effectivePlan,
    credits,
    usage: {
      used: usage.used,
      limit: usage.limit,
    },
    subscription: {
      planExpiresAt: userRow?.plan_expires_at ?? null,
      paypalEmail: userRow?.paypal_email ?? null,
      paypalSubscriptionId: userRow?.paypal_subscription_id ?? null,
    },
    recentTransactions,
    plans: PLANS,
    creditPacks: CREDIT_PACKS,
  });
}
