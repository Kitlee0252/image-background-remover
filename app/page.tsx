"use client";

import { useState, useCallback, useRef, useMemo } from "react";
import { useSession, signIn } from "next-auth/react";
import Header from "@/components/Header";
import Hero from "@/components/Hero";
import UploadZone from "@/components/UploadZone";
import ResultView from "@/components/ResultView";
import BatchResultView from "@/components/BatchResultView";
import QualitySelector from "@/components/QualitySelector";
import HowItWorks from "@/components/HowItWorks";
import FAQ from "@/components/FAQ";
import Footer from "@/components/Footer";
import UsageBanner from "@/components/UsageBanner";
import {
  FileItem,
  QualitySize,
  AppPhase,
  DEFAULT_MAX_FILES,
  DEFAULT_MAX_FILE_SIZE,
  ALLOWED_TYPES,
} from "@/types";

const CONCURRENCY = 2;

export default function Home() {
  const { status: authStatus } = useSession();
  const [files, setFiles] = useState<FileItem[]>([]);
  const [globalQuality, setGlobalQuality] = useState<QualitySize>("auto");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [quotaExceeded, setQuotaExceeded] = useState<{used: number; limit: number} | null>(null);
  const uploadRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Derived phase from files array
  const phase: AppPhase = useMemo(() => {
    if (files.length === 0) return "idle";
    if (files.some((f) => f.status === "processing")) return "processing";
    if (files.every((f) => f.status === "success" || f.status === "error"))
      return "done";
    return "selected";
  }, [files]);

  const handleUploadClick = () => {
    uploadRef.current?.scrollIntoView({ behavior: "smooth" });
    setTimeout(() => {
      fileInputRef.current?.click();
    }, 300);
  };

  const handleFilesSelect = useCallback(
    (newFiles: File[]) => {
      setErrorMessage("");

      // Validate each file, collect valid ones
      const validItems: FileItem[] = [];
      const errors: string[] = [];

      for (const file of newFiles) {
        if (!ALLOWED_TYPES.includes(file.type)) {
          errors.push(`${file.name}: unsupported format`);
          continue;
        }
        if (file.size > DEFAULT_MAX_FILE_SIZE) {
          errors.push(`${file.name}: exceeds ${Math.round(DEFAULT_MAX_FILE_SIZE / (1024 * 1024))}MB`);
          continue;
        }
        validItems.push({
          id: crypto.randomUUID(),
          file,
          previewUrl: URL.createObjectURL(file),
          originalFileName: file.name.replace(/\.[^.]+$/, ""),
          status: "pending",
          resultUrl: null,
          errorMessage: null,
          qualitySize: globalQuality,
        });
      }

      if (errors.length > 0) {
        setErrorMessage(errors.join("; "));
      }

      if (validItems.length === 0) return;

      setFiles((prev) => {
        const combined = [...prev, ...validItems];
        if (combined.length > DEFAULT_MAX_FILES) {
          setErrorMessage(
            (e) =>
              (e ? e + "; " : "") +
              `Max ${DEFAULT_MAX_FILES} images. ${combined.length - DEFAULT_MAX_FILES} skipped.`
          );
          return combined.slice(0, DEFAULT_MAX_FILES);
        }
        return combined;
      });
    },
    [globalQuality]
  );

  const updateFile = useCallback(
    (id: string, updates: Partial<FileItem>) => {
      setFiles((prev) =>
        prev.map((f) => (f.id === id ? { ...f, ...updates } : f))
      );
    },
    []
  );

  const processOneFile = useCallback(
    async (item: FileItem) => {
      updateFile(item.id, { status: "processing" });

      try {
        const formData = new FormData();
        formData.append("image_file", item.file);
        formData.append("size", item.qualitySize);

        const response = await fetch("/api/remove-background", {
          method: "POST",
          body: formData,
        });

        const data = (await response.json()) as {
          image?: string;
          error?: string;
          code?: string;
          used?: number;
          limit?: number;
        };

        if (!response.ok) {
          if (data.code === "quota_exceeded") {
            setQuotaExceeded({ used: data.used!, limit: data.limit! });
          }
          throw new Error(data?.error || "Failed to remove background");
        }
        if (!data.image) {
          throw new Error("No image data received");
        }

        updateFile(item.id, { status: "success", resultUrl: data.image });
      } catch (err) {
        updateFile(item.id, {
          status: "error",
          errorMessage:
            err instanceof Error
              ? err.message
              : "Something went wrong. Please try again.",
        });
      }
    },
    [updateFile]
  );

  const processAllFiles = useCallback(async () => {
    setErrorMessage("");
    // Apply global quality to all pending files
    setFiles((prev) =>
      prev.map((f) =>
        f.status === "pending" ? { ...f, qualitySize: globalQuality } : f
      )
    );

    // Get a snapshot of pending files
    const pending = files.filter((f) => f.status === "pending");

    // Process in batches of CONCURRENCY
    for (let i = 0; i < pending.length; i += CONCURRENCY) {
      const batch = pending.slice(i, i + CONCURRENCY);
      await Promise.all(batch.map((item) => processOneFile(item)));
    }
  }, [files, globalQuality, processOneFile]);

  const handleRetry = useCallback(
    (id: string) => {
      const file = files.find((f) => f.id === id);
      if (!file) return;
      updateFile(id, {
        status: "pending",
        errorMessage: null,
        resultUrl: null,
        qualitySize: globalQuality,
      });
      // Process immediately
      processOneFile({ ...file, status: "pending", qualitySize: globalQuality });
    },
    [files, globalQuality, updateFile, processOneFile]
  );

  const handleRemoveFile = useCallback(
    (id: string) => {
      setFiles((prev) => {
        const file = prev.find((f) => f.id === id);
        if (file) URL.revokeObjectURL(file.previewUrl);
        return prev.filter((f) => f.id !== id);
      });
    },
    []
  );

  const handleDownloadOne = useCallback(
    (id: string) => {
      const file = files.find((f) => f.id === id);
      if (!file?.resultUrl) return;
      const a = document.createElement("a");
      a.href = file.resultUrl;
      a.download = `${file.originalFileName}-no-bg.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    },
    [files]
  );

  const handleDownloadAll = useCallback(async () => {
    const successFiles = files.filter(
      (f) => f.status === "success" && f.resultUrl
    );
    if (successFiles.length === 0) return;

    // Single file: direct download
    if (successFiles.length === 1) {
      handleDownloadOne(successFiles[0].id);
      return;
    }

    // Multiple files: ZIP
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();

    for (const f of successFiles) {
      const res = await fetch(f.resultUrl!);
      const blob = await res.blob();
      zip.file(`${f.originalFileName}-no-bg.png`, blob);
    }

    const content = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(content);
    const a = document.createElement("a");
    a.href = url;
    a.download = "backgrounds-removed.zip";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [files, handleDownloadOne]);

  const handleReset = useCallback(() => {
    files.forEach((f) => URL.revokeObjectURL(f.previewUrl));
    setFiles([]);
    setErrorMessage("");
  }, [files]);

  // For single-file backward-compatible ResultView
  const singleFile = files.length === 1 ? files[0] : null;

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <Header />
      <main className="flex-1">
        {authStatus === "loading" && (
          <div className="flex items-center justify-center py-32">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-indigo-500" />
          </div>
        )}

        {authStatus === "unauthenticated" && (
          <>
            <Hero onUploadClick={() => signIn("google")} isAuthenticated={false} />
            <HowItWorks />
            <FAQ />
          </>
        )}

        {authStatus === "authenticated" && (
          <>
            <Hero onUploadClick={handleUploadClick} isAuthenticated={true} />

            {quotaExceeded && (
              <div className="max-w-4xl mx-auto px-4 pt-6">
                <UsageBanner used={quotaExceeded.used} limit={quotaExceeded.limit} />
              </div>
            )}

            <section ref={uploadRef} className="max-w-4xl mx-auto px-4 py-12">
              {/* Upload zone: show when idle or when can add more files */}
              {(phase === "idle" || phase === "selected") && (
                <>
                  <UploadZone
                    onFilesSelect={handleFilesSelect}
                    fileInputRef={fileInputRef}
                  />
                  {errorMessage && (
                    <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-center text-sm">
                      {errorMessage}
                    </div>
                  )}
                </>
              )}

              {/* Selected: show previews + quality selector + process button */}
              {phase === "selected" && files.length > 0 && (
                <div className="mt-8 space-y-6">
                  {/* Preview grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                    {files.map((f) => (
                      <div
                        key={f.id}
                        className="relative border border-gray-200 rounded-lg overflow-hidden bg-gray-50"
                      >
                        <div className="h-32 flex items-center justify-center">
                          <img
                            src={f.previewUrl}
                            alt={f.originalFileName}
                            className="max-h-full max-w-full object-contain p-2"
                          />
                        </div>
                        <div className="px-2 py-1.5 flex items-center justify-between">
                          <p className="text-xs text-gray-600 truncate flex-1">
                            {f.originalFileName}
                          </p>
                          <button
                            onClick={() => handleRemoveFile(f.id)}
                            className="ml-1 text-gray-400 hover:text-red-500 cursor-pointer text-sm"
                            title="Remove"
                          >
                            &times;
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Quality selector + action buttons */}
                  <QualitySelector
                    value={globalQuality}
                    onChange={setGlobalQuality}
                  />

                  <div className="flex gap-4 justify-center">
                    <button
                      onClick={processAllFiles}
                      className="px-8 py-3 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white font-semibold rounded-lg transition-colors cursor-pointer"
                    >
                      {files.length === 1
                        ? "Remove Background"
                        : `Remove Backgrounds (${files.length})`}
                    </button>
                    <button
                      onClick={handleReset}
                      className="px-8 py-3 border border-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Processing: show batch view with live status */}
              {phase === "processing" && (
                <div className="mt-8">
                  <BatchResultView
                    files={files}
                    onDownload={handleDownloadOne}
                    onDownloadAll={handleDownloadAll}
                    onRetry={handleRetry}
                    onRemove={handleRemoveFile}
                    onReset={handleReset}
                  />
                </div>
              )}

              {/* Done: single file uses original ResultView, multi uses BatchResultView */}
              {phase === "done" && singleFile && singleFile.status === "success" && (
                <ResultView
                  originalUrl={singleFile.previewUrl}
                  resultUrl={singleFile.resultUrl!}
                  onDownload={() => handleDownloadOne(singleFile.id)}
                  onReset={handleReset}
                  qualityLabel={singleFile.qualitySize}
                />
              )}

              {phase === "done" && (!singleFile || singleFile.status === "error") && (
                <BatchResultView
                  files={files}
                  onDownload={handleDownloadOne}
                  onDownloadAll={handleDownloadAll}
                  onRetry={handleRetry}
                  onRemove={handleRemoveFile}
                  onReset={handleReset}
                />
              )}
            </section>

            <HowItWorks />
            <FAQ />
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}
