# Cellix - Claude Code Context

## Project Overview

**Cellix** is an Excel Office.js Add-in providing an AI-powered chat assistant specialized for Shopee and Lazada ecommerce analytics. The assistant uses structured tool calls to manipulate Excel data safely with preview-first execution.

### MVP Vision (Phases 1-4)
An AI chat assistant that can:
- Read and understand your Excel data (selection, sheets, tables)
- Write data, formulas, and formatting with preview before execution
- Explain ecommerce KPIs and provide analytics guidance
- All with robust safety controls (cell limits, validation, audit logging)

### Full Vision (Post-MVP)
- Sheet Intelligence: Profile-based understanding of large Excel files
- RAG-powered domain knowledge retrieval
- Direct Shopee/Lazada API integration
- Anomaly detection and proactive alerts
- Automated report generation
- Template library for common analytics tasks

> **See:** `FEATURE_PLAN.md` for detailed feature specifications and phases.

---

## Tech Stack

### Frontend (Add-in)
| Component | Technology | MVP |
|-----------|------------|-----|
| Framework | React 18 + TypeScript | ✅ |
| Bundler | Vite | ✅ |
| Office Integration | Office.js (Excel API) | ✅ |
| State Management | Zustand | ✅ |
| UI Components | Fluent UI React v9 | ✅ |
| HTTP Client | Axios | ✅ |
| Data Processing | Arquero (~105KB) | ❌ Phase 5 |
| Real-time | Socket.io Client | ❌ Phase 8+ |

### Backend
| Component | Technology | MVP |
|-----------|------------|-----|
| Runtime | Node.js 20 LTS | ✅ |
| Framework | Fastify | ✅ |
| AI Provider | OpenAI (+ Claude API ready) | ✅ |
| Embeddings | text-embedding-3-small | ❌ Phase 6+ |
| Vector DB | Supabase pgvector | ❌ Phase 6+ |
| Queue | Bull + Redis | ❌ Phase 10+ |
| Validation | Zod | ✅ |
| Auth | Supabase Auth | ✅ |

### Infrastructure
| Component | Technology | MVP |
|-----------|------------|-----|
| Hosting | Vercel (add-in) + Railway/Render (backend) | ✅ |
| Database | Supabase (Postgres) | ✅ |
| Cache | Redis (Upstash) | ❌ Phase 6+ |
| Monitoring | Sentry | ❌ Phase 13 |

> **Note:** Items marked ❌ are deferred from MVP. Install only when needed.

---

## Development Philosophy

### Core Principles
1. **KISS** - Keep It Simple, Stupid. Avoid over-engineering.
2. **YAGNI** - You Aren't Gonna Need It. Don't build for hypothetical futures.
3. **Safety-First** - All Excel writes require preview and user confirmation.
4. **Domain-Focused** - Deep ecommerce/marketplace specialization over generic features.

### Code Standards
- TypeScript strict mode everywhere
- Zod for runtime validation
- Consistent error handling patterns
- Office.js call batching for performance
- Test-driven for critical paths

---

## Hard Rules (MUST Follow)

### Architecture
1. **Monorepo Structure** - Use pnpm workspaces with apps/addin, apps/backend, packages/shared
2. **Supabase Only** - No other databases. Use pgvector for embeddings.
3. **Fastify Backend** - No Express. Use Fastify with TypeScript.
4. **Office.js Patterns** - Always batch Excel operations. Never block UI thread.
5. **Fluent UI** - Use Microsoft's Fluent UI v9 for all UI components.

### Safety Controls (Non-Negotiable)
1. **Preview Required** - ALL write operations to Excel must show preview first
2. **User Confirmation** - Writes > 50 cells require explicit confirmation dialog
3. **No Sheet Deletion** - v1 does not allow deleting sheets
4. **No Workbook Operations** - No workbook-level changes
5. **Cell Limit** - Maximum 500 cells per write operation
6. **Formula Safety** - No external links, no macros in formulas
7. **Audit Logging** - Log all tool executions to audit_log table

### Tool Execution
1. **Schema Validation** - All tool calls must pass JSON schema validation
2. **Address Validation** - All Excel addresses must be valid A1 notation
3. **Type Validation** - All values must match expected types
4. **Whitelist Enforcement** - Only whitelisted tools can be executed

### Data Privacy
1. **No Full Sheet Uploads** - Only sample data (max 50 rows) sent to AI
2. **Token Encryption** - Platform OAuth tokens must be encrypted at rest
3. **No Credential Logging** - Never log API keys or tokens

---

## Project Structure

```
cellix/
├── CLAUDE.md                    # This file
├── FEATURE_PLAN.md              # Detailed feature specifications
├── PRPs/                        # Project Requirement Plans for features
├── .claude/                     # Claude Code configuration
│   ├── agents/                  # Custom agents
│   ├── commands/                # Custom commands
│   ├── examples/                # Code templates
│   ├── reference/               # Technical documentation
│   ├── mcp.json                 # MCP server configuration
│   └── settings.local.json      # Permissions
│
├── apps/
│   ├── addin/                   # Excel Add-in (React + Office.js)
│   │   ├── src/
│   │   │   ├── components/      # UI components
│   │   │   ├── hooks/           # React hooks
│   │   │   ├── lib/             # Utilities (excel/, api/, tools/)
│   │   │   ├── store/           # Zustand stores
│   │   │   └── types/           # TypeScript types
│   │   ├── manifest.xml         # Office Add-in manifest
│   │   └── vite.config.ts
│   │
│   └── backend/                 # API Server (Fastify)
│       ├── src/
│       │   ├── routes/          # API endpoints
│       │   ├── services/        # Business logic
│       │   │   ├── ai/          # OpenAI integration
│       │   │   ├── rag/         # Embedding & retrieval
│       │   │   ├── tools/       # Tool validation & execution
│       │   │   ├── platforms/   # Shopee/Lazada connectors
│       │   │   └── anomaly/     # Anomaly detection
│       │   └── lib/             # Shared utilities
│       └── package.json
│
├── packages/
│   └── shared/                  # Shared types and utilities
│
├── rag-data/                    # RAG seed documents
│   ├── kpis/                    # KPI definitions
│   ├── glossary/                # Ecommerce glossary
│   └── formulas/                # Formula library
│
└── scripts/                     # Setup and utility scripts
```

---

## Development Phases

### MVP (Phases 1-4) - Target: 4-6 weeks
| Phase | Name | Focus | Week |
|-------|------|-------|------|
| 1 | Foundation | Monorepo, add-in shell, basic chat UI, backend | 1 |
| 2 | Excel Integration | Office.js read/write helpers, context extraction | 2 |
| 3 | AI Chat | Tool schemas, AI service, prompt builder | 3 |
| 4 | Tool Execution | Validation, preview system, safety controls | 4 |
| - | Testing & Polish | Sideload testing, bug fixes, AppSource prep | 5-6 |

### Post-MVP (Phases 5-13) - After validation
| Phase | Name | Focus | Priority |
|-------|------|-------|----------|
| 5 | Sheet Intelligence | Profile system, smart retrieval, large file support | High |
| 6 | RAG Knowledge | Vector embeddings, knowledge retrieval | High |
| 7 | Data Connectors | Shopee/Lazada OAuth and APIs | High |
| 8 | Anomaly Detection | Metric monitors, alert system | Medium |
| 9 | Comparison Intelligence | Cross-platform/period comparisons | Medium |
| 10 | Report Generation | Automated Excel reports | Medium |
| 11 | Template Library | Pre-built analytics templates | Low |
| 12 | Notifications | Slack, Teams, Email integrations | Low |
| 13 | Polish & Production | Error handling, AppSource submission | High |

> **Current Phase:** Phase 4 Complete (Tool Execution)
>
> **MVP Strategy:** Ship Phases 1-4 first to validate product-market fit. Defer RAG (use hardcoded system prompt), data connectors (users paste data), and other features until core value is proven.

---

## AI Provider Architecture

### Provider Abstraction (Required)
Design AI integration to support multiple providers from day one:

```typescript
// apps/backend/src/services/ai/types.ts
interface AIProvider {
  chat(params: ChatParams): AsyncIterable<ChatResponse>;
  name: string;
}

interface ChatParams {
  messages: Message[];
  tools: ToolDefinition[];
  maxTokens?: number;
}

// Start with OpenAI, easy to add Claude later
```

### Token Budget Management (Required)
Prevent runaway costs with per-session limits:

```typescript
const TOKEN_LIMITS = {
  MAX_INPUT_TOKENS: 8000,      // Per request
  MAX_OUTPUT_TOKENS: 4000,     // Per request
  MAX_SESSION_TOKENS: 50000,   // Per chat session
  WARN_THRESHOLD: 0.8,         // Warn at 80% usage
};
```

### MVP AI Strategy
- Use OpenAI `gpt-4o` for chat (good balance of speed/quality)
- Hardcode ecommerce knowledge in system prompt (no RAG)
- Add Claude API support after MVP validation
- Consider MCP (Model Context Protocol) for provider-agnostic tools

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| OpenAI costs spiral | Medium | High | Token budgets per session, caching |
| Shopee/Lazada API delays | High | Medium | Defer to post-MVP, users paste data |
| Office.js cross-platform bugs | Medium | Medium | Test Mac/Windows/Web early |
| AppSource rejection | Medium | Medium | Follow MS guidelines, budget 3-5 days review |
| LLM hallucinations | Medium | High | Strong tool schemas, preview-first, validation |
| Microsoft Copilot competition | Low | Medium | Niche focus on Shopee/Lazada |

### Known Gaps to Address
- [ ] Offline/degraded mode when backend is down
- [ ] Undo/rollback for Excel operations
- [ ] Telemetry for usage analytics
- [ ] Rate limiting specification
- [ ] Error recovery UX flows

---

## Tool Categories

### Excel Write Tools (Require Preview)
- `write_range(address, values, reason)` - Write 2D array
- `set_formula(address, formula, reason)` - Set formula
- `format_range(address, style, reason)` - Apply formatting
- `create_sheet(name, reason)` - Create worksheet
- `add_table(address, name, headers, reason)` - Create table
- `highlight_cells(address, color, reason)` - Highlight range
- `add_summary_row(address, metrics, reason)` - Add SUM/AVG

### Excel Read Tools (No Preview)
- `read_range(address)` - Get values from range
- `get_selection()` - Get current selection
- `get_sheet_names()` - List worksheets
- `get_context()` - Get current Excel context

### Analytics Tools (Reasoning Only)
- `explain_kpi(kpi_name, context)` - Explain KPI
- `compare_periods(metric, p1, p2)` - Time comparison
- `compare_platforms(metric, range)` - Platform comparison
- `detect_anomalies(context)` - Find anomalies
- `suggest_actions(context)` - Recommendations

### Data Connector Tools (Post-MVP - Phase 6+)
- `sync_orders(platform, date_range)` - Pull orders
- `sync_campaigns(platform, ids)` - Pull campaign data
- `import_to_sheet(type, destination)` - Import to Excel

> **MVP Note:** Data connectors require Shopee/Lazada OAuth approval which can take weeks. For MVP, users will paste/import data manually.

---

## Key Files Reference

| Purpose | File |
|---------|------|
| Feature specs | `FEATURE_PLAN.md` |
| Add-in entry | `apps/addin/src/main.tsx` |
| Excel helpers | `apps/addin/src/lib/excel/` |
| Tool executor | `apps/addin/src/lib/tools/executor.ts` |
| Backend entry | `apps/backend/src/index.ts` |
| AI service | `apps/backend/src/services/ai/` |
| RAG service | `apps/backend/src/services/rag/` |
| Tool schemas | `apps/backend/src/services/tools/schema.ts` |
| Shared types | `packages/shared/src/types/` |

---

## Database Schema (Supabase)

### MVP Tables
- `chat_sessions` - Chat history
- `audit_log` - Tool execution audit trail

### Post-MVP Tables
- `platform_connections` - Shopee/Lazada OAuth tokens (Phase 7)
- `knowledge_chunks` - RAG embeddings with pgvector (Phase 6)
- `alerts` - Anomaly alerts (Phase 8)
- `templates` - Report/sheet templates (Phase 11)

> See `FEATURE_PLAN.md` for full schema definitions.

---

## Testing Strategy

| Type | Tool | Coverage Target |
|------|------|----------------|
| Unit | Vitest | 70% |
| Integration | Vitest | 20% |
| E2E | Playwright | Critical paths |
| Office.js | Mock + Sideload | Manual validation |

### Test Patterns
- Mock Office.js context for unit tests
- Use Supabase local for integration tests
- Sideload add-in for manual E2E testing

---

## Common Tasks

### Starting Development
```bash
pnpm install
pnpm dev           # Starts both add-in and backend
```

### Running Tests
```bash
pnpm test          # Run all tests
pnpm test:addin    # Add-in tests only
pnpm test:backend  # Backend tests only
```

### Database Operations
```bash
pnpm db:migrate    # Run migrations
pnpm db:seed       # Seed RAG data
pnpm db:reset      # Reset database
```

### Building for Production
```bash
pnpm build         # Build all
pnpm build:addin   # Build add-in only
```

---

## Error Handling Patterns

### Frontend (Add-in)
```typescript
// Use Error Boundaries for component errors
// Use try-catch with user-friendly messages
// Report to Sentry in production
```

### Backend
```typescript
// Use Fastify error handler
// Return consistent error shape: { error: string, code: string }
// Log errors with request context
```

### Office.js
```typescript
// Always use Excel.run() with proper error handling
// Handle OfficeExtension.Error specifically
// Provide fallback for unsupported features
```

---

## Performance Guidelines

### Office.js (MVP Critical)
- Batch all read/write operations in single `Excel.run()`
- Use `context.sync()` minimally
- Load only needed properties with `load()`
- Use `range.track()` for long-running operations

### Backend (MVP)
- Stream AI responses (critical for UX)
- Use connection pooling for Supabase

### Backend (Post-MVP)
- Cache RAG embeddings (Phase 5+)
- Queue heavy operations with Bull (Phase 9+)

### Frontend (MVP)
- Lazy load non-critical components
- Memoize expensive computations
- Debounce user inputs

### Frontend (Post-MVP)
- Virtualize long lists (when needed)

---

## Security Checklist

- [ ] Validate all user inputs with Zod
- [ ] Sanitize Excel formulas (no external links)
- [ ] Encrypt OAuth tokens at rest
- [ ] Use HTTPS everywhere
- [ ] Implement rate limiting
- [ ] Audit log all tool executions
- [ ] No credentials in code or logs
- [ ] CSP headers configured
- [ ] CORS properly configured

---

## Quick Reference

### Supabase Project
- **URL:** `https://<project-ref>.supabase.co`
- **Region:** (configure as needed)

### Key Dependencies
- `@fluentui/react-components` - UI components
- `office-addin-*` - Office.js tooling
- `@supabase/supabase-js` - Database client
- `openai` - AI provider
- `zod` - Validation
- `fastify` - Backend framework
- `arquero` - Data processing (Phase 5) - filter, aggregate, outlier detection

### Useful Commands
| Command | Description |
|---------|-------------|
| `/primer` | Load project context |
| `/generate-prp <feature>` | Create feature plan |
| `/execute-prp <file>` | Implement from PRP |
| `/commit` | Create atomic commit |
| `/code-review` | Review recent changes |
| `/phase-check` | Validate phase completion |
