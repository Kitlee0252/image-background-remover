"use client";

import Link from "next/link";
import type { Session } from "next-auth";

interface AccountData {
  plan: string;
  credits: number;
  usage: { used: number; limit: number };
  recentTransactions: Array<{
    id: string;
    type: string;
    amount_usd: number;
    credits_added: number | null;
    plan: string | null;
    status: string;
    created_at: number;
  }>;
}

interface OverviewTabProps {
  session: Session;
  accountData: AccountData;
}

function PlanBadge({ plan }: { plan: string }) {
  const styles: Record<string, string> = {
    free: "bg-gray-100 text-gray-700",
    basic: "bg-blue-100 text-blue-700",
    pro: "bg-purple-100 text-purple-700",
  };
  const style = styles[plan] ?? styles.free;
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${style}`}
    >
      {plan} Plan
    </span>
  );
}

function formatTransactionType(type: string): string {
  const labels: Record<string, string> = {
    credit_purchase: "Credit Purchase",
    subscription: "Subscription",
    subscription_renewal: "Subscription Renewal",
    overage: "Overage Charge",
    refund: "Refund",
  };
  return labels[type] ?? type;
}

function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function OverviewTab({ session, accountData }: OverviewTabProps) {
  const { plan, credits, usage, recentTransactions } = accountData;
  const user = session.user;
  const usagePercent = usage.limit > 0 ? (usage.used / usage.limit) * 100 : 0;

  let progressColor = "bg-indigo-500";
  if (usagePercent >= 100) progressColor = "bg-red-500";
  else if (usagePercent >= 80) progressColor = "bg-orange-500";

  return (
    <div className="space-y-6">
      {/* Profile card */}
      <div className="rounded-xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-center gap-4">
          {user?.image ? (
            <img
              src={user.image}
              alt={user.name || "User"}
              width={56}
              height={56}
              className="rounded-full"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="w-14 h-14 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xl font-semibold">
              {(user?.name || "U").charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-gray-900">
                {user?.name || "User"}
              </h2>
              <PlanBadge plan={plan} />
            </div>
            <p className="text-sm text-gray-500">{user?.email}</p>
          </div>
        </div>
      </div>

      {/* Usage + Credits row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {/* Usage summary */}
        <div className="rounded-xl border border-gray-100 shadow-sm p-6">
          <h3 className="text-sm font-medium text-gray-500 mb-3">
            Monthly Usage
          </h3>
          <div className="flex items-baseline gap-1 mb-3">
            <span className="text-3xl font-bold text-gray-900">
              {usage.used}
            </span>
            <span className="text-lg text-gray-400">/ {usage.limit}</span>
            <span className="text-sm text-gray-500 ml-1">images</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className={`${progressColor} h-2 rounded-full transition-all`}
              style={{
                width: `${Math.min(usagePercent, 100)}%`,
              }}
            />
          </div>
          {usagePercent >= 100 && (
            <p className="text-xs text-red-600 mt-2">
              Quota reached. Buy credits or upgrade to continue.
            </p>
          )}
        </div>

        {/* Credits balance */}
        <div className="rounded-xl border border-gray-100 shadow-sm p-6">
          <h3 className="text-sm font-medium text-gray-500 mb-3">
            Credits Balance
          </h3>
          <div className="flex items-baseline gap-1 mb-1">
            <span className="text-3xl font-bold text-gray-900">{credits}</span>
            <span className="text-sm text-gray-500 ml-1">credits</span>
          </div>
          <p className="text-xs text-gray-400">Credits never expire</p>
        </div>
      </div>

      {/* Quick actions */}
      <div className="flex gap-3">
        <Link
          href="/account?tab=plans"
          className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
        >
          Buy Credits
        </Link>
        <Link
          href="/account?tab=plans"
          className="px-4 py-2 text-sm font-medium text-indigo-600 border border-indigo-200 hover:bg-indigo-50 rounded-lg transition-colors"
        >
          Upgrade Plan
        </Link>
      </div>

      {/* Recent activity */}
      {recentTransactions.length > 0 && (
        <div className="rounded-xl border border-gray-100 shadow-sm p-6">
          <h3 className="text-sm font-medium text-gray-500 mb-4">
            Recent Activity
          </h3>
          <div className="space-y-3">
            {recentTransactions.slice(0, 5).map((tx) => (
              <div
                key={tx.id}
                className="flex items-center justify-between text-sm"
              >
                <div>
                  <p className="text-gray-900">
                    {formatTransactionType(tx.type)}
                  </p>
                  <p className="text-xs text-gray-400">
                    {formatDate(tx.created_at)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-gray-900 font-medium">
                    ${tx.amount_usd.toFixed(2)}
                  </p>
                  {tx.credits_added && (
                    <p className="text-xs text-green-600">
                      +{tx.credits_added} credits
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
