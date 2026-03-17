"use client";

import { useCallback, useState } from "react";

interface UploadZoneProps {
  onFilesSelect: (files: File[]) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
}

export default function UploadZone({ onFilesSelect, fileInputRef }: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      const droppedFiles = Array.from(e.dataTransfer.files);
      if (droppedFiles.length > 0) onFilesSelect(droppedFiles);
    },
    [onFilesSelect]
  );

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files ? Array.from(e.target.files) : [];
    if (selectedFiles.length > 0) {
      onFilesSelect(selectedFiles);
    }
    // Reset input so the same files can be selected again
    e.target.value = "";
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleClick(); }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors select-none ${
        isDragging
          ? "border-[var(--color-primary)] bg-indigo-50"
          : "border-gray-300 hover:border-[var(--color-primary)] hover:bg-gray-50"
      }`}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        onChange={handleChange}
        className="hidden"
      />
      <div className="space-y-3 pointer-events-none">
        <div className="text-5xl text-gray-400">+</div>
        <p className="text-lg font-medium text-gray-700">
          Click or drag images here
        </p>
        <p className="text-sm text-gray-500">
          Supports JPG, PNG, WebP &middot; Max 10MB each &middot; Up to 10 images
        </p>
        <p className="text-xs text-gray-400">
          We do not store your images.
        </p>
      </div>
    </div>
  );
}
