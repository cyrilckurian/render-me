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
    const messageContent: any[] = [
      {
        type: "text",
        text: isCloneStyle
          ? `You are an expert architectural renderer. The user has provided ${referenceImages.length} reference image(s) that define a specific visual style. Analyze these reference images carefully to understand the artistic style, color palette, line weight, rendering technique, and overall aesthetic. Then apply EXACTLY that style to the floor plan image provided. Maintain the spatial layout and proportions of the floor plan while transforming its appearance to match the style of the references. Produce a high-quality architectural visualization.`
          : `You are an expert architectural renderer. Given this floor plan image, generate a beautifully rendered version in the following style:\n\n${prompt}\n\nCreate a high-quality architectural visualization based on the floor plan layout. Maintain the spatial arrangement and proportions of the original floor plan while applying the requested artistic style. Important: if the floor plan contains any staircases, render them so that steps ascend in only one direction — one end of the staircase faces the lower floor and the other end faces the upper floor. Never render steps going in both directions simultaneously.`,
      },
    ];

    // Add reference images for clone mode
    if (isCloneStyle) {
      for (const refBase64 of referenceImages) {
        messageContent.push({ type: "image_url", image_url: { url: refBase64 } });
      }
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
