"use client";

import type { PlanConfig } from "@/lib/plans";

interface PlanCardProps {
  plan: PlanConfig;
  isCurrent: boolean;
  isDowngrade: boolean;
}

function formatFileSize(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))}MB`;
}

const qualityLabels: Record<string, string> = {
  preview: "Preview",
  auto: "Standard",
  hd: "HD",
  full: "Ultra HD",
};

export default function PlanCard({ plan, isCurrent, isDowngrade }: PlanCardProps) {
  const handleClick = () => {
    alert("PayPal integration coming soon!");
  };

  return (
    <div
      className={`rounded-xl border shadow-sm p-6 flex flex-col ${
        isCurrent
          ? "border-indigo-300 ring-2 ring-indigo-100"
          : "border-gray-100"
      }`}
    >
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-900">{plan.label}</h3>
        <div className="mt-2 flex items-baseline gap-1">
          {plan.priceUsd === 0 ? (
            <span className="text-3xl font-bold text-gray-900">Free</span>
          ) : (
            <>
              <span className="text-3xl font-bold text-gray-900">
                ${plan.priceUsd}
              </span>
              <span className="text-sm text-gray-500">/month</span>
            </>
          )}
        </div>
      </div>

      <ul className="space-y-2 text-sm text-gray-600 mb-6 flex-1">
        <li className="flex items-center gap-2">
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
          {plan.monthlyQuota} images/month
        </li>
        <li className="flex items-center gap-2">
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
          Up to {qualityLabels[plan.maxQuality] ?? plan.maxQuality} quality
        </li>
        <li className="flex items-center gap-2">
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
          Max {formatFileSize(plan.maxFileSizeBytes)} file size
        </li>
        <li className="flex items-center gap-2">
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
          {plan.maxBatchFiles === 1
            ? "Single file processing"
            : `Batch up to ${plan.maxBatchFiles} files`}
        </li>
        {plan.overagePriceUsd !== null && (
          <li className="flex items-center gap-2">
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
            Overage at ${plan.overagePriceUsd}/image
          </li>
        )}
      </ul>

      {isCurrent ? (
        <div className="w-full py-2.5 text-sm font-medium text-center text-indigo-600 bg-indigo-50 rounded-lg">
          Current Plan
        </div>
      ) : (
        <button
          onClick={handleClick}
          className={`w-full py-2.5 text-sm font-medium rounded-lg transition-colors cursor-pointer ${
            isDowngrade
              ? "text-gray-700 border border-gray-300 hover:bg-gray-50"
              : "text-white bg-indigo-600 hover:bg-indigo-700"
          }`}
        >
          {isDowngrade ? "Downgrade" : "Upgrade"}
        </button>
      )}
    </div>
  );
}
