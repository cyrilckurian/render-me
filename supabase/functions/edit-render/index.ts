import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { zipSync } from "https://esm.sh/fflate@0.8.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─────────────────────────────────────────────────────────────────────────────
// Helper: fetch a URL and return base64 data URI
// ─────────────────────────────────────────────────────────────────────────────
async function urlToDataUri(url: string): Promise<{ dataUri: string; mime: string; b64: string }> {
  const res = await fetch(url);
  const buf = await res.arrayBuffer();
  const mime = res.headers.get("content-type") || "image/png";
  const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
  return { dataUri: `data:${mime};base64,${b64}`, mime, b64 };
}

// ─────────────────────────────────────────────────────────────────────────────
// PATH A: ComfyUI via fofr/any-comfyui-workflow (Replicate)
// Uses SDXL inpainting checkpoint (RealVisXL V4) for photorealistic quality.
// Mask convention: white = edit, black = preserve
// ─────────────────────────────────────────────────────────────────────────────

function buildComfyWorkflow(prompt: string): string {
  const negativePrompt =
    "ugly, blurry, low quality, distorted, artifacts, deformed, unrealistic, cartoon, painting, sketch, watercolor, bad proportions, inconsistent lighting, pixelated, noisy";

  // Files are extracted from input_archive into the ComfyUI input directory
  const workflow = {
    "1": {
      "class_type": "CheckpointLoaderSimple",
      "inputs": { "ckpt_name": "sd_xl_base_1.0.safetensors" },
    },
    "2": {
      "class_type": "LoadImage",
      "inputs": { "image": "input_image.jpg" },
    },
    "3": {
      "class_type": "LoadImage",
      "inputs": { "image": "input_mask.png" },
    },
    "4": {
      "class_type": "ImageToMask",
      "inputs": { "image": ["3", 0], "channel": "red" },
    },
    "5": {
      "class_type": "CLIPTextEncode",
      "inputs": {
        "text": `${prompt}, architectural visualization, photorealistic 3D CGI render, high resolution, sharp details, professional architectural rendering, consistent lighting, seamlessly integrated`,
        "clip": ["1", 1],
      },
    },
    "6": {
      "class_type": "CLIPTextEncode",
      "inputs": { "text": negativePrompt, "clip": ["1", 1] },
    },
    "7": {
      "class_type": "VAEEncodeForInpaint",
      "inputs": {
        "grow_mask_by": 8,
        "pixels": ["2", 0],
        "vae": ["1", 2],
        "mask": ["4", 0],
      },
    },
    "8": {
      "class_type": "KSampler",
      "inputs": {
        "model": ["1", 0],
        "positive": ["5", 0],
        "negative": ["6", 0],
        "latent_image": ["7", 0],
        "seed": Math.floor(Math.random() * 2 ** 32),
        "steps": 40,
        "cfg": 8,
        "sampler_name": "dpmpp_2m",
        "scheduler": "karras",
        "denoise": 1.0,
      },
    },
    "9": {
      "class_type": "VAEDecode",
      "inputs": { "samples": ["8", 0], "vae": ["1", 2] },
    },
    "10": {
      "class_type": "SaveImage",
      "inputs": { "filename_prefix": "inpaint", "images": ["9", 0] },
    },
  };

  return JSON.stringify(workflow);
}

/** Pack image + mask into a zip data URI for comfyui/any-comfyui-workflow input_archive */
function buildInputArchive(imageDataUri: string, maskDataUri: string): string {
  const toBytes = (dataUri: string) =>
    Uint8Array.from(atob(dataUri.split(",")[1]), (c) => c.charCodeAt(0));

  const zipped = zipSync({
    "input_image.jpg": toBytes(imageDataUri),
    "input_mask.png": toBytes(maskDataUri),
  });

  // Convert Uint8Array to base64 in chunks to avoid call stack overflow
  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < zipped.length; i += chunkSize) {
    binary += String.fromCharCode(...zipped.subarray(i, i + chunkSize));
  }
  return "data:application/zip;base64," + btoa(binary);
}

async function runComfyUI(
  imageDataUri: string,
  maskDataUri: string,
  prompt: string,
  apiToken: string,
): Promise<string | null> {
  console.log("[ComfyUI] Building input archive and starting SDXL workflow");

  const inputArchive = buildInputArchive(imageDataUri, maskDataUri);

  // Use versioned predictions endpoint (comfyui/any-comfyui-workflow moved from fofr org)
  const startRes = await fetch(
    "https://api.replicate.com/v1/predictions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
        "Prefer": "wait=60",
      },
      body: JSON.stringify({
        version: "16d0a881fbfc066f0471a3519a347db456fe8cbcbd53abb435a50a74efaeb427",
        input: {
          workflow_json: buildComfyWorkflow(prompt),
          input_archive: inputArchive,
          randomise_seeds: false,
          return_temp_files: false,
        },
      }),
    },
  );

  if (!startRes.ok) {
    const errText = await startRes.text();
    console.error(`[ComfyUI] HTTP ${startRes.status}:`, errText.slice(0, 500));
    return null;
  }

  let pred = await startRes.json();
  console.log(`[ComfyUI] status="${pred.status}" id=${pred.id ?? "none"}`);

  if (pred.status === "succeeded") {
    return extractComfyOutput(pred.output);
  }

  if (!pred.id) {
    console.error("[ComfyUI] No prediction id:", JSON.stringify(pred).slice(0, 300));
    return null;
  }

  // Poll up to 3 minutes
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 5_000));
    const pollRes = await fetch(`https://api.replicate.com/v1/predictions/${pred.id}`, {
      headers: { Authorization: `Bearer ${apiToken}` },
    });
    pred = await pollRes.json();
    console.log("[ComfyUI] poll:", pred.status);
    if (pred.status === "succeeded") return extractComfyOutput(pred.output);
    if (pred.status === "failed" || pred.status === "canceled") {
      console.error("[ComfyUI] failed:", pred.error);
      return null;
    }
  }

  console.error("[ComfyUI] timed out");
  return null;
}

async function extractComfyOutput(output: unknown): Promise<string | null> {
  // fofr/any-comfyui-workflow returns { files: [url], images: [url] }
  const urls: string[] = [];
  if (output && typeof output === "object") {
    const o = output as Record<string, unknown>;
    if (Array.isArray(o.images)) urls.push(...o.images as string[]);
    else if (Array.isArray(o.files)) urls.push(...o.files as string[]);
    else if (Array.isArray(output)) urls.push(...output as string[]);
  }
  const url = urls[0];
  if (!url || typeof url !== "string") {
    console.error("[ComfyUI] No output URL in:", JSON.stringify(output).slice(0, 300));
    return null;
  }
  try {
    const { dataUri } = await urlToDataUri(url);
    return dataUri;
  } catch (e) {
    console.error("[ComfyUI] Failed to fetch output:", e);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PATH B: Replicate Flux Fill Pro / SD Inpainting (fallback)
// ─────────────────────────────────────────────────────────────────────────────


async function runReplicate(
  imageDataUri: string,
  maskDataUri: string,
  prompt: string,
  apiToken: string,
  _srcW: number,
  _srcH: number,
): Promise<string | null> {
  const positivePrompt = [
    prompt,
    "architectural visualization, photorealistic 3D CGI render, high resolution, sharp details, professional architectural rendering, consistent lighting, seamlessly integrated",
  ].join(", ");

  console.log(`[Replicate] Flux Fill Pro inpainting`);

  // black-forest-labs/flux-fill-pro — Flux architecture, same model as fal.ai Flux Pro Fill
  const startRes = await fetch(
    "https://api.replicate.com/v1/models/black-forest-labs/flux-fill-pro/predictions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
        "Prefer": "wait=60",
      },
      body: JSON.stringify({
        input: {
          image: imageDataUri,
          mask: maskDataUri,
          prompt: positivePrompt,
          steps: 50,
          guidance: 30,
          output_format: "jpg",
          output_quality: 95,
        },
      }),
    },
  );

  if (!startRes.ok) {
    const errText = await startRes.text();
    console.error(`[Replicate] HTTP ${startRes.status}:`, errText.slice(0, 500));
    return null;
  }

  let pred = await startRes.json();
  console.log(`[Replicate] initial status="${pred.status}" id=${pred.id ?? "none"} error=${pred.detail ?? pred.error ?? "none"}`);

  // If the result is already there (synchronous wait succeeded) extract it
  if (pred.status === "succeeded") {
    return await extractReplicateOutput(pred.output);
  }

  // Otherwise poll (Replicate returned before finishing)
  if (!pred.id) {
    console.error("Replicate returned no prediction id:", JSON.stringify(pred).slice(0, 300));
    return null;
  }

  const maxWaitMs = 120_000; // 2 minutes
  const pollIntervalMs = 4_000;
  const deadline = Date.now() + maxWaitMs;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, pollIntervalMs));
    const pollRes = await fetch(`https://api.replicate.com/v1/predictions/${pred.id}`, {
      headers: { Authorization: `Bearer ${apiToken}` },
    });
    pred = await pollRes.json();
    console.log("Replicate poll status:", pred.status);

    if (pred.status === "succeeded") {
      console.log("[Replicate] poll succeeded, output:", JSON.stringify(pred.output).slice(0, 200));
      return await extractReplicateOutput(pred.output);
    }
    if (pred.status === "failed" || pred.status === "canceled") {
      console.error(`[Replicate] poll ${pred.status}:`, pred.error);
      return null;
    }
  }

  console.error("Replicate timed out");
  return null;
}

async function extractReplicateOutput(output: unknown): Promise<string | null> {
  const url = Array.isArray(output) ? output[0] : output;
  if (typeof url !== "string") return null;
  try {
    const { dataUri } = await urlToDataUri(url);
    return dataUri;
  } catch (e) {
    console.error("Failed to fetch Replicate output image:", e);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PATH A-PRIME: fal.ai — Flux Pro Fill (inpainting)
// Flux is a much higher-quality model than SD 1.5; outputs at original resolution.
// Docs: https://fal.ai/models/fal-ai/flux-pro/v1/fill
// ─────────────────────────────────────────────────────────────────────────────
async function runFal(
  imageDataUri: string,
  maskDataUri: string,
  prompt: string,
  apiKey: string,
): Promise<string | null> {
  const positivePrompt = [
    prompt,
    "architectural visualization, photorealistic 3D CGI render, high resolution, sharp details, professional architectural rendering, consistent lighting, seamlessly integrated",
  ].join(", ");

  console.log("[Fal] Flux Pro Fill inpainting");

  const res = await fetch("https://fal.run/fal-ai/flux-pro/v1/fill", {
    method: "POST",
    headers: {
      "Authorization": `Key ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      image_url: imageDataUri,
      mask_url: maskDataUri,
      prompt: positivePrompt,
      num_inference_steps: 50,
      guidance_scale: 30,
      output_image_format: "jpeg",
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error(`[Fal] HTTP ${res.status}:`, err.slice(0, 500));
    return null;
  }

  const data = await res.json();
  const imageUrl = data?.images?.[0]?.url;
  const outW = data?.images?.[0]?.width;
  const outH = data?.images?.[0]?.height;
  console.log(`[Fal] output: ${outW}x${outH}, url=${imageUrl ? "present" : "missing"}`);
  if (!imageUrl) {
    console.error("[Fal] No image in response:", JSON.stringify(data).slice(0, 300));
    return null;
  }

  try {
    const { dataUri } = await urlToDataUri(imageUrl);
    return dataUri;
  } catch (e) {
    console.error("[Fal] Failed to fetch output:", e);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PATH B: Imagen 3 mask-based inpainting (fallback)
// ─────────────────────────────────────────────────────────────────────────────
async function runImagen(
  fullData: string,
  maskData: string,
  prompt: string,
  projectId: string,
  location: string,
  apiKey: string,
): Promise<string | null> {
  const inpaintPrompt = [
    prompt,
    "Architectural visualization, photorealistic 3D render quality.",
    "The inpainted area must match the perspective, lighting direction, shadow depth, color temperature, and material finish of the surrounding scene.",
    "Hard edges of the new element must align cleanly with adjacent structural elements.",
    "CRITICAL: every part of the new architectural element — including all peaks, eaves, gables, and ornamental tips — must be fully visible and must NOT be clipped at any edge of the image.",
    "If the requested style would normally be taller than the available space, scale it down to fit entirely within the image frame.",
    "Do not add or remove any elements outside the edited region.",
  ].join(" ");

  const body = JSON.stringify({
    instances: [{
      prompt: inpaintPrompt,
      image: { bytesBase64Encoded: fullData },
      mask: { image: { bytesBase64Encoded: maskData } },
    }],
    parameters: {
      editConfig: { editMode: "inpainting-insert" },
      sampleCount: 1,
    },
  });

  const endpoint = `https://aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/imagen-3.0-capability-001:predict`;

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body,
    });
    if (!res.ok) {
      console.warn(`Imagen 3 failed (${res.status}):`, (await res.text()).slice(0, 300));
      return null;
    }
    const data = await res.json();
    const prediction = data.predictions?.[0];
    if (prediction?.bytesBase64Encoded) {
      const mime = prediction.mimeType || prediction.mime_type || "image/png";
      return `data:${mime};base64,${prediction.bytesBase64Encoded}`;
    }
    console.warn("Imagen 3 returned no prediction:", JSON.stringify(data).slice(0, 300));
    return null;
  } catch (e) {
    console.warn("Imagen 3 exception:", e);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PATH C: Gemini generateContent (final fallback, no mask required)
// ─────────────────────────────────────────────────────────────────────────────
async function runGemini(
  parts: unknown[],
  projectId: string,
  location: string,
  apiKey: string,
): Promise<string | null> {
  const model = "gemini-2.0-flash-preview-image-generation";
  const endpoint = `https://aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:generateContent`;

  const body = JSON.stringify({
    contents: [{ role: "user", parts }],
    generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
  });

  let res: Response | null = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) {
      const delay = Math.min(2000 * Math.pow(2, attempt - 1), 16000);
      console.log(`Gemini rate limited, retrying in ${delay}ms`);
      await new Promise((r) => setTimeout(r, delay));
    }
    res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body,
    });
    if (res.status !== 429) break;
  }

  if (!res!.ok) {
    console.error("Gemini error:", res!.status, (await res!.text()).slice(0, 400));
    return null;
  }

  const aiData = await res!.json();
  const responseParts = aiData.candidates?.[0]?.content?.parts || [];
  const generatedPart = responseParts.find((p: Record<string, unknown>) => p.inline_data || p.inlineData);
  if (!generatedPart) {
    const textResponse = responseParts.find((p: Record<string, unknown>) => p.text)?.text;
    console.error("Gemini returned no image. Text:", String(textResponse ?? "").slice(0, 200));
    return null;
  }
  const dataObj = generatedPart.inline_data || generatedPart.inlineData;
  const mime = dataObj.mime_type || dataObj.mimeType;
  const b64 = dataObj.data;
  return mime && b64 ? `data:${mime};base64,${b64}` : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main handler
// ─────────────────────────────────────────────────────────────────────────────
serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ── Auth ──────────────────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Parse input ───────────────────────────────────────────────────────────
    const { renderBase64, compressedWidth, compressedHeight, croppedRegion, maskBase64, regionBounds, prompt, referenceImages } =
      await req.json();

    if (!renderBase64) {
      return new Response(JSON.stringify({ error: "Missing render image" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!prompt && (!Array.isArray(referenceImages) || referenceImages.length === 0)) {
      return new Response(JSON.stringify({ error: "Missing prompt or reference images" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const hasReferenceImages = Array.isArray(referenceImages) && referenceImages.length > 0;
    const hasCrop = typeof croppedRegion === "string" && croppedRegion.startsWith("data:");
    const hasMask = typeof maskBase64 === "string" && maskBase64.startsWith("data:");
    const hasBounds = regionBounds && typeof regionBounds.x === "number";

    // Resolve full image base64
    let fullMime: string;
    let fullData: string;
    if (renderBase64.startsWith("data:")) {
      fullMime = renderBase64.split(",")[0].split(":")[1].split(";")[0];
      fullData = renderBase64.split(",")[1];
    } else {
      const r = await urlToDataUri(renderBase64);
      fullMime = r.mime; fullData = r.b64;
    }

    // ── Credentials ───────────────────────────────────────────────────────────
    const FAL_KEY = Deno.env.get("FAL_KEY");
    const REPLICATE_API_TOKEN = Deno.env.get("REPLICATE_API_TOKEN");
    const VERTEX_PROJECT_ID = Deno.env.get("VERTEX_PROJECT_ID") || "YOUR_PROJECT_ID";
    const VERTEX_LOCATION = Deno.env.get("VERTEX_LOCATION") || "us-central1";
    const VERTEX_API_KEY = Deno.env.get("VERTEX_API_KEY") || "";

    let generatedImage: string | null = null;
    let compositeRegion = false;

    console.log(`[edit-render] hasMask=${hasMask} hasFal=${!!FAL_KEY} hasReplicate=${!!REPLICATE_API_TOKEN}`);

    // ── PATH A: ComfyUI SDXL inpainting via Replicate (primary) ──────────────
    if (hasMask && REPLICATE_API_TOKEN) {
      console.log("[edit-render] PATH A: ComfyUI SDXL inpainting");
      generatedImage = await runComfyUI(renderBase64, maskBase64, prompt || "Apply a creative variation to the selected region", REPLICATE_API_TOKEN);
      if (generatedImage) {
        compositeRegion = true;
        console.log("[ComfyUI] succeeded");
      } else {
        console.warn("[ComfyUI] failed, falling back to fal.ai...");
      }
    }

    // ── PATH B: fal.ai Flux Pro Fill (fallback) ───────────────────────────────
    if (!generatedImage && hasMask && FAL_KEY) {
      console.log("[edit-render] PATH B: fal.ai Flux inpainting");
      generatedImage = await runFal(renderBase64, maskBase64, prompt || "Apply a creative variation to the selected region", FAL_KEY);
      if (generatedImage) {
        compositeRegion = true;
        console.log("[Fal] succeeded");
      } else {
        console.warn("[Fal] failed, falling back to Replicate Flux...");
      }
    }

    // ── PATH C: Replicate Flux Fill Pro (fallback) ────────────────────────────
    if (!generatedImage && hasMask && REPLICATE_API_TOKEN) {
      console.log("[edit-render] PATH C: Replicate Flux inpainting");
      generatedImage = await runReplicate(
        renderBase64,
        maskBase64,
        prompt || "Apply a creative variation to the selected region",
        REPLICATE_API_TOKEN,
        compressedWidth || 1024,
        compressedHeight || 768,
      );
      if (generatedImage) {
        compositeRegion = true;
        console.log("Replicate succeeded");
      } else {
        console.warn("Replicate failed, trying Imagen 3...");
      }
    }

    // ── PATH B: Imagen 3 mask-based inpainting ────────────────────────────────
    if (!generatedImage && hasMask && VERTEX_API_KEY) {
      console.log("[edit-render] PATH B: Imagen 3 inpainting");
      const maskData = maskBase64.split(",")[1];
      generatedImage = await runImagen(fullData, maskData, prompt || "", VERTEX_PROJECT_ID, VERTEX_LOCATION, VERTEX_API_KEY);
      if (generatedImage) {
        compositeRegion = false; // show raw output — compositing causes dimension mismatch
        console.log("Imagen 3 succeeded");
      } else {
        console.warn("Imagen 3 failed, falling back to Gemini...");
      }
    }

    // ── PATH C: Gemini (always available, no mask) ────────────────────────────
    if (!generatedImage) {
      console.log("Using Gemini fallback...");

      // Build prompt parts for Gemini
      const parts: unknown[] = [];
      parts.push({ text: "IMAGE A — FULL SCENE (this is the base image you must edit and output):" });
      parts.push({ inline_data: { mime_type: fullMime, data: fullData } });

      if (hasCrop) {
        const cropMime = croppedRegion.split(",")[0].split(":")[1].split(";")[0];
        const cropData = croppedRegion.split(",")[1];
        parts.push({ text: "IMAGE B — CLOSE-UP REFERENCE (use to identify the exact element to edit, but output IMAGE A):" });
        parts.push({ inline_data: { mime_type: cropMime, data: cropData } });
      }

      if (hasReferenceImages) {
        parts.push({ text: "STYLE REFERENCES — visual inspiration for the edited element:" });
        for (const ref of referenceImages) {
          const mime = ref.split(",")[0].split(":")[1].split(";")[0];
          const data = ref.split(",")[1];
          parts.push({ inline_data: { mime_type: mime, data } });
        }
      }

      parts.push({
        text: `EDITING TASK: "${prompt || "Apply a creative variation to the specified element."}"

${hasBounds ? `The element is at approximately ${Math.round(regionBounds.x + regionBounds.w / 2)}% from left, ${Math.round(regionBounds.y + regionBounds.h / 2)}% from top.` : ""}
${hasCrop ? "IMAGE B shows a close-up of this element." : ""}
${hasReferenceImages ? "The style references show the desired look." : ""}

RULES:
1. Output the complete IMAGE A with the change applied. Do NOT output a crop.
2. Change ONLY the single architectural element described by the user.
3. Every other element — cars, landscaping, walls, driveway, sky, trees — must remain PIXEL-PERFECT identical.
4. Match the scene's lighting direction, shadow style, color temperature, and render quality.
5. Do NOT add, remove, or reposition any objects.
6. All parts of the new element must be fully visible — do NOT clip at any image edge. Scale the design down if needed.`,
      });

      generatedImage = await runGemini(parts, VERTEX_PROJECT_ID, VERTEX_LOCATION, VERTEX_API_KEY);
    }

    if (!generatedImage) {
      return new Response(
        JSON.stringify({ error: "All AI paths failed. Please try again." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Upload result to Supabase Storage ─────────────────────────────────────
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const b64Out = generatedImage.replace(/^data:image\/\w+;base64,/, "");
    const imageBytes = Uint8Array.from(atob(b64Out), (c) => c.charCodeAt(0));
    const storagePath = `renders/${user.id}/${crypto.randomUUID()}.png`;

    const { error: uploadError } = await serviceClient.storage
      .from("floor-plans")
      .upload(storagePath, imageBytes, { contentType: "image/png" });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      return new Response(
        JSON.stringify({ imageBase64: generatedImage, compositeRegion, regionBounds }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: signedUrlData } = await serviceClient.storage
      .from("floor-plans")
      .createSignedUrl(storagePath, 3600);

    return new Response(
      JSON.stringify({
        imageBase64: generatedImage,
        imageUrl: signedUrlData?.signedUrl ?? null,
        editPath: storagePath,
        compositeRegion,
        regionBounds,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("edit-render error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
