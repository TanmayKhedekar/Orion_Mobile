# Organizer AI API Configuration & Integration Guide

This guide explains how to configure, test, and switch to the **Organizer AI API** in Orion.

---

## 1. Overview & Architecture

Orion includes a unified server-side AI Gateway (`services/ai/gateway.ts`) that orchestrates LLM completions across multiple providers while guaranteeing zero credential exposure to the frontend.

```
[Browser / Orion UI]
         │
         ▼
[Next.js Server API Routes (/api/*)]
         │
         ▼
[Unified AI Gateway (services/ai/gateway.ts)]
   │                                  │
   ├─► AI_PROVIDER=groq               └─► AI_PROVIDER=organizer
   ▼                                      ▼
[Groq Cloud Inference]                  [Organizer Cloud AI API]
(GROQ_API_KEY)                          (ORGANIZER_AI_API_KEY)
```

---

## 2. Environment Variables Configuration

Add the following environment variables to your `.env` or `.env.local` file:

```bash
# Set active AI provider ('groq' or 'organizer')
AI_PROVIDER=organizer

# ---------------------------------------------------------------------
# Organizer AI Configuration
# ---------------------------------------------------------------------
# Base URL for the Organizer's AI endpoint
ORGANIZER_AI_BASE_URL=https://api.organizer.example.com/v1

# API Key provided by the organizer
ORGANIZER_AI_API_KEY=your_actual_organizer_api_key_here

# Header name used for authorization (e.g., 'Authorization', 'x-api-key', 'api-key')
# If set to 'Authorization', Orion automatically formats the value with 'Bearer ' prefix if needed.
ORGANIZER_AI_AUTH_HEADER=Authorization

# Target model identifier provided by the organizer
ORGANIZER_AI_MODEL=organizer-target-model-name
```

---

## 3. Supported Authentication Header Types

Orion's `OrganizerAIClient` (`services/ai/organizerClient.ts`) supports flexible header schemas:

| Format Example | `ORGANIZER_AI_AUTH_HEADER` Value | Generated Header in Outgoing Request |
|---|---|---|
| Standard Bearer Token | `Authorization` | `Authorization: Bearer <ORGANIZER_AI_API_KEY>` |
| Direct API Key Header | `x-api-key` | `x-api-key: <ORGANIZER_AI_API_KEY>` |
| Custom Header | `api-key` | `api-key: <ORGANIZER_AI_API_KEY>` |
| Header with Custom Name | `X-Custom-Auth` | `X-Custom-Auth: <ORGANIZER_AI_API_KEY>` |

---

## 4. Provider Health & Diagnostics Check

You can verify the connectivity and health of all configured AI providers at any time by querying the `/api/ai/health` endpoint:

### Request:
```bash
curl -X GET http://localhost:3000/api/ai/health
```

### Response Example:
```json
{
  "activeProvider": "organizer",
  "timestamp": "2026-09-05T12:00:00.000Z",
  "providers": {
    "groq": {
      "provider": "groq",
      "status": "healthy",
      "model": "openai/gpt-oss-120b",
      "latencyMs": 420,
      "message": "Groq API is operating normally."
    },
    "organizer": {
      "provider": "organizer",
      "status": "healthy",
      "model": "organizer-target-model",
      "latencyMs": 310,
      "message": "Organizer AI API is reachable and operating normally."
    }
  }
}
```

---

## 5. Direct Organizer AI Route

A dedicated server route is available at `/api/ai/organizer`:

### Request:
```bash
curl -X POST http://localhost:3000/api/ai/organizer \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      { "role": "system", "content": "You are an API integration specialist." },
      { "role": "user", "content": "Explain REST status code 429." }
    ],
    "temperature": 0.5,
    "maxTokens": 500
  }'
```

### Response:
```json
{
  "content": "HTTP status code 429 indicates 'Too Many Requests'...",
  "model": "organizer-target-model",
  "provider": "organizer",
  "usage": {
    "promptTokens": 28,
    "completionTokens": 64,
    "totalTokens": 92
  }
}
```

---

## 6. Switching Between Providers

To switch the entire Orion platform between **Groq** and **Organizer AI**:

1. In `.env` or `.env.local`, set:
   - `AI_PROVIDER=groq` (routes all 7 AI features through Groq)
   - `AI_PROVIDER=organizer` (routes all 7 AI features through Organizer AI)
2. No code changes, component edits, or frontend rebuilds are required.
3. If an individual request specifies a `{ "provider": "organizer" }` or `{ "provider": "groq" }` property in the request body, the gateway honors that override per request.

---

## 7. Security Guarantees
- **Zero Frontend Leakage:** Credentials (`ORGANIZER_AI_API_KEY`, `GROQ_API_KEY`) are read strictly within Node.js runtime Route Handlers and never sent to the browser bundle.
- **Log Sanitation:** All outgoing and incoming AI logs automatically redact authorization headers, bearer tokens, and private user credentials via `services/ai/logger.ts`.
