"use client";

import type { PlanConfig, CreditPack, PlanId } from "@/lib/plans";
import PlanCard from "./PlanCard";
import CreditPackCard from "./CreditPackCard";

const PLAN_ORDER: PlanId[] = ["free", "basic", "pro"];

interface PlansTabProps {
  currentPlan: string;
  plans: Record<string, PlanConfig>;
  creditPacks: CreditPack[];
}

export default function PlansTab({
  currentPlan,
  plans,
  creditPacks,
}: PlansTabProps) {
  const currentIndex = PLAN_ORDER.indexOf(currentPlan as PlanId);

  return (
    <div className="space-y-12">
      {/* Plans section */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-1">
          Choose a Plan
        </h2>
        <p className="text-sm text-gray-500 mb-6">
          Select the plan that best fits your needs.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {PLAN_ORDER.map((planId, idx) => {
            const plan = plans[planId];
            if (!plan) return null;
            return (
              <PlanCard
                key={planId}
                plan={plan}
                isCurrent={planId === currentPlan}
                isDowngrade={idx < currentIndex}
              />
            );
          })}
        </div>
      </section>

      {/* Credits section */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-1">
          Buy Credits
        </h2>
        <p className="text-sm text-gray-500 mb-6">
          Credits work on any plan and never expire. Use them when your monthly
          quota runs out.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {creditPacks.map((pack) => (
            <CreditPackCard key={pack.id} pack={pack} />
          ))}
        </div>
      </section>
    </div>
  );
}
