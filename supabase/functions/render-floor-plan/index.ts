import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");

    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { floorPlanBase64, prompt, styleId, styleName, floorPlanName, referenceImages } = await req.json();

    if (!floorPlanBase64 || !prompt) {
      return new Response(JSON.stringify({ error: "Missing floor plan or prompt" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isCloneStyle = prompt.startsWith("__CLONE_STYLE__") && Array.isArray(referenceImages) && referenceImages.length > 0;

    // Build message content
    const messageContent: any[] = [];

    if (isCloneStyle) {
      // Opening instruction
      messageContent.push({
        type: "text",
        text: `You are an expert architectural renderer. Your job is to extract a complete visual style fingerprint from the STYLE REFERENCE image(s) below, then apply that style to a different floor plan.

## STEP 1 — Deep Style Extraction (from STYLE REFERENCE image)
Analyze the reference image exhaustively. Extract every visual detail:

**Medium & Technique**
- Is it hand-drawn, watercolor, marker, colored pencil, CAD vector, or digital painting?
- Are lines hand-stroked with natural variation, or crisp and mechanical?
- Is there visible paper texture, grain, or wash bleed?

**Line & Wall Treatment**
- Wall thickness and how walls terminate (capped, open, bold outline)
- Line weight hierarchy (outer walls vs inner walls vs furniture)
- Are walls filled solid black, hatched, double-lined, or left hollow?

**Color Palette — extract exact colors for each element**
- Floor/room fill colors per room type (bedroom, bathroom, kitchen, living, etc.)
- Wall color, outline color, stroke color
- Furniture fill and outline colors
- Background/paper color
- Vegetation, outdoor areas, circulation paths
- Any gradient, wash, or transparency effects

**Flooring & Material Textures**
- Wood plank direction, grain style, spacing — which rooms have it?
- Tile patterns (size, grid vs diagonal, grout lines) — which rooms?
- Hatching patterns for bathrooms, stairs, or structural elements
- Concrete, stone, or carpet textures if present

**Furniture & Fixture Style**
- Level of detail (simple silhouettes vs highly detailed icons)
- Shading and shadow on furniture (drop shadow, cast shadow, flat)
- Furniture outline weight vs fill
- How beds, sofas, tables, kitchen counters, bathroom fixtures are drawn

**Shadow & Depth**
- Does the render use drop shadows under walls? Angle and softness?
- Interior ambient shading inside rooms?
- Any 3D-like elevation or isometric effects?

**Vegetation & Surroundings**
- Tree/shrub style (blob circles, detailed foliage, watercolor splashes)
- Ground cover, pathways, exterior textures

**Typography & Annotations**
- Font style for room labels (serif, sans-serif, handwritten, all-caps)
- Dimension line style (if present)
- Label placement and sizing

**Overall Mood**
- Professional/technical, hand-crafted/artsy, minimalist, rich/detailed?

---

## STEP 2 — Render the TARGET FLOOR PLAN in that extracted style

ABSOLUTE RULES — violation means the output is wrong:
1. The TARGET FLOOR PLAN's spatial layout is FIXED. Every wall, room boundary, door, window, and room label must remain exactly where it is.
2. Do NOT copy rooms, shapes, or building geometry from the reference image.
3. ONLY change the visual appearance — apply the extracted colors, textures, line styles, shadows, furniture drawing style, and materials to the TARGET FLOOR PLAN's own layout.
4. Match the reference style as faithfully as possible — if bedrooms had warm wood flooring in the reference, apply the same to bedrooms in the target. If bathrooms had tile hatching, apply that too.
5. If there are staircases, render steps ascending in one direction only.`,
      });

      // Add each reference image with a clear label
      referenceImages.forEach((refBase64: string, i: number) => {
        messageContent.push({
          type: "text",
          text: `=== STYLE REFERENCE IMAGE ${i + 1} of ${referenceImages.length} ===
Extract the complete visual style from this image using the framework above. This image is a STYLE SOURCE ONLY — do not use its floor plan layout or room arrangement in your output.`,
        });
        messageContent.push({ type: "image_url", image_url: { url: refBase64 } });
      });

      // Label the floor plan explicitly
      messageContent.push({
        type: "text",
        text: `=== TARGET FLOOR PLAN — RENDER THIS ===
This is the floor plan you must render. Its layout is fixed and must not change.
Apply every stylistic element you extracted from the STYLE REFERENCE(S) above to THIS floor plan's geometry.
Output: a top-down 2D floor plan matching this exact layout, rendered in the cloned style.`,
      });
    } else {
      messageContent.push({
        type: "text",
        text: `You are an expert architectural renderer. Given this floor plan image, generate a beautifully rendered version in the following style:\n\n${prompt}\n\nCreate a high-quality architectural visualization based on the floor plan layout. Maintain the spatial arrangement and proportions of the original floor plan while applying the requested artistic style. Important: if the floor plan contains any staircases, render them so that steps ascend in only one direction — one end of the staircase faces the lower floor and the other end faces the upper floor. Never render steps going in both directions simultaneously.`,
      });
    }

    // Add the floor plan last
    messageContent.push({ type: "image_url", image_url: { url: floorPlanBase64 } });


    const commonBody = JSON.stringify({
      contents: [
        {
          role: "user",
          parts: messageContent.map(part => {
            if (part.type === "text") return { text: part.text };
            if (part.type === "image_url") {
              const base64Data = part.image_url.url.split(",")[1];
              const mimeType = part.image_url.url.split(",")[0].split(":")[1].split(";")[0];
              return { inline_data: { mime_type: mimeType, data: base64Data } };
            }
            return {};
          }),
        },
      ],
      generationConfig: {
        responseModalities: ["IMAGE", "TEXT"],
      },
    });

    let aiResponse;
    const useVertexAI = true;

    if (useVertexAI) {
      // Vertex AI Call
      // You must provide your Google Cloud Project ID and Vertex AI Location corresponding to this API route.
      const VERTEX_PROJECT_ID = Deno.env.get("VERTEX_PROJECT_ID") || "YOUR_PROJECT_ID";
      const VERTEX_LOCATION = Deno.env.get("VERTEX_LOCATION") || "us-central1";
      const VERTEX_MODEL = "gemini-3-pro-image-preview"; // Update with the required Vertex AI model containing image output support
      const VERTEX_API_KEY = Deno.env.get("VERTEX_API_KEY");

      // Uses the Vertex Express endpoint (aiplatform.googleapis.com without region prefix)
      // and the x-goog-api-key header which is required for AQ. prefixed API keys.
      aiResponse = await fetch(`https://aiplatform.googleapis.com/v1/projects/${VERTEX_PROJECT_ID}/locations/${VERTEX_LOCATION}/publishers/google/models/${VERTEX_MODEL}:generateContent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": VERTEX_API_KEY || "",
        },
        body: commonBody,
      });
    } else {
      // Original Call (Google AI Studio)
      const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
      if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not configured");

      aiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent?key=${GEMINI_API_KEY}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: commonBody,
      });
    }

    if (!aiResponse.ok) {
      const status = aiResponse.status;
      const errorText = await aiResponse.text();
      console.error("AI API error:", status, errorText);
      return new Response(JSON.stringify({ error: `AI API error (${status}): ${errorText}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();

    // Support both snake_case (standard API) and camelCase
    const firstCandidate = aiData.candidates?.[0];
    const parts = firstCandidate?.content?.parts || [];
    const generatedPart = parts.find((p: any) => p.inline_data || p.inlineData);

    let generatedImage = null;
    if (generatedPart) {
      const dataObj = generatedPart.inline_data || generatedPart.inlineData;
      const mimeType = dataObj.mime_type || dataObj.mimeType;
      const base64Data = dataObj.data;
      if (mimeType && base64Data) {
        generatedImage = `data:${mimeType};base64,${base64Data}`;
      }
    }

    if (!generatedImage) {
      const textResponse = parts.find((p: any) => p.text)?.text;
      const promptFeedback = aiData.promptFeedback;

      let errorMsg = "AI did not return an image.";
      if (textResponse) errorMsg += ` AI responded with text: ${textResponse.slice(0, 100)}`;
      if (!aiData.candidates || aiData.candidates.length === 0) {
        errorMsg += " No candidates returned. This usually means the prompt was blocked.";
        if (promptFeedback) errorMsg += ` Feedback: ${JSON.stringify(promptFeedback)}`;
      }

      return new Response(JSON.stringify({ error: errorMsg }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Upload to storage
    const originalBase64 = floorPlanBase64.replace(/^data:image\/\w+;base64,/, "");
    const originalBytes = Uint8Array.from(atob(originalBase64), (c) => c.charCodeAt(0));
    const originalExt = floorPlanName?.split(".").pop() || "png";
    const originalFileName = `${user.id}/${crypto.randomUUID()}.${originalExt}`;
    const originalContentType = floorPlanBase64.match(/^data:(image\/\w+);/)?.[1] || "image/png";

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Ensure bucket exists (safeguard)
    const { data: bucket, error: bucketError } = await serviceClient.storage.getBucket("floor-plans");
    if (bucketError && bucketError.message.includes("not found")) {
      await serviceClient.storage.createBucket("floor-plans", { public: false });
    }

    const { error: originalUploadError } = await serviceClient.storage
      .from("floor-plans")
      .upload(`originals/${originalFileName}`, originalBytes, { contentType: originalContentType });

    if (originalUploadError) {
      console.error("Original upload error:", originalUploadError.message);
    }

    const originalStoragePath = `originals/${originalFileName}`;

    const base64Data = generatedImage.replace(/^data:image\/\w+;base64,/, "");
    const imageBytes = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
    const renderFileName = `${user.id}/${crypto.randomUUID()}.png`;
    const renderStoragePath = `renders/${renderFileName}`;

    const { error: uploadError } = await serviceClient.storage
      .from("floor-plans")
      .upload(renderStoragePath, imageBytes, { contentType: "image/png" });

    if (uploadError) {
      console.error("Upload error:", uploadError.message);
      return new Response(JSON.stringify({ error: "Failed to save rendered image", details: uploadError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Save render record
    const { data: insertData, error: insertError } = await serviceClient.from("renders").insert({
      user_id: user.id,
      prompt,
      style_id: styleId || "custom",
      style_name: styleName || "Custom",
      floor_plan_name: floorPlanName || "floor-plan.png",
      floor_plan_path: originalStoragePath,
      rendered_image_path: renderStoragePath,
    }).select("id").single();

    if (insertError) {
      console.error("Insert error:", insertError.message);
    }

    // Generate a short-lived signed URL for the immediate response
    const { data: signedUrlData } = await serviceClient.storage
      .from("floor-plans")
      .createSignedUrl(renderStoragePath, 3600);

    return new Response(
      JSON.stringify({
        imageUrl: signedUrlData?.signedUrl ?? null,
        renderedBase64: generatedImage,
        renderId: insertData?.id ?? null,
        renderPath: renderStoragePath,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (e) {
    console.error("render-floor-plan error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
