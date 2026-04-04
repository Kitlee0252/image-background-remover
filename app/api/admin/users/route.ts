import { NextRequest, NextResponse } from "next/server";
import { auth } from "../../../../auth";
import { isAdmin } from "@/lib/admin";
import { getD1 } from "@/lib/db";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!isAdmin(session?.user?.email)) {
    return NextResponse.json({}, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") ?? "";
  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") ?? "20", 10), 1), 100);
  const offset = Math.max(parseInt(searchParams.get("offset") ?? "0", 10), 0);

  const db = getD1();

  const whereClause = search ? "WHERE u.email LIKE ?" : "";
  const searchParam = `%${search}%`;

  const countSql = `SELECT COUNT(*) as total FROM user u ${whereClause}`;
  const listSql = `
    SELECT
      u.id,
      u.email,
      u.name,
      u.plan,
      u.subscription_status,
      u.created_at,
      COALESCE(c.balance, 0) as credit_balance
    FROM user u
    LEFT JOIN credits c ON u.id = c.user_id
    ${whereClause}
    ORDER BY u.created_at DESC
    LIMIT ? OFFSET ?
  `;

  type UserRow = {
    id: string;
    email: string;
    name: string | null;
    plan: string | null;
    subscription_status: string | null;
    created_at: number | null;
    credit_balance: number;
  };

  const [countResult, listResult] = await Promise.all([
    search
      ? db.prepare(countSql).bind(searchParam).first<{ total: number }>()
      : db.prepare(countSql).first<{ total: number }>(),
    search
      ? db.prepare(listSql).bind(searchParam, limit, offset).all<UserRow>()
      : db.prepare(listSql).bind(limit, offset).all<UserRow>(),
  ]);

  const total = countResult?.total ?? 0;
  const users = (listResult.results ?? []).map((row: UserRow) => ({
    id: row.id,
    email: row.email,
    name: row.name,
    plan: row.plan ?? "free",
    creditBalance: row.credit_balance,
    subscriptionStatus: row.subscription_status,
    createdAt: row.created_at,
  }));

  return NextResponse.json({ users, total });
}
