/**
 * PhotoRoom Remove Background API client.
 * Endpoint: POST https://sdk.photoroom.com/v1/segment
 * Auth: x-api-key header
 * Response: binary image data
 * Docs: https://docs.photoroom.com/remove-background-api-basic-plan
 */

const SIZE_MAP: Record<string, string> = {
  preview: "preview",
  auto: "medium",
  medium: "medium",
  hd: "hd",
  full: "full",
};

export interface PhotoRoomResult {
  ok: true;
  imageBuffer: ArrayBuffer;
  contentType: string;
}

export interface PhotoRoomError {
  ok: false;
  status: number;
  message: string;
}

export async function removeBackground(
  apiKey: string,
  imageBlob: Blob,
  fileName: string,
  size: string
): Promise<PhotoRoomResult | PhotoRoomError> {
  const formData = new FormData();
  formData.append("image_file", imageBlob, fileName);
  formData.append("size", SIZE_MAP[size] ?? "full");
  formData.append("format", "png");

  const response = await fetch("https://sdk.photoroom.com/v1/segment", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    let message = "Failed to remove background.";
    try {
      const errorData = JSON.parse(errorText);
      if (errorData.message) message = errorData.message;
    } catch {}
    return { ok: false, status: response.status, message };
  }

  const contentType = response.headers.get("content-type") || "image/png";
  const imageBuffer = await response.arrayBuffer();
  return { ok: true, imageBuffer, contentType };
}
