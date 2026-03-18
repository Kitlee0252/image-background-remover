import { getD1 } from "./db";

export const PLAN_LIMITS: Record<string, number> = {
  free: 3,
  basic: 40,
  pro: 100,
};

/**
 * Get the user's plan from the users table. Defaults to 'free'.
 */
export async function getUserPlan(userId: string): Promise<string> {
  const db = getD1();
  const row = await db
    .prepare("SELECT plan FROM user WHERE id = ?")
    .bind(userId)
    .first<{ plan: string }>();
  return row?.plan ?? "free";
}

/**
 * Count how many background removals the user has made this calendar month.
 * Returns { used, limit, plan }.
 */
export async function getMonthlyUsage(
  userId: string
): Promise<{ used: number; limit: number; plan: string }> {
  const plan = await getUserPlan(userId);
  const limit = PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;

  // First day of the current month at 00:00:00 UTC, as a unix timestamp (seconds)
  const now = new Date();
  const firstOfMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
  );
  const startTimestamp = Math.floor(firstOfMonth.getTime() / 1000);

  const db = getD1();
  const row = await db
    .prepare(
      "SELECT COUNT(*) as cnt FROM usage WHERE user_id = ? AND created_at >= ?"
    )
    .bind(userId, startTimestamp)
    .first<{ cnt: number }>();

  return { used: row?.cnt ?? 0, limit, plan };
}

/**
 * Record a single background-removal usage event.
 */
export async function recordUsage(
  userId: string,
  quality: string
): Promise<void> {
  const db = getD1();
  const now = Math.floor(Date.now() / 1000);
  await db
    .prepare(
      "INSERT INTO usage (user_id, quality, created_at) VALUES (?, ?, ?)"
    )
    .bind(userId, quality, now)
    .run();
}

/**
 * Check if a paid plan has expired. If so, downgrade to free.
 * Returns the effective plan id.
 */
export async function checkPlanExpiry(userId: string): Promise<string> {
  const db = getD1();
  const row = await db
    .prepare("SELECT plan, plan_expires_at FROM user WHERE id = ?")
    .bind(userId)
    .first<{ plan: string; plan_expires_at: number | null }>();

  if (!row) return "free";
  const plan = row.plan ?? "free";
  if (plan !== "free" && row.plan_expires_at) {
    const now = Math.floor(Date.now() / 1000);
    if (now > row.plan_expires_at) {
      await db
        .prepare("UPDATE user SET plan = 'free', plan_expires_at = NULL WHERE id = ?")
        .bind(userId)
        .run();
      return "free";
    }
  }
  return plan;
}
