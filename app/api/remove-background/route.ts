import { NextRequest, NextResponse } from "next/server";
import { auth } from "../../../auth";
import { getMonthlyUsage, recordUsage } from "@/lib/usage";
import { removeBackground } from "@/lib/photoroom";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const ALLOWED_SIZES = ["preview", "auto", "hd", "full"] as const;

// Temporary plan-aware limits — will be replaced by plans.ts in Task 5
const FILE_SIZE_LIMITS: Record<string, number> = {
  free: 5 * 1024 * 1024,
  basic: 25 * 1024 * 1024,
  pro: 25 * 1024 * 1024,
};

const SIZE_INDEX: Record<string, number> = {
  preview: 0, auto: 1, hd: 2, full: 3,
};
const QUALITY_CEILING: Record<string, number> = {
  free: 2,    // max HD
  basic: 3,   // max Ultra HD
  pro: 3,
};

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 }
    );
  }

  const { used, limit, plan } = await getMonthlyUsage(session.user.id);
  if (used >= limit) {
    return NextResponse.json(
      {
        error: `Monthly quota exceeded (${used}/${limit} on ${plan} plan).`,
        code: "quota_exceeded",
        used,
        limit,
      },
      { status: 403 }
    );
  }

  const apiKey = process.env.PHOTOROOM_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Service is not configured." },
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

    const maxSize = FILE_SIZE_LIMITS[plan] ?? FILE_SIZE_LIMITS.free;
    if (file.size > maxSize) {
      const limitMB = Math.round(maxSize / (1024 * 1024));
      return NextResponse.json(
        { error: `File size exceeds ${limitMB}MB limit for ${plan} plan.` },
        { status: 400 }
      );
    }

    const requestedSize = (formData.get("size") as string) || "auto";
    let size = (ALLOWED_SIZES as readonly string[]).includes(requestedSize)
      ? requestedSize
      : "auto";

    const maxSizeIndex = QUALITY_CEILING[plan] ?? QUALITY_CEILING.free;
    if ((SIZE_INDEX[size] ?? 0) > maxSizeIndex) {
      const capped = Object.entries(SIZE_INDEX).find(([, v]) => v === maxSizeIndex);
      size = capped ? capped[0] : "hd";
    }

    const arrayBuffer = await file.arrayBuffer();
    const blob = new Blob([arrayBuffer], { type: file.type });

    const result = await removeBackground(apiKey, blob, file.name || "image.png", size);

    if (!result.ok) {
      console.error("PhotoRoom API error:", result.status, result.message);
      return NextResponse.json({ error: result.message }, { status: 502 });
    }

    const bytes = new Uint8Array(result.imageBuffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);

    await recordUsage(session.user.id, size);

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
