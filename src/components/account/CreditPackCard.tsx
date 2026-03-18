"use client";

import type { CreditPack } from "@/lib/plans";

interface CreditPackCardProps {
  pack: CreditPack;
}

export default function CreditPackCard({ pack }: CreditPackCardProps) {
  const handleBuy = () => {
    alert("PayPal integration coming soon!");
  };

  return (
    <div className="rounded-xl border border-gray-100 shadow-sm p-6 flex flex-col">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-900">{pack.label}</h3>
        <div className="mt-2 flex items-baseline gap-1">
          <span className="text-3xl font-bold text-gray-900">
            ${pack.priceUsd}
          </span>
        </div>
      </div>

      <div className="space-y-2 text-sm text-gray-600 mb-6 flex-1">
        <p className="flex items-center gap-2">
          <svg
            className="w-4 h-4 text-indigo-500 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5 13l4 4L19 7"
            />
          </svg>
          {pack.credits} credits
        </p>
        <p className="flex items-center gap-2">
          <svg
            className="w-4 h-4 text-indigo-500 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5 13l4 4L19 7"
            />
          </svg>
          {pack.perImage} per image
        </p>
        <p className="flex items-center gap-2">
          <svg
            className="w-4 h-4 text-indigo-500 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5 13l4 4L19 7"
            />
          </svg>
          Never expire
        </p>
      </div>

      <button
        onClick={handleBuy}
        className="w-full py-2.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors cursor-pointer"
      >
        Buy Credits
      </button>
    </div>
  );
}
