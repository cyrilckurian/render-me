import { NextRequest, NextResponse } from "next/server";

const VERTEX_API_KEY = process.env.VERTEX_API_KEY;
const VERTEX_PROJECT_ID = process.env.VERTEX_PROJECT_ID || "renderme-489407";
const VERTEX_LOCATION = process.env.VERTEX_LOCATION || "us-central1";
const GEMINI_MODEL = "gemini-3-pro-image-preview";

export async function POST(req: NextRequest) {
  try {
    const { renderBase64, maskBase64, prompt, regionBounds, croppedRegion } = await req.json();

    if (!renderBase64 || !prompt) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    if (!VERTEX_API_KEY) {
      return NextResponse.json({ error: "VERTEX_API_KEY not configured" }, { status: 500 });
    }

    const fullMime = renderBase64.split(",")[0].split(":")[1].split(";")[0];
    const fullData = renderBase64.split(",")[1];

    const parts: object[] = [];

    parts.push({ text: "IMAGE A — FULL SCENE (this is the base image you must edit and output):" });
    parts.push({ inline_data: { mime_type: fullMime, data: fullData } });

    if (croppedRegion?.startsWith("data:")) {
      const cropMime = croppedRegion.split(",")[0].split(":")[1].split(";")[0];
      const cropData = croppedRegion.split(",")[1];
      parts.push({ text: "IMAGE B — CLOSE-UP of the area to edit:" });
      parts.push({ inline_data: { mime_type: cropMime, data: cropData } });
    }

    const locationHint = regionBounds
      ? `The area to edit is at approximately ${Math.round(regionBounds.x + regionBounds.w / 2)}% from left, ${Math.round(regionBounds.y + regionBounds.h / 2)}% from top of the image.`
      : "";

    parts.push({
      text: `EDITING TASK: "${prompt}"

${locationHint}
${croppedRegion ? "IMAGE B shows a close-up of the exact element to change." : ""}

RULES:
1. Output the complete IMAGE A with only the requested change applied. Do NOT output a crop.
2. Change ONLY the specific architectural element described. Keep everything else — cars, landscaping, walls, driveway, sky, trees — PIXEL-PERFECT identical.
3. Match the scene's lighting direction, shadow style, color temperature, and render quality exactly.
4. The new element must be fully visible — do NOT clip at any image edge.
5. Maintain photorealistic 3D CGI render quality throughout.`,
    });

    const endpoint = `https://aiplatform.googleapis.com/v1/projects/${VERTEX_PROJECT_ID}/locations/${VERTEX_LOCATION}/publishers/google/models/${GEMINI_MODEL}:generateContent`;

    let res: Response | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) {
        const delay = 2000 * Math.pow(2, attempt - 1);
        console.log(`[Vertex] rate limited, retrying in ${delay}ms`);
        await new Promise((r) => setTimeout(r, delay));
      }
      res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": VERTEX_API_KEY,
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts }],
          generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
        }),
      });
      if (res.status !== 429) break;
    }

    if (!res!.ok) {
      const err = await res!.text();
      console.error("[Vertex] error:", err.slice(0, 400));
      return NextResponse.json({ error: `Vertex error: ${res!.status} — ${err.slice(0, 200)}` }, { status: 500 });
    }

    const aiData = await res!.json();
    const responseParts = aiData.candidates?.[0]?.content?.parts || [];
    const imgPart = responseParts.find(
      (p: Record<string, unknown>) => p.inline_data || p.inlineData
    );

    if (!imgPart) {
      const text = responseParts.find((p: Record<string, unknown>) => p.text)?.text;
      console.error("[Vertex] no image returned. Text:", String(text ?? "").slice(0, 200));
      return NextResponse.json({ error: "Vertex returned no image" }, { status: 500 });
    }

    const dataObj = imgPart.inline_data || imgPart.inlineData;
    const resultB64 = `data:${dataObj.mime_type || dataObj.mimeType};base64,${dataObj.data}`;

    return NextResponse.json({
      imageBase64: resultB64,
      compositeRegion: false,
      regionBounds,
    });
  } catch (e) {
    console.error("[edit-render]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
