# Orion — API Intelligence Layer: System Architecture & AI Audit Report

**Date:** March 2026  
**Project:** Orion (AgentifAI)  
**Status:** Audit & Stabilization Complete — Verified Operational  

---

## 1. Executive Summary

Orion is an AI-powered Agentic API Copilot designed to parse OpenAPI specifications (JSON/YAML), provide an interactive API Explorer & Playground with variable chaining, perform AI-assisted debugging and error diagnosis, execute natural language intent-to-integration pipelines, generate multi-language SDKs, and conduct automated API security audits and schema diff migrations.

This audit confirms that all core features, frontend components, Next.js server routes, and Groq LLM integrations are fully functional, stable, and executing without architectural deviations or breaking bugs.

---

## 2. Current Architecture

### 2.1 Technology Stack
- **Framework:** Next.js 14.2.35 (App Router, React 18, TypeScript 5)
- **Styling & UI:** Tailwind CSS 3.4.1, Tailwind Merge, Class Variance Authority, Radix UI Slot primitives, Lucide React icons
- **Code Editor:** `@monaco-editor/react` (Monaco Editor with dynamic `{{variable}}` autocompletion provider)
- **OpenAPI / Schema Handling:** `js-yaml` 4.2.0, custom OpenAPI parser (`services/openapi.ts`, `app/actions/openapi.ts`), aggressive spec trimmer (`lib/specTrimmer.ts`)
- **Authentication & Persistence:** Firebase Auth (Email/Password + Google OAuth) & Firestore (`lib/firebase.ts`, `context/AuthContext.tsx`)
- **AI & LLM Backend:** `groq-sdk` 1.2.0 communicating with Groq cloud inference endpoints

### 2.2 System Architecture Diagram

```
+-----------------------------------------------------------------------------------+
|                                  CLIENT (BROWSER)                                 |
|                                                                                   |
|  +---------------------+  +-------------------------+  +-----------------------+  |
|  |   Auth Gateways     |  |   Top Mode Switcher     |  | AI Router Mode Toggle |  |
|  |  /login  |  /signup |  | Explorer|Intent|Diff|Aud|  | [⚡Auto | ☁️Cloud|🧠Local]|  |
|  +----------+----------+  +------------+------------+  +-----------+-----------+  |
|             |                          |                           |              |
|             v                          v                           v              |
|  +-----------------------------------------------------------------------------+  |
|  |                               Main Workspace                                |  |
|  |  [Left: Endpoints List] [Center: Playground & Monaco] [Right: AI Assistant] |  |
|  +-------------------------------------+---------------------------------------+  |
+----------------------------------------|------------------------------------------+
                                         | Next.js Server Actions & API Fetch
                                         v
+-----------------------------------------------------------------------------------+
|                              NEXT.JS BACKEND (SERVER)                             |
|                                                                                   |
|  +-------------------------------------+  +------------------------------------+  |
|  |           Server Actions            |  |             API Routes             |  |
|  |  app/actions/openapi.ts             |  |  /api/chat         /api/diagnose   |  |
|  |  - Fetch raw JSON/YAML spec         |  |  /api/intent       /api/generate-sdk| |
|  |  - Auto-discover spec endpoints     |  |  /api/security-aud /api/diff       |  |
|  |  - Safe JSON / YAML parser          |  |  /api/suggest-chain                |  |
|  +-------------------------------------+  +-----------------+------------------+  |
|                                                             |                     |
|                                                             v                     |
|                                           +------------------------------------+  |
|                                           |     AI Service (services/ai/)      |  |
|                                           |     AIService.execute(request)     |  |
|                                           +-----------------+------------------+  |
|                                                             |                     |
|                                                             v                     |
|                                           +------------------------------------+  |
|                                           |     AIRouter (services/ai/router)  |  |
|                                           |  - Deterministic Rule Engine       |  |
|                                           |  - Task Categorization (Auto/Cloud)|  |
|                                           |  - Zero LLM Overhead               |  |
|                                           +--------+--------+--------+---------+  |
|                                                    |        |        |            |
|                                     +--------------+        |        +--------+   |
|                                     v                       v                 v   |
|                          +--------------------+  +--------------------+  +--------------------+
|                          | Organizer Provider |  |   Groq Provider    |  | Local NPU Provider |
|                          | (Cloud Organizer)  |  | (Cloud / Fallback) |  | (Snapdragon Stub)  |
|                          +--------------------+  +--------------------+  +--------------------+
+-----------------------------------------------------------------------------------+
```

---

## 3. Detailed AI Flow & Routing

The end-to-end AI request pipeline flows through server-isolated routes:

```
[User Action in Orion UI]
          │
          ▼
[Frontend Handler (app/page.tsx)]
  - Extracts current endpoint/spec/context
  - Injects chain variables (e.g. {{token}})
  - Dispatches fetch('/api/<route>', { method: 'POST', body: JSON.stringify(...) })
          │
          ▼
[Next.js API Route (app/api/<route>/route.ts)]
  - Validates request payload
  - Runs lib/specTrimmer.ts (reduces token overhead to <= 15 endpoints)
  - Constructs targeted system & developer prompts with exact JSON schemas
  - Instantiates Groq SDK using process.env.GROQ_API_KEY (server-side only)
          │
          ▼
[Groq Cloud API]
  - Processes prompt at high inference speed
  - Returns raw completion / structured JSON
          │
          ▼
[Next.js API Route Sanitizer]
  - Uses safeParseJSON() to sanitize control characters (\n, \r, \t)
  - Structured error fallback for 413 (Spec Too Large), 400 (Context Exceeded), 429 (Rate Limit)
          │
          ▼
[Frontend UI Update]
  - Renders markdown with syntax-highlighted code blocks, copy actions, diagnosis cards, or SDK download
```

---

## 4. Complete Inventory of API Routes & AI Capabilities

| Route | Model Context / Purpose | Input Parameters | Output Format |
|---|---|---|---|
| `/api/chat` | Conversational API assistant & code explanation | `{ messages: ChatMessage[] }` | `{ content: string }` |
| `/api/diagnose` | Error Detective: diagnoses 4xx/5xx responses & suggests fixes | `{ status, responseBody, requestHeaders, requestUrl, requestMethod, requestBody, spec }` | JSON (`diagnosis`, `rootCause`, `fix`, `fixedCode`, `severity`) |
| `/api/intent` | Natural language goal to complete multi-step integration | `{ goal: string, specs?: ApiSpec[] }` | JSON (`steps[]`, `code` (Python), `jsCode` (JS), `curlCommands[]`, `authNotes`) |
| `/api/generate-sdk` | Generates complete, strongly-typed SDK client class | `{ spec: string \| object, language: 'python' \| 'typescript' }` | JSON (`className`, `usageExample`, `dependencies[]`, `code`) |
| `/api/security-audit` | Analyzes OpenAPI spec for security vulnerabilities & exposure | `{ spec: string \| object }` | JSON (`riskScore`, `riskLevel`, `findings[]`, `noAuthEndpoints[]`, `sensitiveDataExposed[]`, `missingHttps[]`, `summary`) |
| `/api/diff` | Compares two OpenAPI specs and generates migration plan | `{ specA, specB }` | JSON (`summary`, `migrationSteps[]`, `codePatches[]`, `addedEndpoints[]`, `removedEndpoints[]`, `breakingChanges[]`) |
| `/api/suggest-chain` | AI Parameter Chaining: maps previous response keys to next endpoint | `{ responseBody: any, nextEndpoint: ApiEndpoint }` | JSON (`suggestions: [{ from, to, confidence, rationale }]`) |

---

## 5. File Inventory & Categorization

### 5.1 AI & Server Routes
- `app/api/chat/route.ts` — Interactive LLM chat endpoint
- `app/api/diagnose/route.ts` — API response error diagnosis endpoint
- `app/api/intent/route.ts` — Goal-to-integration AI generation endpoint
- `app/api/generate-sdk/route.ts` — SDK class generation endpoint (two-pass generation: metadata + raw code)
- `app/api/security-audit/route.ts` — Static AST + LLM security audit endpoint
- `app/api/diff/route.ts` — Programmatic + LLM spec difference and migration endpoint
- `app/api/suggest-chain/route.ts` — Response-to-request variable mapping endpoint

### 5.2 OpenAPI Parsing & Core Logic
- `app/actions/openapi.ts` — Server action for fetching remote YAML/JSON specs and auto-resolving candidate paths (`/openapi.json`, `/swagger.json`, etc.)
- `services/openapi.ts` — Client/server OpenAPI schema normalizer and endpoint extractor
- `lib/specTrimmer.ts` — Token optimization utility limiting specs to 15 endpoints for fast LLM inference
- `lib/chainVariables.ts` — Variable store extractor (`extractTargetVariables`) and template interpolator (`substituteVariables`)
- `types/index.ts` — TypeScript type definitions (`ApiEndpoint`, `ApiParameter`, `ApiSpec`, `ChatMessage`)

### 5.3 Frontend & UI Components
- `app/page.tsx` — Main single-page application orchestrating Explorer, Playground, Monaco Editor, AI Assistant, Variable Store, and Modals
- `app/login/page.tsx` — Authentication login interface
- `app/signup/page.tsx` — User registration interface
- `app/layout.tsx` — Root layout with Google Fonts (`Space_Grotesk`, `IBM_Plex_Sans`, `IBM_Plex_Mono`) and AuthProvider
- `context/AuthContext.tsx` — Firebase authentication state listener and session redirection
- `components/VariableStorePanel.tsx` — Collapsible sidebar for managing active chain variables
- `components/VariableInput.tsx` — Input field with inline `{{` autocompletion for chain variables
- `components/ApiMetaphorAnimation.tsx` — Interactive visual metaphor component (Diner -> Waiter -> Kitchen)
- `components/ui/*` — Reusable UI primitives (`badge.tsx`, `button.tsx`, `card.tsx`, `input.tsx`, `textarea.tsx`)

---

## 6. Environment Variables & Model Configuration

| Variable | Scope | Purpose | Status in Codebase |
|---|---|---|---|
| `GROQ_API_KEY` | Server-Side Only | Groq API authentication key | Properly isolated in server routes; never leaked to client bundle |
| `GROQ_MODEL` | Server-Side Only | Target Groq LLM model identifier | Set to active model (`openai/gpt-oss-120b` / `llama-3.3-70b-versatile`) |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Public / Client | Firebase client SDK initialization | Public API identifier |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Public / Client | Firebase Auth Domain | Configured |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Public / Client | Firebase Project ID | Configured |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Public / Client | Firebase Storage Bucket | Configured |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Public / Client | Firebase Messaging Sender ID | Configured |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Public / Client | Firebase Web App ID | Configured |

---

## 7. Security, Code Quality & Risk Audit

1. **Client-Side Secret Exposure:**
   - **Audit Result:** PASSED. `GROQ_API_KEY` is referenced strictly within `app/api/*/route.ts`. No `NEXT_PUBLIC_GROQ_` variables exist. Client components only communicate via Next.js backend proxy routes.
2. **Hardcoded Credentials:**
   - **Audit Result:** PASSED. No API keys or service account secrets are hardcoded in source files. Fallback `'dummy_key_for_build'` is used solely to prevent static build failures when environment variables are unmounted during CI.
3. **Spec Size & Context Optimization:**
   - **Audit Result:** PASSED. `lib/specTrimmer.ts` aggressively bounds large OpenAPI documents (e.g., Kubernetes, Stripe, Spotify) to 15 endpoints, preventing prompt overflow and token limit errors.
4. **JSON Parsing Resilience:**
   - **Audit Result:** PASSED. All AI routes that require JSON outputs implement `safeParseJSON` with regex-based control character cleansing (`\x00-\x1F\x7F`) to prevent unescaped newlines from breaking JSON parsing.
5. **Rate Limiting & Error Classification:**
   - **Audit Result:** PASSED. Standardized error catch blocks intercept HTTP 413, 400, and 429 status codes from Groq and transform them into user-friendly error messages and actionable tips.

---

## 8. Recommended Integration Points for Future Hybrid AI

When extending Orion with hybrid AI orchestration (e.g. edge/cloud tiering, routing between low-latency local models and high-capacity cloud models), the recommended extension points are:

1. **Centralized AI Dispatch Gateway:**
   - Consolidate common Groq client instantiation and completions into a dedicated service layer (e.g., `services/ai/gateway.ts`).
   - Enable policy-based routing (e.g., route fast variable suggestions to on-device/small models, and heavy SDK code generation to 70B+ cloud models).
2. **Streaming Completions:**
   - Upgrade `/api/chat` and `/api/generate-sdk` to use Server-Sent Events (SSE) / `ReadableStream` for real-time word-by-word streaming in the AI assistant panel.
3. **Caching Layer:**
   - Cache parsed OpenAPI specifications and static security scan outputs using Redis or Next.js cache to eliminate redundant LLM calls on immutable API specs.
