import { NextRequest, NextResponse } from "next/server";

const REMOVE_BG_API_KEY = process.env.REMOVE_BG_API_KEY;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export async function POST(request: NextRequest) {
  if (!REMOVE_BG_API_KEY) {
    return NextResponse.json(
      { error: "Service is not configured. Please contact the administrator." },
      { status: 500 }
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get("image_file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No image file provided." }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Unsupported file format. Please upload JPG, PNG, or WebP." },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File size exceeds 10MB limit." },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const blob = new Blob([arrayBuffer], { type: file.type });

    const apiFormData = new FormData();
    apiFormData.append("image_file", blob, file.name || "image.png");
    apiFormData.append("size", "auto");

    const response = await fetch("https://api.remove.bg/v1.0/removebg", {
      method: "POST",
      headers: {
        "X-Api-Key": REMOVE_BG_API_KEY,
      },
      body: apiFormData,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      console.error("remove.bg API error:", response.status, errorText);
      let detail = "Failed to remove background. Please try again later.";
      try {
        const errorData = JSON.parse(errorText);
        if (errorData.errors?.[0]?.title) {
          detail = errorData.errors[0].title;
        }
      } catch {}
      return NextResponse.json({ error: detail }, { status: 502 });
    }

    const resultBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(resultBuffer).toString("base64");

    return NextResponse.json({
      image: `data:image/png;base64,${base64}`,
    });
  } catch (error) {
    console.error("remove-background error:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again later." },
      { status: 500 }
    );
  }
}
