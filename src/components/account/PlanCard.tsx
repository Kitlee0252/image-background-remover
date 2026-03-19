"use client";

import { useState } from "react";
import { PayPalButtons } from "@paypal/react-paypal-js";
import type { PlanConfig } from "@/lib/plans";

interface PlanCardProps {
  plan: PlanConfig;
  isCurrent: boolean;
  isDowngrade: boolean;
  onSuccess?: () => void;
}

type Status = "idle" | "processing" | "success" | "error";

function formatFileSize(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))}MB`;
}

const qualityLabels: Record<string, string> = {
  preview: "Preview",
  auto: "Standard",
  hd: "HD",
  full: "Ultra HD",
};

const CheckIcon = () => (
  <svg
    className="w-4 h-4 text-indigo-500 shrink-0"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={2}
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
  </svg>
);

export default function PlanCard({ plan, isCurrent, isDowngrade, onSuccess }: PlanCardProps) {
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string>("");

  const isFree = plan.priceUsd === 0;
  const showPayPal = !isCurrent && !isFree && !isDowngrade;

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
          {isFree ? (
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
          <CheckIcon />
          {plan.monthlyQuota} images/month
        </li>
        <li className="flex items-center gap-2">
          <CheckIcon />
          Up to {qualityLabels[plan.maxQuality] ?? plan.maxQuality} quality
        </li>
        <li className="flex items-center gap-2">
          <CheckIcon />
          Max {formatFileSize(plan.maxFileSizeBytes)} file size
        </li>
        <li className="flex items-center gap-2">
          <CheckIcon />
          {plan.maxBatchFiles === 1
            ? "Single file processing"
            : `Batch up to ${plan.maxBatchFiles} files`}
        </li>
        {plan.overagePriceUsd !== null && (
          <li className="flex items-center gap-2">
            <CheckIcon />
            Overage at ${plan.overagePriceUsd}/image
          </li>
        )}
      </ul>

      {isCurrent ? (
        <div className="w-full py-2.5 text-sm font-medium text-center text-indigo-600 bg-indigo-50 rounded-lg">
          Current Plan
        </div>
      ) : isFree ? (
        <div className="w-full py-2.5 text-sm font-medium text-center text-gray-500 bg-gray-50 rounded-lg">
          Free Plan
        </div>
      ) : isDowngrade ? (
        <button
          disabled
          className="w-full py-2.5 text-sm font-medium rounded-lg text-gray-400 border border-gray-200 cursor-not-allowed"
        >
          Downgrade
        </button>
      ) : status === "success" ? (
        <div className="w-full py-2.5 text-sm font-medium text-center text-green-700 bg-green-50 rounded-lg">
          Subscription activated!
        </div>
      ) : status === "error" ? (
        <div className="w-full py-2 text-sm text-red-600 bg-red-50 rounded-lg text-center px-2">
          {errorMsg || "Subscription failed. Please try again."}
        </div>
      ) : showPayPal ? (
        <PayPalButtons
          style={{
            layout: "horizontal",
            color: "gold",
            shape: "rect",
            label: "subscribe",
            height: 40,
            tagline: false,
          }}
          disabled={status === "processing"}
          createSubscription={async (_data, _actions) => {
            setStatus("processing");
            const res = await fetch("/api/paypal/create-subscription", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ planId: plan.id }),
            });
            const result = await res.json();
            if (!res.ok) {
              setStatus("error");
              setErrorMsg(result.error || "Failed to create subscription.");
              throw new Error(result.error);
            }
            return result.subscriptionId;
          }}
          onApprove={async (data) => {
            setStatus("processing");
            const res = await fetch("/api/paypal/create-subscription", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                planId: plan.id,
                subscriptionId: data.subscriptionID,
              }),
            });
            const result = await res.json();
            if (!res.ok) {
              setStatus("error");
              setErrorMsg(result.error || "Failed to activate subscription.");
              return;
            }
            setStatus("success");
            onSuccess?.();
          }}
          onCancel={() => {
            setStatus("idle");
          }}
          onError={(err) => {
            setStatus("error");
            setErrorMsg("An error occurred during subscription.");
            console.error("PayPal error:", err);
          }}
        />
      ) : null}
    </div>
  );
}
