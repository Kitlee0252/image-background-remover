"use client";

import Link from "next/link";

interface UsageBannerProps {
  used: number;
  limit: number;
}

export default function UsageBanner({ used, limit }: UsageBannerProps) {
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-center text-sm text-amber-800">
      <span className="font-medium">
        Monthly free quota used ({used}/{limit}).
      </span>{" "}
      <Link
        href="/account?tab=plans"
        className="font-medium text-indigo-600 hover:text-indigo-700 underline transition-colors"
      >
        Upgrade for more
      </Link>
    </div>
  );
}
