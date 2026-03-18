export type PlanId = "free" | "basic" | "pro";

export interface PlanConfig {
  id: PlanId;
  label: string;
  priceUsd: number;
  monthlyQuota: number;
  maxFileSizeBytes: number;
  maxQuality: string;
  maxBatchFiles: number;
  overagePriceUsd: number | null;
}

export const PLANS: Record<PlanId, PlanConfig> = {
  free: {
    id: "free",
    label: "Free",
    priceUsd: 0,
    monthlyQuota: 3,
    maxFileSizeBytes: 5 * 1024 * 1024,
    maxQuality: "hd",
    maxBatchFiles: 1,
    overagePriceUsd: null,
  },
  basic: {
    id: "basic",
    label: "Basic",
    priceUsd: 9.99,
    monthlyQuota: 40,
    maxFileSizeBytes: 25 * 1024 * 1024,
    maxQuality: "full",
    maxBatchFiles: 10,
    overagePriceUsd: 0.12,
  },
  pro: {
    id: "pro",
    label: "Pro",
    priceUsd: 24.99,
    monthlyQuota: 100,
    maxFileSizeBytes: 25 * 1024 * 1024,
    maxQuality: "full",
    maxBatchFiles: 20,
    overagePriceUsd: 0.08,
  },
};

export interface CreditPack {
  id: string;
  label: string;
  credits: number;
  priceUsd: number;
  perImage: string;
}

export const CREDIT_PACKS: CreditPack[] = [
  { id: "starter", label: "Starter", credits: 10, priceUsd: 2.99, perImage: "$0.30" },
  { id: "popular", label: "Popular", credits: 35, priceUsd: 7.99, perImage: "$0.23" },
  { id: "value", label: "Value", credits: 100, priceUsd: 19.99, perImage: "$0.20" },
];

export function getEffectivePlan(plan: PlanId, creditBalance: number): PlanConfig {
  if (plan === "free" && creditBalance > 0) {
    return {
      ...PLANS.free,
      maxFileSizeBytes: 25 * 1024 * 1024,
      maxBatchFiles: 10,
    };
  }
  return PLANS[plan] ?? PLANS.free;
}

const QUALITY_ORDER = ["preview", "auto", "hd", "full"];

export function isQualityAllowed(requestedSize: string, plan: PlanConfig): boolean {
  const requestedIndex = QUALITY_ORDER.indexOf(requestedSize);
  const maxIndex = QUALITY_ORDER.indexOf(plan.maxQuality);
  if (requestedIndex === -1 || maxIndex === -1) return true;
  return requestedIndex <= maxIndex;
}

export function capQuality(requestedSize: string, plan: PlanConfig): string {
  if (isQualityAllowed(requestedSize, plan)) return requestedSize;
  return plan.maxQuality;
}
