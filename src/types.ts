export type QualitySize = "preview" | "auto" | "hd" | "full";

export interface FileItem {
  id: string;
  file: File;
  previewUrl: string;
  originalFileName: string;
  status: "pending" | "processing" | "success" | "error";
  resultUrl: string | null;
  errorMessage: string | null;
  qualitySize: QualitySize;
}

export type AppPhase = "idle" | "selected" | "processing" | "done";

export const QUALITY_OPTIONS: {
  value: QualitySize;
  label: string;
  description: string;
}[] = [
  { value: "preview", label: "Preview", description: "Low res, fastest" },
  { value: "auto", label: "Standard", description: "Good for most uses" },
  { value: "hd", label: "HD", description: "Up to 4 MP" },
  { value: "full", label: "Ultra HD", description: "Original resolution" },
];

export const MAX_FILES = 10;
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
export const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
