"use client";

import { useState, useCallback } from "react";

interface Transaction {
  id: string;
  type: string;
  amount_usd: number;
  credits_added: number | null;
  plan: string | null;
  status: string;
  created_at: number;
}

interface TransactionHistoryProps {
  initialTransactions: Transaction[];
}

const TYPE_LABELS: Record<string, string> = {
  credit_purchase: "Credit Purchase",
  subscription: "Subscription",
  subscription_renewal: "Renewal",
  overage: "Overage",
  refund: "Refund",
};

const STATUS_STYLES: Record<string, string> = {
  completed: "bg-green-100 text-green-700",
  pending: "bg-yellow-100 text-yellow-700",
  refunded: "bg-gray-100 text-gray-600",
};

function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function TransactionHistory({
  initialTransactions,
}: TransactionHistoryProps) {
  const [transactions, setTransactions] =
    useState<Transaction[]>(initialTransactions);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(initialTransactions.length >= 10);

  const loadMore = useCallback(async () => {
    setLoading(true);
    try {
      const offset = transactions.length;
      const res = await fetch(
        `/api/account?transactions_offset=${offset}&transactions_limit=10`
      );
      const data = await res.json();
      const newTx: Transaction[] = data.recentTransactions ?? [];
      if (newTx.length < 10) {
        setHasMore(false);
      }
      setTransactions((prev) => [...prev, ...newTx]);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [transactions.length]);

  if (transactions.length === 0) {
    return (
      <p className="text-sm text-gray-400 py-4 text-center">
        No transactions yet.
      </p>
    );
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left py-2 pr-4 text-gray-500 font-medium">
                Date
              </th>
              <th className="text-left py-2 pr-4 text-gray-500 font-medium">
                Description
              </th>
              <th className="text-right py-2 pr-4 text-gray-500 font-medium">
                Amount
              </th>
              <th className="text-right py-2 text-gray-500 font-medium">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((tx) => (
              <tr key={tx.id} className="border-b border-gray-50">
                <td className="py-3 pr-4 text-gray-600 whitespace-nowrap">
                  {formatDate(tx.created_at)}
                </td>
                <td className="py-3 pr-4 text-gray-900">
                  {TYPE_LABELS[tx.type] ?? tx.type}
                  {tx.credits_added ? (
                    <span className="text-gray-400 ml-1">
                      (+{tx.credits_added} credits)
                    </span>
                  ) : null}
                  {tx.plan ? (
                    <span className="text-gray-400 ml-1 capitalize">
                      - {tx.plan}
                    </span>
                  ) : null}
                </td>
                <td className="py-3 pr-4 text-right text-gray-900 font-medium">
                  ${tx.amount_usd.toFixed(2)}
                </td>
                <td className="py-3 text-right">
                  <span
                    className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
                      STATUS_STYLES[tx.status] ?? "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {tx.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {hasMore && (
        <div className="mt-4 text-center">
          <button
            onClick={loadMore}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-indigo-600 border border-indigo-200 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
          >
            {loading ? "Loading..." : "Load More"}
          </button>
        </div>
      )}
    </div>
  );
}
