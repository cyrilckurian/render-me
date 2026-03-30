import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("Missing LOVABLE_API_KEY");

    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing Authorization header");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) throw new Error("Unauthorized");

    const { prompt, referenceImages, baseSketch, variationIndex } = await req.json();
    if (!prompt) throw new Error("Missing prompt");

    // Build message content
    const messageContent: any[] = [];

    // System instruction
    messageContent.push({
      type: "text",
      text: `You are an expert architectural visualization AI. Generate a single photorealistic architectural render based on the user's mood board description and any reference images provided. The render should be highly detailed, professional, and reflect the specified design intent for each zone. Output only the final rendered image.`,
    });

    // Base sketch if provided
    if (baseSketch) {
      messageContent.push({
        type: "image_url",
        image_url: { url: baseSketch },
      });
      messageContent.push({
        type: "text",
        text: "Use the above sketch as the spatial layout reference.",
      });
    }

    // Reference images (up to 3)
    if (referenceImages && referenceImages.length > 0) {
      messageContent.push({
        type: "text",
        text: "Reference images for style and mood:",
      });
      for (const img of referenceImages.slice(0, 3)) {
        messageContent.push({
          type: "image_url",
          image_url: { url: img },
        });
      }
    }

    // Main prompt
    messageContent.push({
      type: "text",
      text: prompt,
    });

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-pro-image-preview",
        messages: [{ role: "user", content: messageContent }],
        modalities: ["image", "text"],
      }),
    });

    if (aiResp.status === 429) throw new Error("Rate limit reached. Please try again in a moment.");
    if (aiResp.status === 402) throw new Error("Insufficient credits.");

    const aiData = await aiResp.json();

    // Check for SSE-injected errors
    if (aiData.error) throw new Error(aiData.error.message || "AI error");

    const choice = aiData.choices?.[0];
    if (!choice) throw new Error("No response from AI");

    // Extract generated image — handle multiple response shapes
    const msg = choice.message ?? {};

    // Shape 1: message.images[]
    const fromImages = msg.images?.[0]?.image_url?.url;

    // Shape 2: message.content is an array of parts
    const fromContentArray = Array.isArray(msg.content)
      ? msg.content.find((c: any) => c.type === "image_url")?.image_url?.url
      : undefined;

    // Shape 3: nested data[].b64_json (some gateway variants)
    const fromData = aiData.data?.[0]?.b64_json
      ? `data:image/png;base64,${aiData.data[0].b64_json}`
      : undefined;

    const generatedImage = fromImages || fromContentArray || fromData;

    if (!generatedImage) {
      // Log the raw response shape for easier future debugging
      const preview = JSON.stringify(aiData).slice(0, 500);
      throw new Error(`AI did not return an image. Response preview: ${preview}`);
    }

    return new Response(
      JSON.stringify({ imageBase64: generatedImage, variationIndex }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
