"use client";

import { useState } from "react";
import { PayPalButtons } from "@paypal/react-paypal-js";
import type { CreditPack } from "@/lib/plans";

interface CreditPackCardProps {
  pack: CreditPack;
  onSuccess?: () => void;
}

type Status = "idle" | "processing" | "success" | "error";

export default function CreditPackCard({ pack, onSuccess }: CreditPackCardProps) {
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string>("");

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

      {status === "success" ? (
        <div className="w-full py-2.5 text-sm font-medium text-center text-green-700 bg-green-50 rounded-lg">
          +{pack.credits} credits added!
        </div>
      ) : status === "error" ? (
        <div className="w-full py-2 text-sm text-red-600 bg-red-50 rounded-lg text-center px-2">
          {errorMsg || "Payment failed. Please try again."}
        </div>
      ) : (
        <PayPalButtons
          style={{
            layout: "horizontal",
            color: "blue",
            shape: "rect",
            label: "pay",
            height: 40,
            tagline: false,
          }}
          disabled={status === "processing"}
          createOrder={async () => {
            setStatus("processing");
            const res = await fetch("/api/paypal/create-order", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ packId: pack.id }),
            });
            const data = await res.json() as any;
            if (!res.ok) {
              setStatus("error");
              setErrorMsg(data.error || "Failed to create order.");
              throw new Error(data.error);
            }
            return data.orderId;
          }}
          onApprove={async (data) => {
            setStatus("processing");
            const res = await fetch("/api/paypal/capture-order", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ orderId: data.orderID, packId: pack.id }),
            });
            const result = await res.json() as any;
            if (!res.ok) {
              setStatus("error");
              setErrorMsg(result.error || "Payment capture failed.");
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
            setErrorMsg("An error occurred during payment.");
            console.error("PayPal error:", err);
          }}
        />
      )}
    </div>
  );
}
