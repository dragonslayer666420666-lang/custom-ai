CUSTOM AI — Google Cloud + NSFW Edition
========================================
Text Chat • Image Generation • Video Generation • Text Games

────────────────────────────────────
ENVIRONMENT VARIABLES
────────────────────────────────────

TEXT CHAT:
  API_KEY          Your text AI provider API key
  API_BASE_URL     Base URL (e.g. https://api.openai.com/v1)
  AI_MODEL         Model name (e.g. gpt-4.1-mini)

IMAGE GENERATION:
  IMAGE_API_KEY        Image API key (if required)
  IMAGE_API_BASE_URL   Image API base URL
  IMAGE_API_FORMAT     "openai" (DALL-E format) or "sdi" (Stable Diffusion WebUI)
  IMAGE_MODEL          Model name (e.g. dall-e-3)

VIDEO GENERATION:
  VIDEO_API_KEY        Video API key (if required)
  VIDEO_API_BASE_URL   Video API base URL
  VIDEO_MODEL          Model name (if applicable)
  VIDEO_POLL_INTERVAL  Poll interval in ms (default: 5000)
  VIDEO_MAX_POLLS      Max poll attempts (default: 60)

All API keys stay server-side only — never exposed to the browser.

────────────────────────────────────
OPTION 1 — Google Cloud Run (recommended)
────────────────────────────────────

1. Install Google Cloud CLI: https://cloud.google.com/sdk/docs/install
2. gcloud auth login
3. gcloud config set project YOUR_PROJECT_ID
4. Deploy:

   gcloud run deploy custom-ai \
     --source . \
     --region us-central1 \
     --allow-unauthenticated \
     --set-env-vars "API_KEY=your-key,API_BASE_URL=https://api.openai.com/v1,AI_MODEL=gpt-4.1-mini,IMAGE_API_KEY=your-image-key,IMAGE_API_BASE_URL=https://your-image-api.com,IMAGE_API_FORMAT=openai,IMAGE_MODEL=dall-e-3,VIDEO_API_KEY=your-video-key,VIDEO_API_BASE_URL=https://your-video-api.com"

────────────────────────────────────
OPTION 2 — Google App Engine
────────────────────────────────────

1. gcloud auth login
2. gcloud config set project YOUR_PROJECT_ID
3. gcloud app create  (if needed)
4. Edit app.yaml — uncomment and fill in env_variables
5. gcloud app deploy
6. https://YOUR_PROJECT_ID.appspot.com

────────────────────────────────────
OPTION 3 — Local Dev
────────────────────────────────────

1. npm install
2. Set env vars (export or .env file)
3. npm start
4. http://localhost:3000

────────────────────────────────────
OPTION 4 — Replit
────────────────────────────────────

Add all env vars in Replit Secrets, then press Run.

────────────────────────────────────
NSFW NOTES
────────────────────────────────────

The default system prompt allows unrestricted adult content
in a private, consenting-adults setting. An 18+ age gate
appears on first visit.

TEXT: The AI provider/model must support uncensored responses.
OpenAI models may refuse NSFW regardless of prompt. Consider:
  - OpenRouter (with uncensored models)
  - NovelAI
  - Local models via LM Studio / Ollama
  - Other uncensored API providers

IMAGE: For NSFW images, use a provider that allows it:
  - Stable Diffusion WebUI (set IMAGE_API_FORMAT=sdi)
  - Uncensored SDXL providers
  - OpenRouter image models (if they allow NSFW)

VIDEO: NSFW video generation APIs are rare. The endpoint
supports a generic generate-then-poll pattern. You may need
to adjust the URL paths in server.js to match your provider.
Providers to explore:
  - Text-to-video APIs that allow adult content
  - Self-hosted models with an API wrapper

You are responsible for complying with your provider's
terms of service and all applicable laws.
