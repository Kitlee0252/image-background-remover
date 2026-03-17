import { NextResponse } from "next/server";
import { auth } from "../../../auth";
import { getMonthlyUsage } from "@/lib/usage";

export async function GET() {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 }
    );
  }

  const usage = await getMonthlyUsage(session.user.id);

  return NextResponse.json(usage);
}
