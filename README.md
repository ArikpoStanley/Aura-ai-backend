# AuraVid Backend

NestJS + MongoDB API powering authentication, video generation workflows, user studio pages, settings, and media management.

## Setup

```bash
yarn install
```

## Run

```bash
# development
yarn start:dev

# production build
yarn build
yarn start:prod
```

## Environment

Copy `.env.example` to `.env` and fill in values.

**Required**


| Variable      | Purpose                   |
| ------------- | ------------------------- |
| `MONGODB_URI` | MongoDB connection string |
| `JWT_SECRET`  | Signs access tokens       |


**Auth / server**


| Variable                                    | Default | Purpose                                                             |
| ------------------------------------------- | ------- | ------------------------------------------------------------------- |
| `PORT`                                      | `3000`  | HTTP port                                                           |
| `CORS_ORIGIN`                               | —       | Allowed browser origin(s) for the frontend                          |
| `JWT_EXPIRES_IN`                            | `7d`    | Access token lifetime                                               |
| `OTP_EXPIRES_MINUTES`                       | `10`    | OTP validity                                                        |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | —       | Enable Google OAuth (omit both to disable)                          |
| `GOOGLE_CALLBACK_URL`                       | —       | Backend callback, e.g. `http://localhost:3000/auth/google/callback` |
| `GOOGLE_AUTH_SUCCESS_REDIRECT_URL`          | —       | If set, OAuth redirects here with tokens in the URL hash (see Auth) |


**AI / media (required for video generation)**


| Variable                                                                 | Purpose                      |
| ------------------------------------------------------------------------ | ---------------------------- |
| `OPENAI_API_KEY`                                                         | ChatGPT prompts, GPT Image, Sora video, and TTS |
| `OPENAI_MODEL`                                                           | Text/planning model, e.g. `gpt-4o-mini` |
| `OPENAI_VIDEO_MODEL`                                                     | Sora video model, e.g. `sora-2` |
| `OPENAI_IMAGE_MODEL`                                                     | GPT Image model, e.g. `gpt-image-1` |
| `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | Uploaded output storage      |


**Generation behavior (optional)**


| Variable                              | Default | Purpose                                                |
| ------------------------------------- | ------- | ------------------------------------------------------ |
| `GENERATION_DEFAULT_LANGUAGE`         | `en`    | English (US) for prompts, dialogue, and on-screen text |
| `VIDEO_MAX_SECONDS`                   | `30`    | Hard cap on total generated duration (all tiers)       |
| `VIDEO_SHORT_SECONDS`                 | `10`    | Target when `videoLength` is `short`                   |
| `VIDEO_MEDIUM_SECONDS`                | `20`    | Target when `videoLength` is `medium`                  |
| `VIDEO_LONG_SECONDS`                  | `30`    | Target when `videoLength` is `long`                    |
| `VIDEO_SEGMENT_MAX_SECONDS`           | `12`    | Max seconds per Sora clip before FFmpeg composition    |
| `VIDEO_LONG_MAX_SEGMENTS`             | `3`     | Max clips for one `long` project                       |


**OpenAI media pipeline**


| Variable | Default | Purpose |
| -------- | ------- | ------- |
| `VIDEO_PIPELINE_HYBRID` | `true` | Faceless + YouTube repurpose use OpenAI scenes + Sora clips + TTS + FFmpeg |
| `REDIS_URL` | — | BullMQ queue; omit to run jobs in-process on API server |
| `OPENAI_TTS_MODEL` / `OPENAI_TTS_VOICE` | `tts-1` / `alloy` | Narration for videos |
| `FFMPEG_TEMP_DIR` | system temp | Local render workspace (FFmpeg must be on `PATH`) |

**Run locally**

```bash
# API
npm run start:dev

# Worker (requires REDIS_URL + Mongo + same .env as API)
npm run build && npm run start:worker
```

**Production:** run **two processes** — web (`start:prod`) and worker (`start:worker`). Install FFmpeg on the worker image. Without `REDIS_URL`, generation still works but is not durable across restarts.

| Mode | Pipeline |
| ---- | -------- |
| `faceless_video` | OpenAI scenes → Sora clips → OpenAI TTS → FFmpeg → one MP4 |
| `youtube_repurpose` | Same hybrid pipeline (9:16) |
| `text_to_video` | OpenAI prompt → Sora clips → OpenAI TTS → FFmpeg → one MP4 |
| `photos_script` | OpenAI image keyframe → OpenAI TTS → FFmpeg Ken Burns; optional Sora animate |

## API Overview

Base URL: `http://localhost:3000`  
Auth header for protected routes:

```http
Authorization: Bearer <access_token>
```

There is **no** `/api/v1` prefix — routes are mounted at the root (e.g. `http://localhost:3000/video-studio/projects`).

---

## Frontend integration guide

Use this section when wiring the React (or other) client to the backend.

### Authentication

1. **Email/password** — `POST /auth/login` or complete signup; store `access_token` (memory, secure cookie, or `localStorage` per your security model).
2. **Google** — Redirect the browser to `GET /auth/google`. After success:
  - If `GOOGLE_AUTH_SUCCESS_REDIRECT_URL` is set: user lands on your page with  
   `#access_token=<jwt>&user=<url-encoded-json>`  
   Parse the hash on the success route (e.g. `/auth/google/success`).
  - If not set: callback returns JSON `{ access_token, user }` (API-only / Postman).
3. Send `Authorization: Bearer <access_token>` on all protected routes (`/video-studio/`*, `/studio/*`, `/ai/*`).

### Async video projects (critical)

Video Studio **does not** return finished media on `POST`. Generation runs in the background (OpenAI + FFmpeg + Cloudinary).


| Step | Action                                                                                                 |
| ---- | ------------------------------------------------------------------------------------------------------ |
| 1    | `POST /video-studio/projects/...` → `status: "in_progress"`, `progress: 5`, `outputVideoUrl: null`     |
| 2    | Poll `GET /video-studio/projects?status=in_progress` or `GET /video-studio/dashboard` every **2–5s**   |
| 3    | When `status === "completed"`, read `outputVideoUrl`, `outputVideoUrls`, `hasAudio`, `durationSeconds` |
| 4    | On `status === "failed"`, show retry; `progress` resets to `0`                                         |


Do **not** treat `null` URLs on create as an error — that is expected until polling completes.

### Project card fields (list, dashboard, create response)

All project endpoints return the same **project card** shape:

```json
{
  "id": "6814ab...",
  "mode": "text_to_video",
  "title": "My video",
  "status": "completed",
  "progress": 100,
  "videoLength": "long",
  "durationSeconds": 60,
  "thumbnailUrl": "https://res.cloudinary.com/.../thumb.mp4",
  "outputVideoUrl": "https://res.cloudinary.com/.../segment-1.mp4",
  "outputVideoUrls": [
    "https://res.cloudinary.com/.../segment-1.mp4",
    "https://res.cloudinary.com/.../segment-2.mp4"
  ],
  "hasAudio": true,
  "createdAt": "2026-05-01T12:20:00.000Z",
  "updatedAt": "2026-05-01T12:45:00.000Z"
}
```


| Field             | Frontend usage                                                                                         |
| ----------------- | ------------------------------------------------------------------------------------------------------ |
| `status`          | `in_progress` | `completed` | `failed`                                                                 |
| `progress`        | 0–100; updates during multi-segment `long` jobs (~20→90 per segment)                                   |
| `outputVideoUrl`  | Primary playback URL (first segment when `long`)                                                       |
| `outputVideoUrls` | **All segments** in order — use for playlist UI or client-side stitching                               |
| `hasAudio`        | `true` when OpenAI narration is generated and muxed into the final video |
| `durationSeconds` | Sum of segment durations (approximate)                                                                 |
| `videoLength`     | User-selected tier: `short` | `medium` | `long` (see below)                                            |


### `videoLength` — UI labels vs backend behavior

Dropdown labels in `GET /video-studio/options` are marketing-friendly. **Actual generation:**


| `videoLength` | Backend behavior                                                                                         |
| ------------- | -------------------------------------------------------------------------------------------------------- |
| `short`       | **10s** final video                                                                                         |
| `medium`      | **20s** final video                                                                                         |
| `long`        | **30s** final video. `outputVideoUrl` is the composed MP4; `outputVideoUrls` may list source clips          |


Recommend showing estimated time/cost in the UI for `long`; it requires multiple Sora clips plus FFmpeg composition.

### Language

All generated prompts and video audio/text default to **English (US)** (`GENERATION_DEFAULT_LANGUAGE=en`). Non-English content should only appear if the user’s prompt explicitly asks for another language.

### Recommended creation endpoints

Prefer **mode-specific** routes (stricter validation) over the generic `POST /video-studio/projects`:


| Mode              | Endpoint                                        |
| ----------------- | ----------------------------------------------- |
| Text to video     | `POST /video-studio/projects/text-to-video`     |
| Photos + script   | `POST /video-studio/projects/photos-script`     |
| YouTube repurpose | `POST /video-studio/projects/youtube-repurpose` |
| Faceless video    | `POST /video-studio/projects/faceless-video`    |


### Photos + script edge case

If animation fails or `VIDEO_PHOTOS_SCRIPT_ANIMATE_VIDEO=false`, the project may complete with a **still image** only (`outputVideoUrl` = keyframe, `hasAudio: false`). Treat `outputVideoUrls.length === 0` with a non-null `outputVideoUrl` as image-only success.

### CORS

Set `CORS_ORIGIN` to your frontend origin (e.g. `http://localhost:5173`). Production: your deployed app URL.

---

## Auth Endpoints (`/auth`)

### `POST /auth/login`

Validates email/password and returns an authenticated user session payload.

**Request**

```json
{
  "email": "user@example.com",
  "password": "strongPassword123"
}
```

**Response**

```json
{
  "access_token": "<jwt>",
  "user": {
    "id": "6813f3...",
    "email": "user@example.com",
    "firstName": "Adaeze",
    "lastName": "Chukwu",
    "phoneNumber": null,
    "displayName": "Adaeze Chukwu"
  }
}
```

### `POST /auth/register`

Registers a user directly (without OTP flow) and returns access token + user.

**Request**

```json
{
  "firstName": "Adaeze",
  "lastName": "Chukwu",
  "email": "user@example.com",
  "password": "strongPassword123",
  "confirmPassword": "strongPassword123",
  "termsAccepted": true
}
```

**Response**

```json
{
  "access_token": "<jwt>",
  "user": {
    "id": "6813f3...",
    "email": "user@example.com",
    "firstName": "Adaeze",
    "lastName": "Chukwu",
    "phoneNumber": null,
    "displayName": "Adaeze Chukwu"
  }
}
```

### `POST /auth/signup/request-otp`

Sends signup OTP to email for staged account creation.

**Request**

```json
{
  "email": "user@example.com"
}
```

**Response**

```json
{
  "message": "OTP sent"
}
```

### `POST /auth/signup/resend-otp`

Resends signup OTP to the same email.

**Request**

```json
{
  "email": "user@example.com"
}
```

**Response**

```json
{
  "message": "OTP sent"
}
```

### `POST /auth/signup/verify-otp`

Verifies signup OTP and returns a short-lived `setupToken`.

**Request**

```json
{
  "email": "user@example.com",
  "code": "123456"
}
```

**Response**

```json
{
  "setupToken": "<jwt>"
}
```

### Email verification aliases

These routes currently reuse the signup OTP handlers and payload contracts:

- `POST /auth/email-verification/request-otp`
- `POST /auth/email-verification/resend-otp`
- `POST /auth/email-verification/verify-otp`

### `POST /auth/signup/complete`

Completes OTP signup using `setupToken` and profile/password data.

**Request**

```json
{
  "setupToken": "<jwt>",
  "firstName": "Adaeze",
  "lastName": "Chukwu",
  "password": "strongPassword123",
  "confirmPassword": "strongPassword123",
  "termsAccepted": true
}
```

**Response**

```json
{
  "access_token": "<jwt>",
  "user": {
    "id": "6813f3...",
    "email": "user@example.com",
    "firstName": "Adaeze",
    "lastName": "Chukwu",
    "phoneNumber": null,
    "displayName": "Adaeze Chukwu"
  }
}
```

### Password reset aliases

All routes below map to the same reset flow handlers and payload contracts:

- `POST /auth/forgot-password`
- `POST /auth/reset-password/request`
- `POST /auth/reset-password/resend-otp`
- `POST /auth/forgot-password/resend-otp`

Sends reset OTP to an existing email.

**Request**

```json
{
  "email": "user@example.com"
}
```

**Response**

```json
{
  "message": "OTP sent"
}
```

### OTP verify aliases

- `POST /auth/reset-password/verify`
- `POST /auth/forgot-password/verify`

Validates reset OTP and returns `resetToken`.

**Request**

```json
{
  "email": "user@example.com",
  "code": "123456"
}
```

**Response**

```json
{
  "resetToken": "<jwt>"
}
```

### Reset complete aliases

- `POST /auth/reset-password/complete`
- `POST /auth/forgot-password/complete`

Sets a new password and returns signed-in response.

**Request**

```json
{
  "resetToken": "<jwt>",
  "password": "newStrongPassword123",
  "confirmPassword": "newStrongPassword123"
}
```

**Response**

```json
{
  "access_token": "<jwt>",
  "user": {
    "id": "6813f3...",
    "email": "user@example.com",
    "firstName": "Adaeze",
    "lastName": "Chukwu",
    "phoneNumber": null,
    "displayName": "Adaeze Chukwu"
  }
}
```

### `GET /auth/google`

Starts Google OAuth login redirect.

**Request**  
No body.

**Response**  
Redirect handled by Passport Google strategy.

### `GET /auth/google/callback`

Completes Google OAuth (browser redirect from Google).

**Request**  
No body (provider callback).

**Response (if `GOOGLE_AUTH_SUCCESS_REDIRECT_URL` is unset)**  
JSON:

```json
{
  "access_token": "<jwt>",
  "user": { "id": "6813f3...", "email": "user@gmail.com", "displayName": "..." }
}
```

**Response (if `GOOGLE_AUTH_SUCCESS_REDIRECT_URL` is set)**  
HTTP `302` to:

```http
https://your-frontend.com/auth/google/success#access_token=<jwt>&user=<url-encoded-user-json>
```

Parse `window.location.hash` on the frontend success page.

---

## Video Studio Endpoints (`/video-studio`)

Protected with JWT. Projects are generated **asynchronously** — see [Frontend integration guide](#frontend-integration-guide).

### `GET /video-studio/options`

Returns dropdown and creation-mode option data used by the creation screen.

**Request**  
No body.

**Response**

```json
{
  "creationModes": [
    { "id": "text_to_video", "label": "Text to video", "description": "Turn a written prompt into a narrated video" },
    { "id": "photos_script", "label": "Photos + script", "description": "Upload photos and provide narration" },
    { "id": "youtube_repurpose", "label": "YouTube repurpose", "description": "Repurpose a YouTube link into short-form content" },
    { "id": "faceless_video", "label": "Faceless video", "description": "Generate niche faceless videos from a concept" }
  ],
  "dropdowns": {
    "videoLengths": [
      { "id": "short", "label": "Short (10s)" },
      { "id": "medium", "label": "Medium (20s)" },
      { "id": "long", "label": "Long (30s)" }
    ],
    "voiceStyles": [
      { "id": "professional_male", "label": "Professional male" },
      { "id": "professional_female", "label": "Professional female" },
      { "id": "casual_upbeat", "label": "Casual upbeat" },
      { "id": "documentary", "label": "Documentary" }
    ],
    "visualStyles": [
      { "id": "cinematic", "label": "Cinematic" },
      { "id": "minimal", "label": "Minimal" },
      { "id": "vibrant", "label": "Vibrant" },
      { "id": "news_style", "label": "News-style" }
    ],
    "niches": [
      { "id": "finance", "label": "Finance" },
      { "id": "motivation", "label": "Motivation" },
      { "id": "tech", "label": "Tech" },
      { "id": "health", "label": "Health" },
      { "id": "lifestyle", "label": "Lifestyle" }
    ],
    "aspectRatios": [
      { "id": "9:16", "label": "9:16 (Reels/TikTok)" },
      { "id": "16:9", "label": "16:9 (YouTube)" },
      { "id": "1:1", "label": "1:1 (Square)" }
    ]
  }
}
```

### `POST /video-studio/projects`

Generic create (all modes). Prefer the mode-specific routes below when possible.

**Request (common fields)**

```json
{
  "mode": "text_to_video",
  "videoLength": "short",
  "title": "optional title"
}
```

**Mode-specific required fields**

- `text_to_video`: `prompt`, `voiceStyle`, `visualStyle`
- `photos_script`: `photos` (URL array, max 12), `script`
- `youtube_repurpose`: `youtubeUrl` (optional: `additionalPhotos`, `customScript`)
- `faceless_video`: `topic`, `niche`, `aspectRatio`

**Response** — project card; media fields are `null` until generation finishes.

```json
{
  "id": "6814ab...",
  "mode": "text_to_video",
  "title": "5 stocks to watch in Q3",
  "status": "in_progress",
  "progress": 5,
  "videoLength": "short",
  "durationSeconds": null,
  "thumbnailUrl": null,
  "outputVideoUrl": null,
  "outputVideoUrls": [],
  "hasAudio": false,
  "createdAt": "2026-05-01T12:20:00.000Z",
  "updatedAt": "2026-05-01T12:20:00.000Z"
}
```

### `POST /video-studio/projects/text-to-video`

**Request**

```json
{
  "title": "optional",
  "prompt": "Explain compound interest for beginners",
  "voiceStyle": "professional_male",
  "visualStyle": "cinematic",
  "videoLength": "medium"
}
```

### `POST /video-studio/projects/photos-script`

**Request**

```json
{
  "title": "optional",
  "photos": ["https://cdn.example.com/photo1.jpg"],
  "script": "Narration script here...",
  "videoLength": "short"
}
```

### `POST /video-studio/projects/youtube-repurpose`

**Request**

```json
{
  "title": "optional",
  "youtubeUrl": "https://www.youtube.com/watch?v=...",
  "additionalPhotos": ["https://cdn.example.com/frame.jpg"],
  "customScript": "optional director notes",
  "videoLength": "long"
}
```

### `POST /video-studio/projects/faceless-video`

**Request**

```json
{
  "title": "optional",
  "topic": "5 habits that build wealth",
  "niche": "finance",
  "aspectRatio": "9:16",
  "videoLength": "short"
}
```

### `GET /video-studio/projects`

Lists user projects, filterable by status.

**Request (query params)**

```http
/video-studio/projects?status=in_progress&limit=20
```

**Response** — array of project cards (same shape as create; includes `outputVideoUrls`, `hasAudio` when completed).

```json
[
  {
    "id": "6814ab...",
    "mode": "faceless_video",
    "title": "Crypto beginner's guide",
    "status": "in_progress",
    "progress": 79,
    "videoLength": "long",
    "durationSeconds": null,
    "thumbnailUrl": null,
    "outputVideoUrl": null,
    "outputVideoUrls": [],
    "hasAudio": false,
    "createdAt": "2026-05-01T12:20:00.000Z",
    "updatedAt": "2026-05-01T12:28:00.000Z"
  }
]
```

**Query `status` values:** `in_progress`, `completed`, `failed`

### `GET /video-studio/dashboard`

Returns dashboard cards, recent completed videos, and current in-progress item.

**Request**  
No body.

**Response**

```json
{
  "stats": {
    "videosCreated": 24,
    "minutesGenerated": 180,
    "creditsLeft": 8
  },
  "recentVideos": [],
  "inProgress": null
}
```

---

## AI Endpoints (`/ai`)

Protected with JWT. Used for standalone tools and internal studio flows. Video studio projects call the same stack in the background.

### `POST /ai/prompts/generate`

Expands an idea into a production-ready prompt (OpenAI). Output is English by default.

**Request**

```json
{
  "idea": "A 30 second ad for a coffee brand",
  "tone": "warm",
  "style": "cinematic",
  "targetAudience": "millennials"
}
```

**Response**

```json
{
  "prompt": "Cinematic close-up of espresso pouring..."
}
```

### `POST /ai/images/generate`

Generates an image via Replicate, uploads to Cloudinary.

**Request**

```json
{
  "prompt": "Minimal product shot of a smartwatch",
  "style": "studio lighting",
  "aspectRatio": "1:1",
  "negativePrompt": "optional"
}
```

**Response**

```json
{
  "predictionId": "...",
  "model": "black-forest-labs/flux-schnell",
  "outputs": ["https://replicate.delivery/..."],
  "cloudinary": {
    "publicId": "auravid/generated-images/...",
    "secureUrl": "https://res.cloudinary.com/...",
    "width": 1024,
    "height": 1024
  }
}
```

### `POST /ai/characters/generate`

Character portrait (OpenAI prompt + Flux).

**Request**

```json
{
  "name": "Maya",
  "description": "Tech founder, mid-30s, confident",
  "style": "semi-realistic",
  "mood": "optimistic"
}
```

### `POST /ai/videos/remix`

Remix/transform a source video URL.

**Request**

```json
{
  "sourceVideoUrl": "https://cdn.example.com/source.mp4",
  "instruction": "Make it more energetic, add motion",
  "model": "optional override",
  "inputOverrides": {}
}
```

**Response**

```json
{
  "predictionId": "...",
  "model": "kwaivgi/kling-v3-video",
  "prompt": "...",
  "outputs": ["https://replicate.delivery/..."],
  "cloudinary": {
    "publicId": "...",
    "secureUrl": "https://res.cloudinary.com/.../video.mp4",
    "duration": 8,
    "format": "mp4"
  }
}
```

---

## Studio Endpoints (`/studio`)

### `GET /studio/profile`

Returns profile summary and credit usage shown on the profile page.

**Request**  
No body.

**Response**

```json
{
  "id": "6813f3...",
  "fullName": "Adaeze C.",
  "email": "adaeze@example.com",
  "planName": "PRO PLAN",
  "memberSince": "2024-10-01T00:00:00.000Z",
  "monthlyCredits": 100,
  "creditsLeft": 8
}
```

### `GET /studio/history`

Returns generation audit/history rows.

**Request (query params)**

```http
/studio/history?limit=30
```

**Response**

```json
[
  {
    "id": "6815b2...",
    "status": "success",
    "date": "2026-04-20T10:00:00.000Z",
    "action": "Text to Video",
    "detail": "5 stocks to watch...",
    "costCredits": -1
  }
]
```

### `GET /studio/templates`

Returns template categories and template cards (supports category + search filtering).

**Request (query params)**

```http
/studio/templates?category=finance&search=crypto
```

**Response**

```json
{
  "categories": ["all", "explainer", "social_media", "corporate", "finance", "lifestyle"],
  "templates": [
    {
      "id": "crypto-daily-news",
      "title": "Crypto Daily News",
      "category": "finance",
      "duration": "0:56",
      "thumbnail": "https://placehold.co/400x240/1f2937/ffffff?text=📊"
    }
  ]
}
```

### `GET /studio/assets`

Returns media library assets (optional type filtering).

**Request (query params)**

```http
/studio/assets?type=image
```

**Response**

```json
[
  {
    "id": "6815cf...",
    "name": "Company_Logo.png",
    "type": "image",
    "sizeBytes": 1260000,
    "url": "https://cdn.example.com/assets/company-logo.png",
    "createdAt": "2026-04-12T12:00:00.000Z"
  }
]
```

### `POST /studio/assets`

Creates a media-asset record after upload is completed by your storage service.

**Request**

```json
{
  "name": "Company_Logo.png",
  "type": "image",
  "sizeBytes": 1260000,
  "url": "https://cdn.example.com/assets/company-logo.png"
}
```

**Response**

```json
{
  "id": "6815cf...",
  "name": "Company_Logo.png",
  "type": "image",
  "sizeBytes": 1260000,
  "url": "https://cdn.example.com/assets/company-logo.png",
  "createdAt": "2026-04-12T12:00:00.000Z"
}
```

---

## Settings Endpoints (`/studio/settings`)

### `GET /studio/settings/general`

Returns language, timezone, and theme preference.

**Request**  
No body.

**Response**

```json
{
  "language": "English (US)",
  "timezone": "UTC-08:00 Pacific Time",
  "themePreference": "dark"
}
```

### `PATCH /studio/settings/general`

Updates language, timezone, and theme preference.

**Request**

```json
{
  "language": "English (US)",
  "timezone": "UTC-08:00 Pacific Time",
  "themePreference": "dark"
}
```

**Response**

```json
{
  "language": "English (US)",
  "timezone": "UTC-08:00 Pacific Time",
  "themePreference": "dark"
}
```

### `GET /studio/settings/notifications`

Returns user notification toggle states.

**Request**  
No body.

**Response**

```json
{
  "videoGenerationComplete": true,
  "weeklyReport": false,
  "productUpdates": true
}
```

### `PATCH /studio/settings/notifications`

Updates notification toggle states.

**Request**

```json
{
  "videoGenerationComplete": true,
  "weeklyReport": false,
  "productUpdates": true
}
```

**Response**

```json
{
  "videoGenerationComplete": true,
  "weeklyReport": false,
  "productUpdates": true
}
```

### `GET /studio/settings/video-defaults`

Returns default voice, caption style, and dropdown options.

**Request**  
No body.

**Response**

```json
{
  "defaultVoice": "professional_male",
  "captionsStyle": "dynamic_word_by_word",
  "options": {
    "defaultVoice": [
      { "id": "professional_male", "label": "Professional male" },
      { "id": "professional_female", "label": "Professional female" }
    ],
    "captionsStyle": [
      { "id": "dynamic_word_by_word", "label": "Dynamic word-by-word" },
      { "id": "standard_lower_thirds", "label": "Standard lower-thirds" }
    ]
  }
}
```

### `PATCH /studio/settings/video-defaults`

Updates default voice and captions style.

**Request**

```json
{
  "defaultVoice": "professional_male",
  "captionsStyle": "dynamic_word_by_word"
}
```

**Response**

```json
{
  "defaultVoice": "professional_male",
  "captionsStyle": "dynamic_word_by_word",
  "options": {
    "defaultVoice": [
      { "id": "professional_male", "label": "Professional male" },
      { "id": "professional_female", "label": "Professional female" }
    ],
    "captionsStyle": [
      { "id": "dynamic_word_by_word", "label": "Dynamic word-by-word" },
      { "id": "standard_lower_thirds", "label": "Standard lower-thirds" }
    ]
  }
}
```

---

## Notes

- All request payloads are validated with Nest `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`, `transform`).
- Facebook OAuth was removed; only Google OAuth is exposed.
- Video generation requires outbound access to `api.replicate.com`, OpenAI, and Cloudinary from the server.
- Rate limiting: global throttler (`THROTTLE_TTL_SECONDS`, `THROTTLE_LIMIT`).
- Production example base URL (if deployed): `https://aura-ai-backend-eight.vercel.app` — use the same route paths as local.

