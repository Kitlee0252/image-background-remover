"use client";

import { useState } from "react";
import { FileItem } from "@/types";
import FileCard from "./FileCard";

interface BatchResultViewProps {
  files: FileItem[];
  onDownload: (id: string) => void;
  onDownloadAll: () => void;
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
  onReset: () => void;
}

export default function BatchResultView({
  files,
  onDownload,
  onDownloadAll,
  onRetry,
  onRemove,
  onReset,
}: BatchResultViewProps) {
  const [zipping, setZipping] = useState(false);
  const successCount = files.filter((f) => f.status === "success").length;
  const errorCount = files.filter((f) => f.status === "error").length;
  const processingCount = files.filter((f) => f.status === "processing").length;

  const handleDownloadAll = async () => {
    setZipping(true);
    try {
      await onDownloadAll();
    } finally {
      setZipping(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Status summary */}
      <div className="flex items-center justify-center gap-4 text-sm">
        {processingCount > 0 && (
          <span className="text-[var(--color-primary)] font-medium">
            Processing {processingCount}...
          </span>
        )}
        {successCount > 0 && (
          <span className="text-green-600">{successCount} completed</span>
        )}
        {errorCount > 0 && (
          <span className="text-red-600">{errorCount} failed</span>
        )}
      </div>

      {/* Card grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {files.map((file) => (
          <FileCard
            key={file.id}
            item={file}
            onDownload={onDownload}
            onRetry={onRetry}
            onRemove={onRemove}
          />
        ))}
      </div>

      {/* Action buttons */}
      <div className="flex gap-4 justify-center">
        {successCount > 1 && (
          <button
            onClick={handleDownloadAll}
            disabled={zipping}
            className="px-8 py-3 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white font-semibold rounded-lg transition-colors cursor-pointer disabled:opacity-50"
          >
            {zipping ? "Creating ZIP..." : `Download All (${successCount} images)`}
          </button>
        )}
        <button
          onClick={onReset}
          className="px-8 py-3 border border-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
        >
          Start Over
        </button>
      </div>
    </div>
  );
}
