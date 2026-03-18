"use client";

import { Suspense } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import OverviewTab from "@/components/account/OverviewTab";
import PlansTab from "@/components/account/PlansTab";
import BillingTab from "@/components/account/BillingTab";

type TabId = "overview" | "plans" | "billing";

const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "plans", label: "Plans & Credits" },
  { id: "billing", label: "Billing" },
];

interface AccountData {
  plan: string;
  planConfig: any;
  effectivePlan: any;
  credits: number;
  usage: { used: number; limit: number };
  subscription: {
    planExpiresAt: number | null;
    paypalEmail: string | null;
    paypalSubscriptionId: string | null;
  };
  recentTransactions: any[];
  plans: any;
  creditPacks: any[];
}

function AccountContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [accountData, setAccountData] = useState<AccountData | null>(null);
  const [loading, setLoading] = useState(true);

  const tabParam = searchParams.get("tab") as TabId | null;
  const activeTab: TabId =
    tabParam && TABS.some((t) => t.id === tabParam) ? tabParam : "overview";

  const setActiveTab = useCallback(
    (tab: TabId) => {
      router.push(`/account?tab=${tab}`, { scroll: false });
    },
    [router]
  );

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/");
      return;
    }
    if (status === "authenticated") {
      fetch("/api/account")
        .then((r) => r.json() as Promise<AccountData>)
        .then((data) => {
          setAccountData(data);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    }
  }, [status, router]);

  if (status === "loading" || loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-indigo-500" />
      </div>
    );
  }

  if (!session?.user || !accountData) {
    return null;
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Account</h1>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-8">
        <nav className="flex gap-8" aria-label="Account tabs">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
                activeTab === tab.id
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      {activeTab === "overview" && (
        <OverviewTab
          session={session}
          accountData={accountData}
        />
      )}
      {activeTab === "plans" && (
        <PlansTab
          currentPlan={accountData.plan}
          plans={accountData.plans}
          creditPacks={accountData.creditPacks}
        />
      )}
      {activeTab === "billing" && (
        <BillingTab
          accountData={accountData}
        />
      )}
    </div>
  );
}

export default function AccountPage() {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <Header />
      <main className="flex-1">
        <Suspense
          fallback={
            <div className="flex items-center justify-center py-32">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-indigo-500" />
            </div>
          }
        >
          <AccountContent />
        </Suspense>
      </main>
      <Footer />
    </div>
  );
}
