import { getD1 } from "./db";

export async function getCreditBalance(userId: string): Promise<number> {
  const db = getD1();
  const row = await db
    .prepare("SELECT balance FROM credits WHERE user_id = ?")
    .bind(userId)
    .first<{ balance: number }>();
  return row?.balance ?? 0;
}

export async function addCredits(userId: string, amount: number): Promise<number> {
  const db = getD1();
  const now = Math.floor(Date.now() / 1000);
  await db
    .prepare(
      `INSERT INTO credits (user_id, balance, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         balance = balance + ?,
         updated_at = ?`
    )
    .bind(userId, amount, now, amount, now)
    .run();
  return getCreditBalance(userId);
}

export async function deductCredits(userId: string, amount: number): Promise<boolean> {
  const db = getD1();
  const now = Math.floor(Date.now() / 1000);
  const result = await db
    .prepare(
      `UPDATE credits SET balance = balance - ?, updated_at = ?
       WHERE user_id = ? AND balance >= ?`
    )
    .bind(amount, now, userId, amount)
    .run();
  return (result.meta?.changes ?? 0) > 0;
}

export async function deductCredit(userId: string): Promise<boolean> {
  const db = getD1();
  const now = Math.floor(Date.now() / 1000);
  const result = await db
    .prepare(
      `UPDATE credits SET balance = balance - 1, updated_at = ?
       WHERE user_id = ? AND balance > 0`
    )
    .bind(now, userId)
    .run();
  return (result.meta?.changes ?? 0) > 0;
}

export async function recordTransaction(params: {
  userId: string;
  type: "credit_purchase" | "subscription" | "subscription_renewal" | "overage" | "refund" | "admin_adjustment";
  amountUsd: number;
  creditsAdded?: number;
  plan?: string;
  paypalTransactionId?: string;
  status?: "completed" | "pending" | "refunded";
  note?: string;
}): Promise<void> {
  const db = getD1();
  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  await db
    .prepare(
      `INSERT INTO transactions (id, user_id, type, amount_usd, credits_added, plan, paypal_transaction_id, status, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, params.userId, params.type, params.amountUsd, params.creditsAdded ?? null, params.plan ?? null, params.paypalTransactionId ?? null, params.status ?? "completed", params.note ?? null, now)
    .run();
}

export async function getTransactions(
  userId: string,
  limit: number = 10,
  offset: number = 0
): Promise<Array<{
  id: string;
  type: string;
  amount_usd: number;
  credits_added: number | null;
  plan: string | null;
  status: string;
  note: string | null;
  created_at: number;
}>> {
  const db = getD1();
  const { results } = await db
    .prepare(
      `SELECT id, type, amount_usd, credits_added, plan, status, note, created_at
       FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`
    )
    .bind(userId, limit, offset)
    .all();
  return results as any[];
}
