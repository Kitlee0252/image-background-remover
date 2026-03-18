import { NextRequest, NextResponse } from "next/server";
import { auth } from "../../../auth";
import { getMonthlyUsage, recordUsage, checkPlanExpiry } from "@/lib/usage";
import { getCreditBalance, deductCredit } from "@/lib/credits";
import { getEffectivePlan, capQuality, PlanId } from "@/lib/plans";
import { removeBackground } from "@/lib/photoroom";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const ALLOWED_SIZES = ["preview", "auto", "hd", "full"] as const;

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 }
    );
  }

  const userId = session.user.id;

  // 1. Resolve plan (auto-downgrade if expired)
  const plan = await checkPlanExpiry(userId) as PlanId;

  // 2. Get quota usage and credit balance
  const { used, limit } = await getMonthlyUsage(userId);
  const creditBalance = await getCreditBalance(userId);
  const quotaExhausted = used >= limit;

  // 3. Pre-check: if quota exhausted AND no credits, reject
  if (quotaExhausted && creditBalance <= 0) {
    return NextResponse.json(
      {
        error: `Monthly quota exceeded (${used}/${limit} on ${plan} plan). Purchase credits to continue.`,
        code: "quota_exceeded",
        used,
        limit,
      },
      { status: 403 }
    );
  }

  // 4. Compute effective plan (free+credits gets upgraded limits)
  const effectivePlan = getEffectivePlan(plan, creditBalance);

  // Pick API: prefer PhotoRoom, fall back to remove.bg
  const photoroomKey = process.env.PHOTOROOM_API_KEY;
  const removebgKey = process.env.REMOVE_BG_API_KEY;
  const usePhotoRoom = !!photoroomKey;
  const apiKey = photoroomKey || removebgKey;

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

    // 5. File size check using effective plan limits
    if (file.size > effectivePlan.maxFileSizeBytes) {
      const limitMB = Math.round(effectivePlan.maxFileSizeBytes / (1024 * 1024));
      return NextResponse.json(
        { error: `File size exceeds ${limitMB}MB limit for ${plan} plan.` },
        { status: 400 }
      );
    }

    // 6. Quality ceiling via capQuality
    const requestedSize = (formData.get("size") as string) || "auto";
    const validSize = (ALLOWED_SIZES as readonly string[]).includes(requestedSize)
      ? requestedSize
      : "auto";
    const size = capQuality(validSize, effectivePlan);

    const arrayBuffer = await file.arrayBuffer();
    const blob = new Blob([arrayBuffer], { type: file.type });

    let base64: string;

    if (usePhotoRoom) {
      // PhotoRoom API
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
      base64 = btoa(binary);
    } else {
      // remove.bg fallback
      const apiFormData = new FormData();
      apiFormData.append("image_file", blob, file.name || "image.png");
      apiFormData.append("size", size);
      const response = await fetch("https://api.remove.bg/v1.0/removebg", {
        method: "POST",
        headers: { "X-Api-Key": apiKey },
        body: apiFormData,
      });
      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        console.error("remove.bg API error:", response.status, errorText);
        let detail = "Failed to remove background.";
        try {
          const errorData = JSON.parse(errorText);
          if (errorData.errors?.[0]?.title) detail = errorData.errors[0].title;
        } catch {}
        return NextResponse.json({ error: detail }, { status: 502 });
      }
      const resultBuffer = await response.arrayBuffer();
      const bytes = new Uint8Array(resultBuffer);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      base64 = btoa(binary);
    }

    // 7. AFTER success: deduct credit if quota was exhausted, always record usage
    if (quotaExhausted) {
      await deductCredit(userId);
    }
    await recordUsage(userId, size);

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
