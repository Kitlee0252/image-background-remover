"use client";

import { useState, useCallback, useRef } from "react";
import Header from "@/components/Header";
import Hero from "@/components/Hero";
import UploadZone from "@/components/UploadZone";
import ResultView from "@/components/ResultView";
import HowItWorks from "@/components/HowItWorks";
import FAQ from "@/components/FAQ";
import Footer from "@/components/Footer";

type AppState = "idle" | "selected" | "processing" | "success" | "error";

export default function Home() {
  const [state, setState] = useState<AppState>("idle");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [resultUrl, setResultUrl] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [originalFileName, setOriginalFileName] = useState<string>("");
  const uploadRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUploadClick = () => {
    uploadRef.current?.scrollIntoView({ behavior: "smooth" });
    // Small delay to ensure scroll completes, then trigger file input
    setTimeout(() => {
      fileInputRef.current?.click();
    }, 300);
  };

  const handleFileSelect = useCallback((file: File) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      setErrorMessage("Unsupported file format. Please upload JPG, PNG, or WebP.");
      setState("error");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setErrorMessage("File size exceeds 10MB limit.");
      setState("error");
      return;
    }

    setSelectedFile(file);
    setOriginalFileName(file.name.replace(/\.[^.]+$/, ""));
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setState("selected");
    setErrorMessage("");
  }, []);

  const handleRemoveBackground = useCallback(async () => {
    if (!selectedFile) return;
    setState("processing");
    setErrorMessage("");

    try {
      const formData = new FormData();
      formData.append("image_file", selectedFile);

      const response = await fetch("/api/remove-background", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Failed to remove background");
      }

      if (!data.image) {
        throw new Error("No image data received");
      }

      setResultUrl(data.image);
      setState("success");
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Something went wrong. Please try again later."
      );
      setState("error");
    }
  }, [selectedFile]);

  const handleReset = useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(null);
    setPreviewUrl("");
    setResultUrl("");
    setErrorMessage("");
    setState("idle");
  }, [previewUrl, resultUrl]);

  const handleDownload = useCallback(() => {
    if (!resultUrl) return;
    const a = document.createElement("a");
    a.href = resultUrl;
    a.download = `${originalFileName}-no-bg.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [resultUrl, originalFileName]);

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <Header />
      <main className="flex-1">
        <Hero onUploadClick={handleUploadClick} />

        <section ref={uploadRef} className="max-w-4xl mx-auto px-4 py-12">
          {(state === "idle" || state === "error") && (
            <>
              <UploadZone onFileSelect={handleFileSelect} fileInputRef={fileInputRef} />
              {state === "error" && (
                <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-center">
                  {errorMessage}
                </div>
              )}
            </>
          )}

          {state === "selected" && (
            <div className="text-center space-y-6">
              <div className="max-w-md mx-auto">
                <img
                  src={previewUrl}
                  alt="Selected image preview"
                  className="rounded-lg shadow-md max-h-80 mx-auto"
                />
              </div>
              <div className="flex gap-4 justify-center">
                <button
                  onClick={handleRemoveBackground}
                  className="px-8 py-3 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  Remove Background
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

          {state === "processing" && (
            <div className="text-center space-y-4 py-12">
              <div className="inline-block w-12 h-12 border-4 border-gray-200 border-t-[var(--color-primary)] rounded-full animate-spin" />
              <p className="text-lg font-medium text-gray-700">Removing background...</p>
              <p className="text-gray-500">This usually takes a few seconds.</p>
            </div>
          )}

          {state === "success" && (
            <ResultView
              originalUrl={previewUrl}
              resultUrl={resultUrl}
              onDownload={handleDownload}
              onReset={handleReset}
            />
          )}
        </section>

        <HowItWorks />
        <FAQ />
      </main>
      <Footer />
    </div>
  );
}
