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

Required:

- `MONGODB_URI`
- `JWT_SECRET`

Optional:

- `PORT` (default `3000`)
- `JWT_EXPIRES_IN` (default `7d`)
- `OTP_EXPIRES_MINUTES` (default `10`)
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_CALLBACK_URL`

## API Overview

Base URL: `http://localhost:3000`  
Auth header for protected routes:

```http
Authorization: Bearer <access_token>
```

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
Completes Google OAuth login and returns standard auth response.

**Request**  
No body (provider callback).

**Response**
```json
{
  "access_token": "<jwt>",
  "user": {
    "id": "6813f3...",
    "email": null,
    "firstName": null,
    "lastName": null,
    "phoneNumber": null,
    "displayName": "Google User"
  }
}
```

---

## Video Studio Endpoints (`/video-studio`)

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
      { "id": "short", "label": "Short (15-60s)" },
      { "id": "medium", "label": "Medium (1-3m)" },
      { "id": "long", "label": "Long (3-10m)" }
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
Creates a video generation project for one creation mode.

**Request (common fields)**
```json
{
  "mode": "text_to_video",
  "videoLength": "short",
  "title": "optional title"
}
```

**Mode-specific required payload**

- `text_to_video`: `prompt`, `voiceStyle`, `visualStyle`
- `photos_script`: `photos` (url array), `script`
- `youtube_repurpose`: `youtubeUrl` (optional: `additionalPhotos`, `customScript`)
- `faceless_video`: `topic`, `niche`, `aspectRatio`

**Response**
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
  "createdAt": "2026-05-01T12:20:00.000Z",
  "updatedAt": "2026-05-01T12:20:00.000Z"
}
```

### `GET /video-studio/projects`
Lists user projects, filterable by status.

**Request (query params)**
```http
/video-studio/projects?status=in_progress&limit=20
```

**Response**
```json
[
  {
    "id": "6814ab...",
    "mode": "faceless_video",
    "title": "Crypto beginner's guide",
    "status": "in_progress",
    "progress": 79,
    "videoLength": "short",
    "durationSeconds": null,
    "thumbnailUrl": null,
    "outputVideoUrl": null,
    "createdAt": "2026-05-01T12:20:00.000Z",
    "updatedAt": "2026-05-01T12:28:00.000Z"
  }
]
```

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
- Facebook OAuth endpoints were removed intentionally; only Google OAuth is exposed.
