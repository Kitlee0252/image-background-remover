"use client";

import Link from "next/link";
import TransactionHistory from "./TransactionHistory";

interface AccountData {
  plan: string;
  planConfig: { label: string };
  subscription: {
    planExpiresAt: number | null;
    paypalEmail: string | null;
    paypalSubscriptionId: string | null;
  };
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

interface BillingTabProps {
  accountData: AccountData;
}

function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default function BillingTab({ accountData }: BillingTabProps) {
  const { plan, planConfig, subscription, recentTransactions } = accountData;

  return (
    <div className="space-y-8">
      {/* Payment method */}
      <div className="rounded-xl border border-gray-100 shadow-sm p-6">
        <h3 className="text-sm font-medium text-gray-500 mb-4">
          Payment Method
        </h3>
        {subscription.paypalEmail ? (
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
              <svg
                className="w-6 h-6 text-blue-600"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M7.076 21.337H2.47a.641.641 0 0 1-.633-.74L4.944 3.72a.771.771 0 0 1 .76-.654h6.577c2.18 0 3.703.588 4.53 1.749.826 1.16.986 2.727.476 4.662-.04.152-.084.307-.134.467-.497 1.604-1.334 2.856-2.49 3.723-1.156.867-2.631 1.307-4.384 1.307H8.24a.773.773 0 0 0-.762.654l-.997 5.707a.642.642 0 0 1-.633.543l.228.06z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">PayPal</p>
              <p className="text-xs text-gray-500">
                {subscription.paypalEmail}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-400">
            No payment method on file. Add one when you upgrade or buy credits.
          </p>
        )}
      </div>

      {/* Current subscription */}
      <div className="rounded-xl border border-gray-100 shadow-sm p-6">
        <h3 className="text-sm font-medium text-gray-500 mb-4">
          Current Subscription
        </h3>
        {plan === "free" ? (
          <div>
            <p className="text-sm text-gray-900 mb-2">
              You are on the{" "}
              <span className="font-medium">Free Plan</span>.
            </p>
            <Link
              href="/account?tab=plans"
              className="text-sm text-indigo-600 hover:text-indigo-700 font-medium transition-colors"
            >
              Upgrade for more images and features
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-gray-900">
              <span className="font-medium capitalize">
                {planConfig.label} Plan
              </span>
            </p>
            {subscription.planExpiresAt && (
              <p className="text-xs text-gray-500">
                {subscription.planExpiresAt * 1000 > Date.now()
                  ? `Renews on ${formatDate(subscription.planExpiresAt)}`
                  : `Expired on ${formatDate(subscription.planExpiresAt)}`}
              </p>
            )}
            {subscription.paypalSubscriptionId && (
              <p className="text-xs text-gray-400">
                Subscription ID: {subscription.paypalSubscriptionId}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Transaction history */}
      <div className="rounded-xl border border-gray-100 shadow-sm p-6">
        <h3 className="text-sm font-medium text-gray-500 mb-4">
          Transaction History
        </h3>
        <TransactionHistory initialTransactions={recentTransactions} />
      </div>
    </div>
  );
}
