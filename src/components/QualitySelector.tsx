"use client";

import { QualitySize, QUALITY_OPTIONS } from "@/types";

interface QualitySelectorProps {
  value: QualitySize;
  onChange: (size: QualitySize) => void;
  compact?: boolean;
}

export default function QualitySelector({
  value,
  onChange,
  compact = false,
}: QualitySelectorProps) {
  return (
    <div className={compact ? "" : "space-y-2"}>
      {!compact && (
        <label className="block text-sm font-medium text-gray-700 text-center">
          Output Quality
        </label>
      )}
      <div className="flex gap-1 justify-center bg-gray-100 rounded-lg p-1">
        {QUALITY_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer ${
              value === opt.value
                ? "bg-white text-[var(--color-primary)] shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
            title={opt.description}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
