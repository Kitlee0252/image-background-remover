"use client";

import { useState, useEffect, useCallback } from "react";

interface UserListItem {
  id: string;
  email: string;
  name: string | null;
  plan: string;
  creditBalance: number;
  subscriptionStatus: string | null;
  createdAt: number;
}

interface UserDetail {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  plan: string;
  planExpiresAt: number | null;
  subscriptionStatus: string | null;
  paypalSubscriptionId: string | null;
  createdAt: number;
}

interface MonthlyUsage {
  used: number;
  limit: number;
  plan: string;
}

interface Transaction {
  id: string;
  type: string;
  amount_usd: number;
  credits_added: number | null;
  note: string | null;
  status: string;
  created_at: number;
}

function PlanBadge({ plan }: { plan: string }) {
  const cls =
    plan === "pro"
      ? "bg-purple-900/50 text-purple-300"
      : plan === "basic"
        ? "bg-blue-900/50 text-blue-300"
        : "bg-gray-800 text-gray-400";
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium capitalize ${cls}`}>
      {plan}
    </span>
  );
}

function StatusMsg({
  msg,
  onDismiss,
}: {
  msg: { type: "success" | "error"; text: string };
  onDismiss: () => void;
}) {
  const cls =
    msg.type === "success"
      ? "border-green-800/50 bg-green-900/20 text-green-300"
      : "border-red-800/50 bg-red-900/20 text-red-300";
  return (
    <div className={`mb-4 rounded-lg border px-4 py-3 text-sm ${cls}`}>
      {msg.text}
      <button onClick={onDismiss} className="ml-2 text-xs opacity-60 hover:opacity-100">
        ×
      </button>
    </div>
  );
}

// ─── User List View ──────────────────────────────────────────────────────────

function UserListView({ onSelectUser }: { onSelectUser: (id: string) => void }) {
  const [search, setSearch] = useState("");
  const [inputValue, setInputValue] = useState("");
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);

  const LIMIT = 20;

  const fetchUsers = useCallback(
    async (searchTerm: string, pageNum: number) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          limit: String(LIMIT),
          offset: String(pageNum * LIMIT),
        });
        if (searchTerm) params.set("search", searchTerm);
        const res = await fetch(`/api/admin/users?${params}`);
        if (!res.ok) throw new Error("Failed to fetch users");
        const data = (await res.json()) as { users: UserListItem[]; total: number };
        setUsers(data.users);
        setTotal(data.total);
      } catch (err) {
        console.error("[Admin] fetchUsers", err);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    fetchUsers(search, page);
  }, [fetchUsers, search, page]);

  const handleSearch = () => {
    setPage(0);
    setSearch(inputValue);
  };

  const handleClear = () => {
    setInputValue("");
    setPage(0);
    setSearch("");
  };

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="mb-6 text-2xl font-bold">Admin — Users</h1>

      {/* Search */}
      <div className="mb-6 flex gap-2">
        <input
          type="text"
          placeholder="Search by email…"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          className="rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:border-gray-500 focus:outline-none"
        />
        <button
          onClick={handleSearch}
          className="rounded bg-gray-800 px-4 py-2 text-sm font-medium hover:bg-gray-700"
        >
          Search
        </button>
        {(inputValue || search) && (
          <button
            onClick={handleClear}
            className="rounded border border-gray-700 px-4 py-2 text-sm text-gray-400 hover:border-gray-500 hover:text-gray-300"
          >
            Clear
          </button>
        )}
        <span className="ml-auto flex items-center text-sm text-gray-500">
          {loading ? "Loading…" : `${total} user${total !== 1 ? "s" : ""}`}
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-gray-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 bg-gray-900 text-left text-xs text-gray-500 uppercase tracking-wider">
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Plan</th>
              <th className="px-4 py-3 text-right">Credits</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {users.length === 0 && !loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  No users found.
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <tr
                  key={u.id}
                  onClick={() => onSelectUser(u.id)}
                  className="cursor-pointer bg-gray-950 transition hover:bg-gray-900"
                >
                  <td className="px-4 py-3 font-medium">{u.email}</td>
                  <td className="px-4 py-3 text-gray-400">{u.name ?? "—"}</td>
                  <td className="px-4 py-3">
                    <PlanBadge plan={u.plan} />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{u.creditBalance}</td>
                  <td className="px-4 py-3 text-gray-400 capitalize">
                    {u.subscriptionStatus ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(u.createdAt * 1000).toLocaleDateString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0 || loading}
            className="rounded bg-gray-800 px-4 py-2 font-medium hover:bg-gray-700 disabled:opacity-40"
          >
            ← Prev
          </button>
          <span className="text-gray-500">
            Page {page + 1} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1 || loading}
            className="rounded bg-gray-800 px-4 py-2 font-medium hover:bg-gray-700 disabled:opacity-40"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}

// ─── User Detail View ────────────────────────────────────────────────────────

function UserDetailView({ userId, onBack }: { userId: string; onBack: () => void }) {
  const [user, setUser] = useState<UserDetail | null>(null);
  const [creditBalance, setCreditBalance] = useState<number>(0);
  const [monthlyUsage, setMonthlyUsage] = useState<MonthlyUsage | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusMsg, setStatusMsg] = useState<{ type: "success" | "error"; text: string } | null>(
    null,
  );

  // Credit form state
  const [creditAmount, setCreditAmount] = useState("");
  const [creditReason, setCreditReason] = useState("");
  const [creditLoading, setCreditLoading] = useState(false);

  // Plan form state
  const [selectedPlan, setSelectedPlan] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [planLoading, setPlanLoading] = useState(false);

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}`);
      if (!res.ok) throw new Error("Failed to fetch user");
      const data = (await res.json()) as {
        user: UserDetail;
        creditBalance: number;
        monthlyUsage: MonthlyUsage;
        transactions: Transaction[];
      };
      setUser(data.user);
      setCreditBalance(data.creditBalance);
      setMonthlyUsage(data.monthlyUsage);
      setTransactions(data.transactions ?? []);
      setSelectedPlan(data.user.plan);
    } catch (err) {
      console.error("[Admin] fetchDetail", err);
      setStatusMsg({ type: "error", text: "Failed to load user details." });
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  const handleAdjustCredits = async () => {
    const amount = parseInt(creditAmount, 10);
    if (isNaN(amount) || amount === 0) {
      setStatusMsg({ type: "error", text: "Enter a non-zero integer amount." });
      return;
    }
    if (!creditReason.trim()) {
      setStatusMsg({ type: "error", text: "Reason is required." });
      return;
    }
    setCreditLoading(true);
    setStatusMsg(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}/credits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, reason: creditReason.trim() }),
      });
      const data = (await res.json()) as { error?: string; newBalance?: number };
      if (!res.ok) throw new Error(data.error || "Failed to adjust credits");
      setCreditBalance(data.newBalance ?? 0);
      setCreditAmount("");
      setCreditReason("");
      setStatusMsg({
        type: "success",
        text: `Credits adjusted. New balance: ${data.newBalance}`,
      });
    } catch (err: unknown) {
      setStatusMsg({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to adjust credits.",
      });
    } finally {
      setCreditLoading(false);
    }
  };

  const handleChangePlan = async () => {
    if (!selectedPlan) return;
    setPlanLoading(true);
    setStatusMsg(null);
    try {
      const body: { plan: string; expiresAt: string | null } = {
        plan: selectedPlan,
        expiresAt: selectedPlan !== "free" && expiresAt ? expiresAt : null,
      };
      const res = await fetch(`/api/admin/users/${userId}/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { error?: string; user?: { plan: string; planExpiresAt: number | null } };
      if (!res.ok) throw new Error(data.error || "Failed to update plan");
      setUser((prev) =>
        prev && data.user
          ? {
              ...prev,
              plan: data.user.plan,
              planExpiresAt: data.user.planExpiresAt,
            }
          : prev,
      );
      setStatusMsg({ type: "success", text: `Plan updated to ${data.user?.plan ?? selectedPlan}.` });
    } catch (err: unknown) {
      setStatusMsg({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to update plan.",
      });
    } finally {
      setPlanLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-8 text-gray-500">Loading user details…</div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-8">
        <button onClick={onBack} className="mb-4 text-sm text-gray-400 hover:text-white">
          ← Back to users
        </button>
        <p className="text-red-400">User not found.</p>
      </div>
    );
  }

  const usagePercent = monthlyUsage
    ? Math.min(100, Math.round((monthlyUsage.used / monthlyUsage.limit) * 100))
    : 0;

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      {/* Back */}
      <button
        onClick={onBack}
        className="mb-6 text-sm text-gray-400 transition hover:text-white"
      >
        ← Back to users
      </button>

      {/* Status message */}
      {statusMsg && (
        <StatusMsg msg={statusMsg} onDismiss={() => setStatusMsg(null)} />
      )}

      {/* User info card */}
      <div className="mb-6 flex items-center gap-4 rounded-lg border border-gray-800 bg-gray-900 p-4">
        {user.image ? (
          <img src={user.image} alt="" className="h-12 w-12 rounded-full" />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-700 text-lg font-bold text-gray-400">
            {(user.name ?? user.email)[0].toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="font-semibold">{user.name ?? "—"}</div>
          <div className="text-sm text-gray-400">{user.email}</div>
          <div className="mt-0.5 text-xs text-gray-600">ID: {user.id}</div>
        </div>
      </div>

      {/* Status cards */}
      <div className="mb-6 grid grid-cols-4 gap-4">
        {/* Plan card */}
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <div className="mb-2 text-xs text-gray-500 uppercase tracking-wider">Plan</div>
          <PlanBadge plan={user.plan} />
          {user.planExpiresAt && (
            <div className="mt-2 text-xs text-gray-500">
              Expires {new Date(user.planExpiresAt * 1000).toLocaleDateString()}
            </div>
          )}
        </div>

        {/* Monthly Usage card */}
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <div className="mb-2 text-xs text-gray-500 uppercase tracking-wider">Monthly Usage</div>
          {monthlyUsage ? (
            <>
              <div className="text-2xl font-bold tabular-nums">
                {monthlyUsage.used}
                <span className="text-sm font-normal text-gray-500">/{monthlyUsage.limit}</span>
              </div>
              <div className="mt-2 h-1.5 w-full rounded-full bg-gray-800">
                <div
                  className={`h-1.5 rounded-full ${usagePercent >= 90 ? "bg-red-500" : usagePercent >= 70 ? "bg-yellow-500" : "bg-green-500"}`}
                  style={{ width: `${usagePercent}%` }}
                />
              </div>
            </>
          ) : (
            <div className="text-sm text-gray-500">—</div>
          )}
        </div>

        {/* Credits card */}
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <div className="mb-2 text-xs text-gray-500 uppercase tracking-wider">Credits</div>
          <div className="text-2xl font-bold tabular-nums">{creditBalance}</div>
        </div>

        {/* Subscription card */}
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <div className="mb-2 text-xs text-gray-500 uppercase tracking-wider">Subscription</div>
          <div className="text-sm capitalize">{user.subscriptionStatus ?? "none"}</div>
          {user.paypalSubscriptionId && (
            <div
              className="mt-1 truncate text-xs text-gray-600"
              title={user.paypalSubscriptionId}
            >
              {user.paypalSubscriptionId}
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="mb-6 grid gap-4 md:grid-cols-2">
        {/* Adjust Credits */}
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <h3 className="mb-3 text-sm font-semibold">Adjust Credits</h3>
          <div className="space-y-2">
            <input
              type="number"
              placeholder="Amount (negative to deduct)"
              value={creditAmount}
              onChange={(e) => setCreditAmount(e.target.value)}
              className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:border-gray-500 focus:outline-none"
            />
            <input
              type="text"
              placeholder="Reason"
              value={creditReason}
              onChange={(e) => setCreditReason(e.target.value)}
              className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:border-gray-500 focus:outline-none"
            />
            <button
              onClick={handleAdjustCredits}
              disabled={creditLoading}
              className="w-full rounded bg-blue-700 px-4 py-2 text-sm font-medium hover:bg-blue-600 disabled:opacity-50"
            >
              {creditLoading ? "Applying…" : "Apply"}
            </button>
          </div>
        </div>

        {/* Change Plan */}
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <h3 className="mb-3 text-sm font-semibold">Change Plan</h3>
          <div className="space-y-2">
            <select
              value={selectedPlan}
              onChange={(e) => setSelectedPlan(e.target.value)}
              className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:border-gray-500 focus:outline-none"
            >
              <option value="free">Free</option>
              <option value="basic">Basic</option>
              <option value="pro">Pro</option>
            </select>
            {selectedPlan !== "free" && (
              <input
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:border-gray-500 focus:outline-none"
              />
            )}
            <button
              onClick={handleChangePlan}
              disabled={planLoading}
              className="w-full rounded bg-purple-700 px-4 py-2 text-sm font-medium hover:bg-purple-600 disabled:opacity-50"
            >
              {planLoading ? "Updating…" : "Update Plan"}
            </button>
          </div>
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
        <h3 className="mb-3 text-sm font-semibold">Recent Transactions</h3>
        {transactions.length === 0 ? (
          <p className="text-sm text-gray-500">No transactions yet.</p>
        ) : (
          <div className="space-y-2">
            {transactions.map((tx) => (
              <div
                key={tx.id}
                className="flex items-center justify-between rounded border border-gray-800 bg-gray-950 px-3 py-2 text-sm"
              >
                <div>
                  <div className="font-medium capitalize">{tx.type.replace(/_/g, " ")}</div>
                  {tx.note && (
                    <div className="text-xs text-gray-400">{tx.note}</div>
                  )}
                  <div className="text-xs text-gray-500">
                    {new Date(tx.created_at * 1000).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </div>
                </div>
                <div className="text-right">
                  <div className="tabular-nums">${tx.amount_usd.toFixed(2)}</div>
                  {tx.credits_added != null && tx.credits_added !== 0 && (
                    <div
                      className={`text-xs ${tx.credits_added > 0 ? "text-green-400" : "text-red-400"}`}
                    >
                      {tx.credits_added > 0 ? "+" : ""}
                      {tx.credits_added} credits
                    </div>
                  )}
                  <div className="text-xs capitalize text-gray-500">{tx.status}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <p className="mt-6 text-xs text-gray-600">
        Account created {new Date(user.createdAt * 1000).toLocaleString()}
      </p>
    </div>
  );
}

// ─── Page Root ───────────────────────────────────────────────────────────────

export default function AdminPage() {
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  return (
    <div>
      {selectedUserId ? (
        <UserDetailView userId={selectedUserId} onBack={() => setSelectedUserId(null)} />
      ) : (
        <UserListView onSelectUser={setSelectedUserId} />
      )}
    </div>
  );
}
