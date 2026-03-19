import { NextRequest, NextResponse } from "next/server";
import { auth } from "../../../../auth";
import { CREDIT_PACKS } from "@/lib/plans";
import { createOrder } from "@/lib/paypal";

export async function POST(req: NextRequest) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 }
    );
  }

  let packId: string;
  try {
    const body = await req.json() as { packId: string };
    packId = body.packId;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const pack = CREDIT_PACKS.find((p) => p.id === packId);
  if (!pack) {
    return NextResponse.json({ error: "Invalid credit pack." }, { status: 400 });
  }

  const description = `${pack.label} Credit Pack — ${pack.credits} credits`;

  try {
    const orderId = await createOrder(pack.priceUsd.toFixed(2), description);
    return NextResponse.json({ orderId });
  } catch (err) {
    console.error("[PayPal] create-order error:", err);
    return NextResponse.json(
      { error: "Failed to create PayPal order. Please try again." },
      { status: 500 }
    );
  }
}
