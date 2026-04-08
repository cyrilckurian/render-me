import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Image } from "https://deno.land/x/imagescript@1.2.15/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { renderId, renderPath } = await req.json();
    if (!renderId || !renderPath) {
      return new Response(JSON.stringify({ error: "Missing renderId or renderPath" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Download the rendered image from storage
    const { data: fileData, error: downloadError } = await serviceClient.storage
      .from("floor-plans")
      .download(renderPath);

    if (downloadError || !fileData) {
      console.error("Download error:", downloadError?.message);
      return new Response(JSON.stringify({ error: "Failed to download render" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Decode, resize to 150px wide, encode JPEG q50
    const imageBytes = new Uint8Array(await fileData.arrayBuffer());
    const img = await Image.decode(imageBytes);
    const thumbWidth = 150;
    const thumbHeight = Math.round((img.height / img.width) * thumbWidth);
    const thumb = img.resize(thumbWidth, thumbHeight);
    const thumbBytes = await thumb.encodeJPEG(50);

    // Derive thumbnail path from render path: renders/{userId}/{uuid}/original.png → .../thumbnail.jpg
    const thumbnailPath = renderPath.replace("original.png", "thumbnail.jpg");

    const { error: uploadError } = await serviceClient.storage
      .from("floor-plans")
      .upload(thumbnailPath, thumbBytes, { contentType: "image/jpeg" });

    if (uploadError) {
      console.error("Thumbnail upload error:", uploadError.message);
      return new Response(JSON.stringify({ error: "Failed to upload thumbnail" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update render record with thumbnail_path
    const { error: updateError } = await serviceClient
      .from("renders")
      .update({ thumbnail_path: thumbnailPath })
      .eq("id", renderId);

    if (updateError) {
      console.error("DB update error:", updateError.message);
    }

    return new Response(JSON.stringify({ ok: true, thumbnailPath }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-thumbnail error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
