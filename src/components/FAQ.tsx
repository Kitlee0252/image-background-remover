"use client";

import { useState } from "react";

type TabId = "pricing" | "usage" | "account" | "technical";

interface FaqItem {
  question: string;
  answer: string;
}

const TABS: { id: TabId; label: string }[] = [
  { id: "pricing", label: "Pricing" },
  { id: "usage", label: "Usage" },
  { id: "account", label: "Account" },
  { id: "technical", label: "Technical" },
];

const FAQ_DATA: Record<TabId, FaqItem[]> = {
  pricing: [
    {
      question: "How much does it cost?",
      answer:
        "Free users get 3 images per month at up to HD quality. For more, you can buy credit packs starting at $2.99 for 10 credits, or subscribe to Basic ($9.99/mo, 40 images) or Pro ($24.99/mo, 100 images) for extra features like Ultra HD output and batch processing.",
    },
    {
      question: "What's the difference between credits and a subscription?",
      answer:
        "Credits are one-time purchases that never expire \u2014 great for occasional use. Subscriptions give you a monthly quota plus perks like Ultra HD quality and higher batch limits. If you're a subscriber and your monthly quota runs out, your credits are used automatically.",
    },
    {
      question: "Do unused credits or monthly quota roll over?",
      answer:
        "Credits never expire and always roll over. Monthly subscription quota resets on the 1st of each month and does not carry over.",
    },
    {
      question: "Can I get a refund?",
      answer:
        "Unused credit packs are eligible for a refund within 7 days of purchase. Subscriptions can be cancelled anytime \u2014 you'll keep access until the end of your billing period, but we don't offer partial refunds for the current month.",
    },
    {
      question: "What payment methods do you accept?",
      answer: "We accept PayPal. All prices are in USD.",
    },
  ],
  usage: [
    {
      question: "What are the upload limits?",
      answer:
        "Free users: up to 5MB per image. Paid users (credits or subscription): up to 25MB per image. Supported formats: JPG, PNG, WebP.",
    },
    {
      question: "What quality options are available?",
      answer:
        "Preview (0.25MP), Standard, HD (4MP), and Ultra HD (up to 36MP). Free users can use up to HD. Ultra HD is available for Basic and Pro subscribers.",
    },
    {
      question: "How does batch processing work?",
      answer:
        "Upload multiple images at once \u2014 they'll be processed in parallel. Free users process one image at a time. Basic/Credit users can batch up to 10, Pro users up to 20.",
    },
    {
      question: "What counts as one credit / one usage?",
      answer:
        "Each successfully processed image costs 1 credit (or 1 usage from your monthly quota), regardless of output quality. Failed or rejected images are not counted.",
    },
    {
      question: "What happens when I hit my limit?",
      answer:
        "Free users see an upgrade prompt. Subscribers can purchase additional images at $0.12/image (Basic) or $0.08/image (Pro), or buy a credit pack.",
    },
  ],
  account: [
    {
      question: "Do I need an account?",
      answer:
        "Yes. Sign in with Google to use the service. This lets us track your usage and credits securely.",
    },
    {
      question: "Is my data safe?",
      answer:
        "We do not store your images. Photos are processed in real-time and never saved to our servers. Only your usage records (date, quality, count) are stored.",
    },
    {
      question: "How do I cancel my subscription?",
      answer:
        "Go to Account \u2192 Billing \u2192 Cancel Subscription. You'll keep your plan benefits until the end of the current billing period.",
    },
    {
      question: "Can I delete my account?",
      answer:
        "Yes. Go to Account \u2192 Billing \u2192 Delete Account. This will permanently remove your profile, usage history, and any remaining credits.",
    },
  ],
  technical: [
    {
      question: "What image formats are supported?",
      answer:
        "Input: JPG, PNG, WebP. Output: PNG with transparent background.",
    },
    {
      question: "Why was my image rejected?",
      answer:
        "Images with no clear foreground subject (solid colors, abstract patterns) may be rejected by our AI. Try a different image with a distinct subject.",
    },
    {
      question: "How long does processing take?",
      answer:
        "Typically under 1 second per image. Batch uploads are processed 2 at a time, so 10 images take about 5 seconds.",
    },
  ],
};

export default function FAQ() {
  const [activeTab, setActiveTab] = useState<TabId>("pricing");
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const handleTabChange = (tab: TabId) => {
    setActiveTab(tab);
    setOpenIndex(null);
  };

  const items = FAQ_DATA[activeTab];

  return (
    <section className="py-16 px-4">
      <div className="max-w-3xl mx-auto">
        <h2 className="text-3xl font-bold text-center text-gray-900 mb-8">
          Frequently Asked Questions
        </h2>

        {/* Tab buttons */}
        <div className="flex gap-1 mb-8 border-b border-gray-200">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`px-5 py-2.5 text-sm font-medium transition-colors cursor-pointer rounded-t-lg -mb-px ${
                activeTab === tab.id
                  ? "text-indigo-600 border-b-2 border-indigo-600 bg-white"
                  : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Accordion items */}
        <div className="space-y-3">
          {items.map((faq, index) => (
            <div key={index} className="border border-gray-200 rounded-lg">
              <button
                onClick={() =>
                  setOpenIndex(openIndex === index ? null : index)
                }
                className="w-full px-6 py-4 text-left flex items-center justify-between cursor-pointer"
              >
                <span className="font-medium text-gray-900">
                  {faq.question}
                </span>
                <span className="text-gray-400 text-xl ml-4">
                  {openIndex === index ? "\u2212" : "+"}
                </span>
              </button>
              {openIndex === index && (
                <div className="px-6 pb-4 text-gray-600">{faq.answer}</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
