import { NextRequest, NextResponse } from "next/server";
import { auth } from "../../../../../../auth";
import { isAdmin } from "@/lib/admin";
import { getD1 } from "@/lib/db";
import { addCredits, deductCredits, getCreditBalance, recordTransaction } from "@/lib/credits";

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
    db.prepare("SELECT id FROM user WHERE id = ?").bind(id).first(),
    req.json() as Promise<{ amount: number; reason: string }>,
  ]);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const { amount, reason } = body;

  if (!amount || typeof amount !== "number" || amount === 0) {
    return NextResponse.json({ error: "amount must be a non-zero number" }, { status: 400 });
  }
  if (!reason || typeof reason !== "string" || reason.trim().length === 0) {
    return NextResponse.json({ error: "reason is required" }, { status: 400 });
  }

  let newBalance: number;
  if (amount > 0) {
    newBalance = await addCredits(id, amount);
  } else {
    const success = await deductCredits(id, Math.abs(amount));
    if (!success) {
      return NextResponse.json({ error: "Insufficient balance" }, { status: 400 });
    }
    newBalance = await getCreditBalance(id);
  }

  await recordTransaction({
    userId: id,
    type: "admin_adjustment",
    amountUsd: 0,
    creditsAdded: amount,
    status: "completed",
    note: reason.trim(),
  });

  return NextResponse.json({ success: true, newBalance });
}
