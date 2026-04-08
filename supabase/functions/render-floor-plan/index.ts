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

    const isCloneStyle = typeof prompt === "string" && prompt.startsWith("__CLONE_STYLE__") && Array.isArray(referenceImages) && referenceImages.length > 0;

    if (!floorPlanBase64 || (!prompt && !isCloneStyle)) {
      return new Response(JSON.stringify({ error: "Missing floor plan or prompt" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const VERTEX_PROJECT_ID = Deno.env.get("VERTEX_PROJECT_ID") || "YOUR_PROJECT_ID";
    const VERTEX_LOCATION = Deno.env.get("VERTEX_LOCATION") || "us-central1";
    const VERTEX_API_KEY = Deno.env.get("VERTEX_API_KEY");

    // Image-generation model (Vertex AI)
    const imageApiUrl = `https://aiplatform.googleapis.com/v1/projects/${VERTEX_PROJECT_ID}/locations/${VERTEX_LOCATION}/publishers/google/models/gemini-3-pro-image-preview:generateContent`;
    // Text model for style extraction (Vertex AI — gemini-2.5-flash)
    const textApiUrl = `https://aiplatform.googleapis.com/v1/projects/${VERTEX_PROJECT_ID}/locations/${VERTEX_LOCATION}/publishers/google/models/gemini-2.5-flash:generateContent`;

    const imageHeaders: Record<string, string> = { "Content-Type": "application/json", "x-goog-api-key": VERTEX_API_KEY || "" };
    const textHeaders: Record<string, string> = { "Content-Type": "application/json", "x-goog-api-key": VERTEX_API_KEY || "" };

    // Helper: serialize parts to Gemini format
    const serializeParts = (parts: any[]) => parts.map(part => {
      if (part.type === "text") return { text: part.text };
      if (part.type === "image_url") {
        const base64Data = part.image_url.url.split(",")[1];
        const mimeType = part.image_url.url.split(",")[0].split(":")[1].split(";")[0];
        return { inline_data: { mime_type: mimeType, data: base64Data } };
      }
      return {};
    });

    // Helper: call API with exponential backoff on 429
    const callApi = async (url: string, headers: Record<string, string>, body: string): Promise<Response> => {
      let res!: Response;
      const maxRetries = 4;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        res = await fetch(url, { method: "POST", headers, body });
        if (res.status !== 429) break;
        if (attempt < maxRetries) {
          const delay = Math.min(2000 * Math.pow(2, attempt), 30000);
          console.warn(`429 rate limit hit, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
      return res;
    };

    let finalBody: string;
    let styleDescription = "";  // hoisted — populated during clone style extraction

    if (isCloneStyle) {
      // ── STEP 1: Extract style as text from ALL reference images ──────────────
      const imageCount = referenceImages.length;
      const step1Parts: any[] = [
        {
          type: "text",
          text: `You are an expert architectural renderer. Analyze the ${imageCount > 1 ? `${imageCount} floor plan renderings` : "floor plan rendering"} below and describe a unified visual style in precise detail that captures the common aesthetic across all images. Cover:
- Rendering medium (watercolor, CAD, hand-drawn, digital, etc.)
- Line weights and wall treatment (thickness, fill, outlines)
- Exact color palette for each room type (bedroom, bathroom, kitchen, living, outdoor, etc.)
- Flooring textures per room (wood planks, tiles, hatching, carpet)
- Furniture drawing style (silhouette detail, shading, shadows)
- Shadow and depth treatment (drop shadows, ambient shading, direction)
- Vegetation and exterior style (tree shapes, colors, ground textures)
- Background and paper color
- Typography style for room labels
- Overall artistic mood

Be specific and detailed — your description will be used as instructions to redraw a different floor plan in this exact style.`,
        },
        ...referenceImages.map((img: string) => ({ type: "image_url", image_url: { url: img } })),
      ];

      const step1Body = JSON.stringify({
        contents: [{ role: "user", parts: serializeParts(step1Parts) }],
        generationConfig: { responseModalities: ["TEXT"] },
      });
      const step1Response = await callApi(textApiUrl, textHeaders, step1Body);
      if (!step1Response.ok) {
        const errText = await step1Response.text();
        return new Response(JSON.stringify({ error: `Style extraction failed: ${errText}` }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const step1Data = await step1Response.json();
      styleDescription = step1Data.candidates?.[0]?.content?.parts?.find((p: any) => p.text)?.text || "";
      if (!styleDescription) {
        return new Response(JSON.stringify({ error: "Failed to extract style description from reference images." }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      console.log(`Extracted style from ${imageCount} reference(s):`, styleDescription.slice(0, 200));

      // Store the extracted style description so caller can persist it
      // (used to avoid re-extracting on future renders with this saved style)

      // ── STEP 2: Render the floor plan using the extracted style text ─────────
      const step2Parts = [
        {
          type: "text",
          text: `You are an expert architectural renderer. Render the floor plan image below in the following visual style:

${styleDescription}

RULES:
- Preserve the floor plan's exact layout — every wall, room, door, window, and label stays in place
- Only change the visual appearance to match the style described above
- Output a top-down 2D rendered floor plan
- If there are staircases, render steps ascending in one direction only`,
        },
        { type: "image_url", image_url: { url: floorPlanBase64 } },
      ];
      finalBody = JSON.stringify({
        contents: [{ role: "user", parts: serializeParts(step2Parts) }],
        generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
      });
    } else {
      const renderParts = [
        {
          type: "text",
          text: `You are an expert architectural renderer. Given this floor plan image, generate a beautifully rendered version in the following style:\n\n${prompt}\n\nCreate a high-quality architectural visualization based on the floor plan layout. Maintain the spatial arrangement and proportions of the original floor plan while applying the requested artistic style. Important: if the floor plan contains any staircases, render them so that steps ascend in only one direction — one end of the staircase faces the lower floor and the other end faces the upper floor. Never render steps going in both directions simultaneously.`,
        },
        { type: "image_url", image_url: { url: floorPlanBase64 } },
      ];
      finalBody = JSON.stringify({
        contents: [{ role: "user", parts: serializeParts(renderParts) }],
        generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
      });
    }

    const aiResponse = await callApi(imageApiUrl, imageHeaders, finalBody);

    if (!aiResponse.ok) {
      const status = aiResponse.status;
      const errorText = await aiResponse.text();
      console.error("AI API error:", status, errorText);
      const userMessage = status === 429
        ? "The AI service is currently busy. Please try again in a moment."
        : `AI API error (${status}): ${errorText}`;
      return new Response(JSON.stringify({ error: userMessage }), {
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
        // Detect if model echoed back a reference image instead of generating a new one
        if (isCloneStyle && referenceImages.length > 0) {
          const outputPrefix = base64Data.slice(0, 100);
          const isEcho = referenceImages.some((ref: string) => {
            const refBase64 = ref.split(",")[1] || ref;
            return refBase64.slice(0, 100) === outputPrefix;
          });
          if (isEcho) {
            console.error("Model echoed reference image — aborting");
            return new Response(JSON.stringify({ error: "The AI returned the reference image instead of rendering your floor plan. Please try again." }), {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        }
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

    // Upload original floor plan
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
    const { error: bucketError } = await serviceClient.storage.getBucket("floor-plans");
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
    const renderUUID = crypto.randomUUID();
    const renderFolder = `renders/${user.id}/${renderUUID}`;
    const renderStoragePath = `${renderFolder}/original.png`;

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


    // Upload reference images to storage in parallel (clone-style renders)
    const referenceStoragePaths: string[] = [];
    if (isCloneStyle && Array.isArray(referenceImages) && referenceImages.length > 0) {
      const uploadResults = await Promise.all(
        referenceImages.map(async (dataUrl: string, i: number) => {
          try {
            const base64Part = dataUrl.split(",")[1];
            if (!base64Part) return null;
            const refBytes = Uint8Array.from(atob(base64Part), (c) => c.charCodeAt(0));
            const refPath = `references/${user.id}/${renderUUID}/ref_${i}.png`;
            const { error: refErr } = await serviceClient.storage
              .from("floor-plans")
              .upload(refPath, refBytes, { contentType: "image/png" });
            return refErr ? null : refPath;
          } catch (e) {
            console.error(`Ref image ${i} upload error:`, e);
            return null;
          }
        })
      );
      referenceStoragePaths.push(...uploadResults.filter((p): p is string => p !== null));
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

      ...(referenceStoragePaths.length > 0 ? { reference_image_paths: referenceStoragePaths } : {}),
    }).select("id").single();

    if (insertError) {
      console.error("Insert error:", insertError.message);
    }

    // Fire thumbnail generation in a separate isolated function — no await (fire and forget)
    if (insertData?.id) {
      fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/generate-thumbnail`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({ renderId: insertData.id, renderPath: renderStoragePath }),
      }).catch((e) => console.error("Failed to trigger thumbnail generation:", e));
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
        originalPath: originalStoragePath,
        extractedStylePrompt: isCloneStyle ? styleDescription : null,
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
