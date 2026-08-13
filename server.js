const express = require("express");
const path = require("path");

const app = express();

// Google Cloud (App Engine / Cloud Run) provides PORT.
// Replit / local dev falls back to 3000.
const PORT = process.env.PORT || 3000;

// ===============================
// AI PROVIDER SETTINGS — TEXT CHAT
// ===============================
const API_KEY = process.env.API_KEY || "";
const API_BASE_URL = (
  process.env.API_BASE_URL || "https://api.openai.com/v1"
).replace(/\/$/, "");
const AI_MODEL = process.env.AI_MODEL || "gpt-4.1-mini";

// ===============================
// IMAGE GENERATION SETTINGS
// ===============================
// Supports OpenAI DALL-E format (/v1/images/generations) and
// Stable Diffusion WebUI format (/sdapi/v1/txt2img).
// Set IMAGE_API_FORMAT to "openai" or "sdi" (default: openai).
const IMAGE_API_KEY = process.env.IMAGE_API_KEY || "";
const IMAGE_API_BASE_URL = (
  process.env.IMAGE_API_BASE_URL || ""
).replace(/\/$/, "");
const IMAGE_API_FORMAT = process.env.IMAGE_API_FORMAT || "openai";
const IMAGE_MODEL = process.env.IMAGE_MODEL || "dall-e-3";

// ===============================
// VIDEO GENERATION SETTINGS
// ===============================
// Supports a generate-then-poll pattern common to most video APIs.
// The provider should expose:
//   POST  {VIDEO_API_BASE_URL}/generate   → { id: "task_id" } or { task_id }
//   GET   {VIDEO_API_BASE_URL}/status/{id} → { status: "completed", video_url: "..." }
// Adjust VIDEO_POLL_INTERVAL (ms) and VIDEO_MAX_POLLS as needed.
const VIDEO_API_KEY = process.env.VIDEO_API_KEY || "";
const VIDEO_API_BASE_URL = (
  process.env.VIDEO_API_BASE_URL || ""
).replace(/\/$/, "");
const VIDEO_MODEL = process.env.VIDEO_MODEL || "";
const VIDEO_POLL_INTERVAL = parseInt(process.env.VIDEO_POLL_INTERVAL) || 5000;
const VIDEO_MAX_POLLS = parseInt(process.env.VIDEO_MAX_POLLS) || 60;

app.use(express.json({ limit: "4mb" }));
app.use(express.static(path.join(__dirname, "public")));

if (process.env.GAE_ENV || process.env.GOOGLE_CLOUD_PROJECT) {
  app.set("trust proxy", true);
}

// ───────────────────────────────
// STATUS
// ───────────────────────────────
app.get("/api/status", (req, res) => {
  res.json({
    online: true,
    text:    { configured: Boolean(API_KEY), model: AI_MODEL },
    image:   { configured: Boolean(IMAGE_API_BASE_URL), model: IMAGE_MODEL },
    video:   { configured: Boolean(VIDEO_API_BASE_URL), model: VIDEO_MODEL || "—" }
  });
});

// ───────────────────────────────
// TEXT CHAT
// ───────────────────────────────
app.post("/api/chat", async (req, res) => {
  try {
    if (!API_KEY) {
      return res.status(500).json({
        error: "No API_KEY configured. Set API_KEY as an environment variable."
      });
    }

    const {
      messages = [],
      systemPrompt = "",
      temperature = 0.8,
      maxTokens = 1200
    } = req.body || {};

    if (!Array.isArray(messages)) {
      return res.status(400).json({ error: "messages must be an array" });
    }

    const cleanedMessages = messages
      .filter(m => m && typeof m.content === "string" && ["user","assistant"].includes(m.role))
      .slice(-40)
      .map(m => ({ role: m.role, content: m.content.slice(0, 12000) }));

    const finalMessages = [];
    if (typeof systemPrompt === "string" && systemPrompt.trim()) {
      finalMessages.push({ role: "system", content: systemPrompt.slice(0, 12000) });
    }
    finalMessages.push(...cleanedMessages);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90000);

    const response = await fetch(`${API_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: finalMessages,
        temperature: Math.max(0, Math.min(Number(temperature) || 0.8, 2)),
        max_tokens: Math.max(64, Math.min(Number(maxTokens) || 1200, 8000))
      }),
      signal: controller.signal
    });

    clearTimeout(timeout);
    const rawText = await response.text();
    let data;
    try { data = JSON.parse(rawText); } catch { data = { raw: rawText }; }

    if (!response.ok) {
      console.error("AI provider error:", data);
      return res.status(response.status).json({
        error: data?.error?.message || data?.message || `AI provider returned HTTP ${response.status}`
      });
    }

    const reply = data?.choices?.[0]?.message?.content || data?.choices?.[0]?.text || "";
    if (!reply) return res.status(500).json({ error: "The AI provider returned an empty response." });

    res.json({ reply, model: data?.model || AI_MODEL });
  } catch (error) {
    console.error(error);
    if (error.name === "AbortError") return res.status(504).json({ error: "The AI request timed out." });
    res.status(500).json({ error: error.message || "Unknown server error" });
  }
});

// ───────────────────────────────
// IMAGE GENERATION
// ───────────────────────────────
app.post("/api/generate-image", async (req, res) => {
  try {
    if (!IMAGE_API_BASE_URL) {
      return res.status(500).json({
        error: "Image generation not configured. Set IMAGE_API_BASE_URL and IMAGE_API_KEY as environment variables."
      });
    }

    const {
      prompt = "",
      size = "1024x1024",
      n = 1,
      negativePrompt = "",
      steps = 28,
      cfgScale = 7
    } = req.body || {};

    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ error: "prompt is required" });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);

    let response;

    if (IMAGE_API_FORMAT === "sdi") {
      // Stable Diffusion WebUI format
      response = await fetch(`${IMAGE_API_BASE_URL}/sdapi/v1/txt2img`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(IMAGE_API_KEY ? { Authorization: `Bearer ${IMAGE_API_KEY}` } : {})
        },
        body: JSON.stringify({
          prompt: prompt.slice(0, 2000),
          negative_prompt: negativePrompt.slice(0, 1000),
          steps: Math.max(1, Math.min(Number(steps) || 28, 150)),
          cfg_scale: Math.max(1, Math.min(Number(cfgScale) || 7, 20)),
          width: parseInt(size.split("x")[0]) || 1024,
          height: parseInt(size.split("x")[1]) || 1024,
          batch_size: Math.max(1, Math.min(Number(n) || 1, 4))
        }),
        signal: controller.signal
      });
    } else {
      // OpenAI DALL-E format
      response = await fetch(`${IMAGE_API_BASE_URL}/images/generations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${IMAGE_API_KEY}`
        },
        body: JSON.stringify({
          model: IMAGE_MODEL,
          prompt: prompt.slice(0, 4000),
          n: Math.max(1, Math.min(Number(n) || 1, 4)),
          size: size,
          response_format: "b64_json"
        }),
        signal: controller.signal
      });
    }

    clearTimeout(timeout);
    const data = await response.json().catch(() => ({ raw: "parse error" }));

    if (!response.ok) {
      console.error("Image API error:", data);
      return res.status(response.status).json({
        error: data?.error?.message || data?.message || `Image API returned HTTP ${response.status}`
      });
    }

    // Normalize response to array of base64 images
    let images = [];

    if (IMAGE_API_FORMAT === "sdi") {
      // SD returns { images: ["base64...", ...] }
      images = (data.images || []).map(b64 => `data:image/png;base64,${b64}`);
    } else {
      // OpenAI returns { data: [{ b64_json: "..." }, ...] }
      images = (data.data || []).map(item =>
        item.b64_json ? `data:image/png;base64,${item.b64_json}` : item.url
      );
    }

    if (!images.length) {
      return res.status(500).json({ error: "Image API returned no images." });
    }

    res.json({ images });
  } catch (error) {
    console.error("Image gen error:", error);
    if (error.name === "AbortError") return res.status(504).json({ error: "Image generation timed out." });
    res.status(500).json({ error: error.message || "Unknown error" });
  }
});

// ───────────────────────────────
// VIDEO GENERATION (async polling)
// ───────────────────────────────
app.post("/api/generate-video", async (req, res) => {
  try {
    if (!VIDEO_API_BASE_URL) {
      return res.status(500).json({
        error: "Video generation not configured. Set VIDEO_API_BASE_URL and VIDEO_API_KEY as environment variables."
      });
    }

    const {
      prompt = "",
      duration = 5,
      aspectRatio = "16:9"
    } = req.body || {};

    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ error: "prompt is required" });
    }

    // Step 1: Submit generation request
    const submitResponse = await fetch(`${VIDEO_API_BASE_URL}/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(VIDEO_API_KEY ? { Authorization: `Bearer ${VIDEO_API_KEY}` } : {})
      },
      body: JSON.stringify({
        model: VIDEO_MODEL || undefined,
        prompt: prompt.slice(0, 4000),
        duration: Number(duration) || 5,
        aspect_ratio: aspectRatio
      })
    });

    if (!submitResponse.ok) {
      const errData = await submitResponse.json().catch(() => ({}));
      console.error("Video submit error:", errData);
      return res.status(submitResponse.status).json({
        error: errData?.error?.message || errData?.message || `Video API returned HTTP ${submitResponse.status}`
      });
    }

    const submitData = await submitResponse.json();
    const taskId = submitData.id || submitData.task_id || submitData.request_id;

    if (!taskId) {
      // Maybe the API returns the video URL directly
      const videoUrl = submitData.video_url || submitData.url || submitData.output?.[0];
      if (videoUrl) {
        return res.json({ video_url: videoUrl, status: "completed" });
      }
      return res.status(500).json({ error: "Video API did not return a task ID or video URL." });
    }

    // Step 2: Poll for completion
    let polls = 0;
    let videoUrl = null;

    while (polls < VIDEO_MAX_POLLS) {
      await new Promise(r => setTimeout(r, VIDEO_POLL_INTERVAL));
      polls++;

      const statusResponse = await fetch(`${VIDEO_API_BASE_URL}/status/${taskId}`, {
        headers: {
          ...(VIDEO_API_KEY ? { Authorization: `Bearer ${VIDEO_API_KEY}` } : {})
        }
      });

      if (!statusResponse.ok) continue;

      const statusData = await statusResponse.json().catch(() => ({}));

      const status = (statusData.status || "").toLowerCase();

      if (status === "completed" || status === "succeeded" || status === "success") {
        videoUrl = statusData.video_url || statusData.url || statusData.output?.[0] || statusData.result?.video_url;
        if (videoUrl) break;
      }

      if (status === "failed" || status === "error") {
        return res.status(500).json({
          error: statusData.error || statusData.message || "Video generation failed."
        });
      }
    }

    if (!videoUrl) {
      return res.status(504).json({
        error: "Video generation timed out. The task may still be processing on the provider side.",
        task_id: taskId
      });
    }

    res.json({ video_url: videoUrl, status: "completed", task_id: taskId });
  } catch (error) {
    console.error("Video gen error:", error);
    res.status(500).json({ error: error.message || "Unknown error" });
  }
});

// ───────────────────────────────
// SPA FALLBACK
// ───────────────────────────────
app.get("/*splat", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Custom AI running on port ${PORT}`);
  console.log(`  Text:  ${API_KEY ? "configured" : "NOT configured"} (${AI_MODEL})`);
  console.log(`  Image: ${IMAGE_API_BASE_URL ? "configured" : "NOT configured"} (${IMAGE_MODEL})`);
  console.log(`  Video: ${VIDEO_API_BASE_URL ? "configured" : "NOT configured"} (${VIDEO_MODEL || "—"})`);
});
