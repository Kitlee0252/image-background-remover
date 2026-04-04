import { NextRequest, NextResponse } from "next/server";
import { auth } from "../../../../../../auth";
import { isAdmin } from "@/lib/admin";
import { getD1 } from "@/lib/db";
import { PLANS } from "@/lib/plans";
import type { PlanId } from "@/lib/plans";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!isAdmin(session?.user?.email)) {
    return NextResponse.json({}, { status: 404 });
  }

  const { id } = await params;
  const db = getD1();

  const [user, body] = await Promise.all([
    db.prepare("SELECT id, plan FROM user WHERE id = ?").bind(id).first<{ id: string; plan: string }>(),
    req.json() as Promise<{ plan: string; expiresAt: string | null }>,
  ]);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const { plan, expiresAt } = body;

  if (!(plan in PLANS)) {
    return NextResponse.json({ error: "Invalid plan. Must be free, basic, or pro." }, { status: 400 });
  }

  let planExpiresAt: number | null = null;

  if (plan === "free") {
    await db
      .prepare(
        `UPDATE user SET plan = ?, plan_expires_at = NULL,
         paypal_subscription_id = NULL, subscription_status = NULL
         WHERE id = ?`
      )
      .bind(plan, id)
      .run();
  } else {
    if (!expiresAt) {
      return NextResponse.json({ error: "expiresAt is required for paid plans" }, { status: 400 });
    }

    planExpiresAt = Math.floor(new Date(expiresAt).getTime() / 1000);
    if (isNaN(planExpiresAt)) {
      return NextResponse.json({ error: "Invalid expiresAt date" }, { status: 400 });
    }

    await db
      .prepare(
        `UPDATE user SET plan = ?, plan_expires_at = ?, subscription_status = 'active'
         WHERE id = ?`
      )
      .bind(plan, planExpiresAt, id)
      .run();
  }

  return NextResponse.json({
    success: true,
    user: { plan, planExpiresAt },
  });
}
