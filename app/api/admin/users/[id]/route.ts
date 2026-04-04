import { NextRequest, NextResponse } from "next/server";
import { auth } from "../../../../../auth";
import { isAdmin } from "@/lib/admin";
import { getD1 } from "@/lib/db";
import { getCreditBalance, getTransactions } from "@/lib/credits";
import { getMonthlyUsage } from "@/lib/usage";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!isAdmin(session?.user?.email)) {
    return NextResponse.json({}, { status: 404 });
  }

  const { id } = await params;

  const db = getD1();

  type UserRow = {
    id: string;
    email: string;
    name: string | null;
    image: string | null;
    plan: string | null;
    plan_expires_at: number | null;
    subscription_status: string | null;
    paypal_subscription_id: string | null;
    created_at: number;
  };

  const row = await db
    .prepare(
      "SELECT id, email, name, image, plan, plan_expires_at, subscription_status, paypal_subscription_id, created_at FROM user WHERE id = ?"
    )
    .bind(id)
    .first<UserRow>();

  if (!row) {
    return NextResponse.json({}, { status: 404 });
  }

  const [creditBalance, transactions, monthlyUsage] = await Promise.all([
    getCreditBalance(id),
    getTransactions(id, 10, 0),
    getMonthlyUsage(id),
  ]);

  return NextResponse.json({
    user: {
      id: row.id,
      email: row.email,
      name: row.name,
      image: row.image,
      plan: row.plan ?? "free",
      planExpiresAt: row.plan_expires_at,
      subscriptionStatus: row.subscription_status,
      paypalSubscriptionId: row.paypal_subscription_id,
      createdAt: row.created_at,
    },
    creditBalance,
    monthlyUsage,
    transactions,
  });
}
