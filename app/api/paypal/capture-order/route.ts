import { NextRequest, NextResponse } from "next/server";
import { auth } from "../../../../auth";
import { CREDIT_PACKS } from "@/lib/plans";
import { captureOrder } from "@/lib/paypal";
import { addCredits, recordTransaction } from "@/lib/credits";

export async function POST(req: NextRequest) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 }
    );
  }

  const userId = session.user.id;

  let orderId: string;
  let packId: string;
  try {
    const body = await req.json();
    orderId = body.orderId;
    packId = body.packId;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!orderId) {
    return NextResponse.json({ error: "orderId is required." }, { status: 400 });
  }

  const pack = CREDIT_PACKS.find((p) => p.id === packId);
  if (!pack) {
    return NextResponse.json({ error: "Invalid credit pack." }, { status: 400 });
  }

  let result;
  try {
    result = await captureOrder(orderId);
  } catch (err) {
    console.error("[PayPal] capture-order error:", err);
    return NextResponse.json(
      { error: "Failed to capture PayPal order. Please try again." },
      { status: 500 }
    );
  }

  if (result.status !== "COMPLETED") {
    return NextResponse.json(
      { error: `Payment not completed. Status: ${result.status}` },
      { status: 402 }
    );
  }

  if (parseFloat(result.amount) !== pack.priceUsd) {
    console.error(
      `[PayPal] Amount mismatch: expected ${pack.priceUsd}, got ${result.amount}`
    );
    return NextResponse.json(
      { error: "Payment amount mismatch." },
      { status: 402 }
    );
  }

  try {
    const newBalance = await addCredits(userId, pack.credits);

    await recordTransaction({
      userId,
      type: "credit_purchase",
      amountUsd: pack.priceUsd,
      creditsAdded: pack.credits,
      paypalTransactionId: result.captureId,
      status: "completed",
    });

    return NextResponse.json({
      success: true,
      credits: newBalance,
      payerEmail: result.payerEmail,
    });
  } catch (err) {
    console.error("[PayPal] post-capture DB error:", err);
    return NextResponse.json(
      { error: "Payment captured but failed to update credits. Please contact support." },
      { status: 500 }
    );
  }
}
