"use client";

import { useState } from "react";
import Link from "next/link";
import TransactionHistory from "./TransactionHistory";

interface AccountData {
  plan: string;
  planConfig: { label: string };
  subscription: {
    planExpiresAt: number | null;
    paypalEmail: string | null;
    paypalSubscriptionId: string | null;
    subscriptionStatus: string;
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
  onRefresh?: () => void;
}

function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default function BillingTab({ accountData, onRefresh }: BillingTabProps) {
  const { plan, planConfig, subscription, recentTransactions } = accountData;
  const [showConfirm, setShowConfirm] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelMessage, setCancelMessage] = useState<string>("");

  const subscriptionStatus = subscription.subscriptionStatus ?? "";
  const isCancelled = subscriptionStatus === "cancelled";
  const isSuspended = subscriptionStatus === "suspended";
  const canCancel = plan !== "free" && !isCancelled && !isSuspended;

  async function handleCancelConfirm() {
    setCancelling(true);
    try {
      const res = await fetch("/api/paypal/cancel-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok) {
        setCancelMessage(data.error || "Failed to cancel subscription. Please try again.");
      } else {
        setCancelMessage("Your subscription has been cancelled.");
        onRefresh?.();
      }
    } catch {
      setCancelMessage("An error occurred. Please try again.");
    } finally {
      setCancelling(false);
      setShowConfirm(false);
    }
  }

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
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-gray-900 capitalize">
                {planConfig.label} Plan
              </p>
              {isCancelled && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                  Cancelling
                </span>
              )}
              {isSuspended && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                  Suspended
                </span>
              )}
            </div>
            {subscription.planExpiresAt && (
              <p className="text-xs text-gray-500">
                {isCancelled
                  ? `Cancels on ${formatDate(subscription.planExpiresAt)}`
                  : subscription.planExpiresAt * 1000 > Date.now()
                  ? `Renews on ${formatDate(subscription.planExpiresAt)}`
                  : `Expired on ${formatDate(subscription.planExpiresAt)}`}
              </p>
            )}
            {subscription.paypalSubscriptionId && (
              <p className="text-xs text-gray-400">
                Subscription ID: {subscription.paypalSubscriptionId}
              </p>
            )}

            {cancelMessage && (
              <p className="text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2">
                {cancelMessage}
              </p>
            )}

            {canCancel && !showConfirm && (
              <button
                onClick={() => setShowConfirm(true)}
                className="mt-2 text-sm text-red-600 hover:text-red-700 font-medium transition-colors cursor-pointer"
              >
                Cancel Subscription
              </button>
            )}

            {showConfirm && (
              <div className="mt-3 p-4 rounded-lg border border-red-100 bg-red-50 space-y-3">
                <p className="text-sm text-gray-700">
                  Are you sure you want to cancel?{" "}
                  {subscription.planExpiresAt && (
                    <>
                      Your plan will remain active until{" "}
                      <span className="font-medium">
                        {formatDate(subscription.planExpiresAt)}
                      </span>
                      .
                    </>
                  )}
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={handleCancelConfirm}
                    disabled={cancelling}
                    className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg transition-colors cursor-pointer"
                  >
                    {cancelling ? "Cancelling..." : "Confirm Cancel"}
                  </button>
                  <button
                    onClick={() => setShowConfirm(false)}
                    disabled={cancelling}
                    className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 hover:bg-gray-50 disabled:opacity-50 rounded-lg transition-colors cursor-pointer"
                  >
                    Keep Subscription
                  </button>
                </div>
              </div>
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
