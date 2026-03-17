"use client";

import { FileItem } from "@/types";

interface FileCardProps {
  item: FileItem;
  onDownload: (id: string) => void;
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
}

const checkerBg = {
  backgroundImage:
    "linear-gradient(45deg, #e5e7eb 25%, transparent 25%), linear-gradient(-45deg, #e5e7eb 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e5e7eb 75%), linear-gradient(-45deg, transparent 75%, #e5e7eb 75%)",
  backgroundSize: "16px 16px",
  backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0px",
};

export default function FileCard({
  item,
  onDownload,
  onRetry,
  onRemove,
}: FileCardProps) {
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
      {/* Thumbnail area */}
      <div
        className="relative h-40 flex items-center justify-center"
        style={item.status === "success" ? checkerBg : { backgroundColor: "#f3f4f6" }}
      >
        <img
          src={item.status === "success" && item.resultUrl ? item.resultUrl : item.previewUrl}
          alt={item.originalFileName}
          className="max-h-full max-w-full object-contain p-2"
        />

        {/* Processing overlay */}
        {item.status === "processing" && (
          <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
            <div className="w-8 h-8 border-3 border-gray-200 border-t-[var(--color-primary)] rounded-full animate-spin" />
          </div>
        )}

        {/* Error overlay */}
        {item.status === "error" && (
          <div className="absolute inset-0 bg-red-50/80 flex items-center justify-center">
            <div className="text-center px-2">
              <div className="text-red-500 text-lg">!</div>
              <p className="text-xs text-red-600 line-clamp-2">{item.errorMessage}</p>
            </div>
          </div>
        )}
      </div>

      {/* Info + actions */}
      <div className="p-3 space-y-2">
        <p className="text-sm text-gray-700 truncate" title={item.originalFileName}>
          {item.originalFileName}
        </p>
        <div className="flex gap-2">
          {item.status === "success" && (
            <button
              onClick={() => onDownload(item.id)}
              className="flex-1 text-xs px-2 py-1.5 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white rounded transition-colors cursor-pointer"
            >
              Download
            </button>
          )}
          {item.status === "error" && (
            <button
              onClick={() => onRetry(item.id)}
              className="flex-1 text-xs px-2 py-1.5 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white rounded transition-colors cursor-pointer"
            >
              Retry
            </button>
          )}
          {(item.status === "pending" || item.status === "error") && (
            <button
              onClick={() => onRemove(item.id)}
              className="text-xs px-2 py-1.5 border border-gray-300 text-gray-600 rounded hover:bg-gray-50 transition-colors cursor-pointer"
            >
              Remove
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
