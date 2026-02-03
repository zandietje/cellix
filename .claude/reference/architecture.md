# Cellix Architecture Reference

## Overview

Cellix is a monorepo containing an Excel Add-in (frontend) and a Fastify API (backend), connected to Supabase for persistence and OpenAI for AI capabilities.

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         EXCEL ADD-IN (Task Pane)                    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌────────────┐ │
│  │  Chat UI    │  │  Preview    │  │  Controls   │  │  Alerts    │ │
│  │  Component  │  │  Panel      │  │  Panel      │  │  Panel     │ │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └─────┬──────┘ │
│         └────────────────┴────────────────┴────────────────┘        │
│                                   │                                  │
│  ┌────────────────────────────────┴────────────────────────────────┐│
│  │                    Excel Context Layer                          ││
│  │  lib/excel/reader.ts  |  lib/excel/writer.ts  |  lib/tools/     ││
│  └─────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────┘
                                │ HTTPS (Axios)
┌───────────────────────────────┼─────────────────────────────────────┐
│                         BACKEND API                                  │
│  ┌────────────────────────────┴────────────────────────────────────┐│
│  │                      Fastify Server                              ││
│  │  routes/chat.ts | routes/platforms.ts | routes/alerts.ts        ││
│  └──────┬───────────────┬───────────────┬───────────────┬──────────┘│
│         │               │               │               │            │
│  ┌──────┴────┐   ┌──────┴────┐   ┌──────┴────┐   ┌──────┴────┐     │
│  │ AI        │   │ RAG       │   │ Tool      │   │ Platform  │     │
│  │ Service   │   │ Service   │   │ Validator │   │ Connector │     │
│  └──────┬────┘   └──────┬────┘   └───────────┘   └──────┬────┘     │
└─────────┼───────────────┼───────────────────────────────┼───────────┘
          │               │                               │
    ┌─────┴─────┐   ┌─────┴─────┐                  ┌──────┴──────┐
    │  OpenAI   │   │ Supabase  │                  │ Shopee/     │
    │  Azure    │   │ pgvector  │                  │ Lazada APIs │
    └───────────┘   └───────────┘                  └─────────────┘
```

## Monorepo Structure

```
cellix/
├── package.json              # Workspace root
├── pnpm-workspace.yaml       # pnpm workspaces config
├── turbo.json                # Turborepo config (optional)
│
├── apps/
│   ├── addin/                # Excel Add-in
│   └── backend/              # Fastify API
│
├── packages/
│   └── shared/               # Shared types and utilities
│
├── rag-data/                 # RAG seed documents
└── scripts/                  # Setup and utility scripts
```

## Layer Architecture

### Layer 1: Presentation (Add-in)
- React components (Fluent UI)
- State management (Zustand)
- Office.js integration
- User interactions

### Layer 2: Application (Backend Routes)
- Fastify route handlers
- Request validation (Zod)
- Response formatting
- Error handling

### Layer 3: Domain (Services)
- AI service (OpenAI integration)
- RAG service (embedding & retrieval)
- Tool validation service
- Platform connectors
- Anomaly detection

### Layer 4: Infrastructure
- Supabase client
- Redis client
- External API clients
- Logging/monitoring

## Data Flow

### Chat Request Flow
```
1. User sends message in Chat UI
2. Add-in extracts Excel context (selected range, etc.)
3. POST /api/chat with { message, context }
4. Backend retrieves RAG knowledge
5. Backend builds prompt with context + knowledge
6. OpenAI generates response with tool calls
7. Backend validates tool calls
8. Response streamed back to add-in
9. Add-in shows preview for any write tools
10. User confirms → tools executed on Excel
```

### Tool Execution Flow
```
1. AI returns tool call (e.g., write_range)
2. Backend validates against schema (Zod)
3. Backend checks whitelist
4. Backend checks safety limits (500 cells)
5. Preview generated and sent to add-in
6. User sees preview in Preview Panel
7. User confirms execution
8. Add-in executes via Office.js
9. Result logged to audit_log
10. Success message shown to user
```

## Key Design Decisions

### 1. Preview-First Tool Execution
All write operations must show preview before execution. This is a non-negotiable safety requirement.

### 2. Streaming Responses
Chat responses are streamed via SSE to provide real-time feedback to users.

### 3. Monorepo with Shared Types
Types are shared between add-in and backend via `packages/shared` to ensure consistency.

### 4. Zustand for State
Zustand chosen over Redux for simpler state management suitable for add-in scope.

### 5. Fastify over Express
Fastify provides better TypeScript support and performance for our API needs.

### 6. Supabase for Everything
Single database platform handles:
- Auth (Supabase Auth)
- Data (PostgreSQL)
- Vectors (pgvector)
- Real-time (Supabase Realtime)

## Communication Patterns

### Add-in ↔ Backend
- REST API (Fastify)
- SSE for streaming chat responses
- Socket.io for real-time alerts (Phase 7+)

### Backend ↔ OpenAI
- OpenAI SDK with streaming
- Function calling for tools

### Backend ↔ Supabase
- Supabase JS client
- RLS for data isolation

### Backend ↔ Platforms
- REST APIs (Shopee Open Platform, Lazada Open Platform)
- OAuth2 for authentication

## Security Boundaries

```
┌─────────────────────────────────────────┐
│              User's Excel               │
│  ┌───────────────────────────────────┐  │
│  │           Add-in Sandbox          │  │  ← Office.js sandbox
│  │  (Can only access Excel via API)  │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
                    │
                    │ HTTPS (validated)
                    ▼
┌─────────────────────────────────────────┐
│              Backend API                │
│  ┌───────────────────────────────────┐  │
│  │       Auth Middleware             │  │  ← Supabase Auth
│  │       Rate Limiting               │  │  ← Per-user limits
│  │       Input Validation            │  │  ← Zod schemas
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
                    │
                    │ RLS enforced
                    ▼
┌─────────────────────────────────────────┐
│              Supabase                   │
│  (Row Level Security per user)          │
└─────────────────────────────────────────┘
```

## Scaling Considerations

### Phase 1-4 (MVP)
- Single backend instance
- Supabase free/pro tier
- No caching needed

### Phase 5+ (Growth)
- Add Redis caching for RAG
- Consider background jobs (Bull)
- Monitor OpenAI costs

### Production
- Multiple backend instances
- Connection pooling
- CDN for static assets
- Error tracking (Sentry)
