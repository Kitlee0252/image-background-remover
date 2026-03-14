"use client";

import { useState } from "react";

const faqs = [
  {
    question: "Is this tool free to use?",
    answer: "Yes, you can use this tool for free to remove backgrounds from your images.",
  },
  {
    question: "What file types are supported?",
    answer: "We support JPG, JPEG, PNG, and WebP formats. The maximum file size is 10MB.",
  },
  {
    question: "Do you store my images?",
    answer: "No. Your images are processed in real-time and are not stored on our servers. We value your privacy.",
  },
  {
    question: "How long does background removal take?",
    answer: "Background removal typically takes just a few seconds, depending on the image size and complexity.",
  },
  {
    question: "Can I use the result for product photos or logos?",
    answer: "Absolutely! The transparent PNG output is perfect for product photos, logos, social media graphics, and more.",
  },
];

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section className="py-16 px-4">
      <div className="max-w-3xl mx-auto">
        <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">
          Frequently Asked Questions
        </h2>
        <div className="space-y-3">
          {faqs.map((faq, index) => (
            <div key={index} className="border border-gray-200 rounded-lg">
              <button
                onClick={() => setOpenIndex(openIndex === index ? null : index)}
                className="w-full px-6 py-4 text-left flex items-center justify-between cursor-pointer"
              >
                <span className="font-medium text-gray-900">{faq.question}</span>
                <span className="text-gray-400 text-xl ml-4">
                  {openIndex === index ? "−" : "+"}
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
