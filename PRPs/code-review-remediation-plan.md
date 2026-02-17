# Code Review Remediation Plan

**Date:** 2026-02-12
**Scope:** Full codebase review — frontend components, frontend lib/stores, backend, shared packages, configuration
**Overall Assessment:** 7/10

---

## Table of Contents

1. [Critical Issues](#1-critical-issues)
2. [High Priority Issues](#2-high-priority-issues)
3. [Medium Priority Issues](#3-medium-priority-issues)
4. [Low Priority Issues](#4-low-priority-issues)
5. [Positive Findings](#5-positive-findings)
6. [Action Plan](#6-action-plan)

---

## 1. Critical Issues

> Fix immediately. These are security risks or potential production blockers.

### 1.1 API Key Exposed in `.env.example`

- **File:** `apps/backend/.env.example`
- **Problem:** Contains what appears to be a real OpenRouter API key (`sk-or-v1-...`). This is committed to git history and visible to anyone with repo access.
- **Impact:** Unauthorized API usage, cost exposure
- **Fix:**
  - [ ] Rotate the exposed key immediately on the OpenRouter dashboard
  - [ ] Replace the real key in `.env.example` with a placeholder: `OPENAI_API_KEY=sk-or-v1-your-key-here`
  - [ ] Scrub the key from git history using `git filter-branch` or BFG Repo Cleaner
  - [ ] Verify `.env` is in `.gitignore` (currently is)

---

### 1.2 No Authentication on Backend

- **Files:** All endpoints in `apps/backend/src/routes/`
- **Problem:** Every endpoint is completely open. Anyone who discovers the backend URL can create sessions and consume OpenAI tokens without limit.
- **Impact:** Unlimited API cost exposure, data access by unauthorized users
- **Fix:**
  - [ ] Implement Supabase Auth integration (already in tech stack plan)
  - [ ] Add auth middleware to Fastify that validates JWT tokens
  - [ ] At minimum for MVP: add a shared API key header check as a stopgap
  - [ ] Document the risk explicitly if shipping without auth

---

### 1.3 No Rate Limiting

- **Files:** All route handlers
- **Problem:** No rate limiting on any endpoint. Combined with no auth, this allows unlimited abuse.
- **Impact:** DoS risk, runaway OpenAI costs
- **Fix:**
  - [ ] Install `@fastify/rate-limit`
  - [ ] Configure per-endpoint limits:
    - `/api/chat` — 20 requests/minute per IP
    - `/api/chat/continue` — 30 requests/minute per IP
    - `/api/chat/plan` — 20 requests/minute per IP
    - `/api/session` — 10 requests/minute per IP
  - [ ] Return `429 Too Many Requests` with `Retry-After` header

---

### 1.4 CORS Wildcard on SSE Endpoints

- **File:** `apps/backend/src/routes/chat.ts`
- **Lines:** 156, 389
- **Code:**
  ```typescript
  'Access-Control-Allow-Origin': '*', // CORS for SSE
  ```
- **Problem:** Bypasses Fastify's CORS plugin configuration. Any website can make requests to streaming endpoints.
- **Impact:** Cross-site request forgery, unauthorized access from malicious sites
- **Fix:**
  - [ ] Remove the hardcoded `*` header from SSE responses
  - [ ] Use `request.headers.origin` and validate against an allowlist
  - [ ] Or rely entirely on Fastify's CORS plugin for consistency:
    ```typescript
    // Remove this line from both SSE handlers:
    'Access-Control-Allow-Origin': '*',
    ```

---

## 2. High Priority Issues

> Fix soon. These cause bugs, maintainability problems, or type safety holes.

### 2.1 Unsafe Type Casts in `executor.ts`

- **File:** `apps/addin/src/lib/tools/executor.ts`
- **Lines:** 85-225 (13 instances)
- **Code:**
  ```typescript
  const params = toolCall.parameters as unknown as WriteRangeParams;
  ```
- **Problem:** `as unknown as` completely bypasses TypeScript's type system. If parameters don't match the expected shape, runtime errors occur with no compile-time warning.
- **Fix:**
  - [ ] Create type guard functions for each tool parameter type:
    ```typescript
    function isWriteRangeParams(params: unknown): params is WriteRangeParams {
      return (
        typeof params === 'object' &&
        params !== null &&
        'address' in params &&
        'values' in params
      );
    }
    ```
  - [ ] Or use Zod schemas (already defined in backend) to validate at runtime:
    ```typescript
    const parsed = writeRangeSchema.safeParse(toolCall.parameters);
    if (!parsed.success) return { success: false, error: 'Invalid parameters' };
    ```
  - [ ] Consider discriminated unions for `ToolCall`:
    ```typescript
    type ToolCall =
      | { name: 'write_range'; parameters: WriteRangeParams }
      | { name: 'set_formula'; parameters: SetFormulaParams }
      // ...
    ```

---

### 2.2 `excelContext: z.any()` in Backend Validation

- **File:** `apps/backend/src/routes/chat.ts`
- **Lines:** 42, 52
- **Code:**
  ```typescript
  excelContext: z.any().optional(),
  ```
- **Problem:** Excel context is accepted without any shape validation. Malformed payloads can crash context formatting functions or produce incorrect AI prompts.
- **Fix:**
  - [ ] Define proper Zod schemas for `ExcelContextFull` and `ExcelContextWithProfile`
  - [ ] Use `z.union([excelContextFullSchema, excelContextWithProfileSchema])` instead of `z.any()`
  - [ ] At minimum, validate the top-level shape:
    ```typescript
    excelContext: z.object({
      selection: z.object({ address: z.string() }).optional(),
      profile: z.unknown().optional(),
      inventory: z.unknown().optional(),
    }).optional(),
    ```

---

### 2.3 ChatPane.tsx is a God Component

- **File:** `apps/addin/src/components/chat/ChatPane.tsx`
- **Lines:** 396 total
- **Problem:** Single component handles stream consumption, tool execution orchestration, state management, error handling, history building, and continuation loops. This makes it hard to test, debug, and modify.
- **Fix:**
  - [ ] Extract stream processing into a custom hook:
    ```typescript
    // hooks/useStreamProcessor.ts
    export function useStreamProcessor() {
      const consumeStream = useCallback(...);
      return { consumeStream };
    }
    ```
  - [ ] Extract tool execution into a custom hook:
    ```typescript
    // hooks/useToolExecution.ts
    export function useToolExecution() {
      const executeAndCollectResults = useCallback(...);
      return { executeAndCollectResults };
    }
    ```
  - [ ] Extract the continuation loop into a service:
    ```typescript
    // lib/tools/orchestrator.ts
    export async function orchestrateToolLoop(params: OrchestrateParams) { ... }
    ```
  - [ ] ChatPane should only compose hooks and render UI

---

### 2.4 Silent Error Swallowing (Multiple Files)

- **Problem:** Errors are caught and silently discarded in several critical paths. This makes debugging nearly impossible and can leave the UI in broken states.
- **Locations and fixes:**

| File | Line | Current Behavior | Fix |
|------|------|-----------------|-----|
| `ChatPane.tsx` | 169 | JSON parse failure returns `{}` | Log error, set tool status to `'error'`, `continue` to skip |
| `profiler.ts` | 290 | Table extraction returns `[]` | Log warning, include in profile quality signals |
| `sessionManager.ts` | 105 | Save failure logs but doesn't propagate | Return `{ success: boolean }` or throw |
| `api.ts` | 122 | SSE parse error just warns | Track parse failures, surface to UI if repeated |

- [ ] Standardize on a Result pattern:
  ```typescript
  type Result<T> = { ok: true; value: T } | { ok: false; error: string };
  ```
- [ ] Never use empty `catch {}` blocks — always at minimum log

---

### 2.5 Route Handlers Too Complex

- **File:** `apps/backend/src/routes/chat.ts`
- **Lines:** `/chat` handler is 223 lines, `/chat/continue` is 121 lines
- **Problem:** Handlers mix validation, history loading, context formatting, token counting, streaming, and session persistence. Hard to test and maintain.
- **Fix:**
  - [ ] Create `apps/backend/src/services/chat/chatService.ts`:
    ```typescript
    export class ChatService {
      async processMessage(params: ChatParams): Promise<AsyncIterable<ChatEvent>> { }
      async continueWithToolResults(params: ContinueParams): Promise<AsyncIterable<ChatEvent>> { }
      private buildMessages(history, context, message): Message[] { }
      private formatContext(excelContext): string { }
    }
    ```
  - [ ] Route handlers should only: parse request, call service, stream response
  - [ ] This also makes unit testing the business logic possible without HTTP

---

### 2.6 Type Duplication Between Shared and Backend

- **Problem:** Same interfaces defined in multiple places, causing drift risk.
- **Locations:**

| Type | Shared Location | Backend Location |
|------|----------------|-----------------|
| `ToolCallChunk` | `packages/shared/src/types/chat.ts:52-59` | `apps/backend/src/services/ai/types.ts:43-50` |
| `ChatStreamEvent` | `packages/shared/src/types/chat.ts:62-73` (7 types) | `apps/backend/src/services/ai/types.ts:53-62` (6 types) |
| `ExcelContext` union | `apps/addin/src/store/excelStore.ts:10` | `apps/addin/src/lib/api.ts:11` (as `ChatContext`) |

- **Fix:**
  - [ ] Delete backend duplicates, import from `@cellix/shared` instead
  - [ ] Add the `'session'` event type to shared `ChatStreamEvent` (backend has 6, shared has 7)
  - [ ] Export the `ExcelContext` union from shared:
    ```typescript
    // packages/shared/src/types/excel.ts
    export type ExcelContext = ExcelContextFull | ExcelContextWithProfile;
    ```
  - [ ] Remove local `ChatContext` alias in `api.ts`

---

## 3. Medium Priority Issues

> Fix in the next sprint. These affect code quality, performance, and maintainability.

### 3.1 Duplicate Code Patterns

| Pattern | File 1 | File 2 | File 3 | Fix |
|---------|--------|--------|--------|-----|
| `formatCompact()` number formatting | `ToolResultDisplay.tsx:331-334` | `ContextDisplay.tsx:207-212` | — | Extract to `lib/utils/format.ts` |
| Tool name formatting (`replace(/_/g, ' ')`) | `ToolCallCard.tsx:106-108` | `ActionCard.tsx:105-107` | `DiffDialog.tsx:123` | Shared `formatToolName()` utility |
| Type dominance detection (0.8 threshold) | `profiler.ts:352-357` | `context.ts:189-194` | `streamingStats.ts:420` | Single `determineDominantType()` function |
| Cell value formatting | `DiffDialog.tsx:88-96` | `ToolResultDisplay.tsx:324-328` | — | Shared `formatCellValue()` utility |
| Context formatting for AI | `chat.ts:108-117` | `chat.ts:335-342` | `chat.ts:450-458` | Extract `formatContextForAI()` helper |

- [ ] Create `apps/addin/src/lib/utils/format.ts` with shared formatting functions
- [ ] Create `apps/addin/src/lib/utils/types.ts` with shared type detection
- [ ] Create helper in `chat.ts` for context formatting

---

### 3.2 Magic Numbers Throughout Codebase

| Location | Value | Meaning | Fix |
|----------|-------|---------|-----|
| `ChatPane.tsx:239` | `20` | Max history messages | Named constant |
| `ChatPane.tsx:15` | `3` | Max continuation iterations | Move to constants file |
| `ToolCallCard.tsx:120` | `30` | Formula truncation length | `MAX_INLINE_FORMULA_LENGTH` |
| `chat.ts:123` | `1000` | System token safety margin | `TOKEN_RESERVES.SAFETY_MARGIN` |
| `chat.ts:127` | `1500` | Truncation buffer | `TOKEN_RESERVES.TRUNCATION_BUFFER` |
| `chat.ts:133` | `500` | User message buffer | `TOKEN_RESERVES.USER_MESSAGE_BUFFER` |
| `readers.ts:34-44` | Various | Tool-specific row limits | Document rationale |
| `profiler.ts:33-40` | Various | Chunk/profile thresholds | Centralize with docs |
| `profiler.ts:353` | `0.8` | Type dominance threshold | `TYPE_DOMINANCE_THRESHOLD` |
| `api.ts:14` | `8000` | Max tool result size | Centralize |
| `context.ts:222` | `3` | Sample value count | Named constant |

- [ ] Create `apps/addin/src/lib/constants.ts` — extend existing file with all addin constants
- [ ] Create `apps/backend/src/lib/constants.ts` — extract backend constants
- [ ] Add JSDoc comments explaining why each value was chosen

---

### 3.3 `readers.ts` is 742 Lines with Mixed Concerns

- **File:** `apps/addin/src/lib/tools/readers.ts`
- **Problem:** Single file handles basic reads, complex analytics, Arquero processing, and Office.js operations.
- **Fix:**
  - [ ] Split into 3 files:
    ```
    readers/
    ├── basicReaders.ts        # read_range, get_selection, get_sheet_names, get_context
    ├── analyticsReaders.ts    # select_rows, group_aggregate, find_outliers, search_values
    └── dataProcessor.ts       # Arquero operations, filter builders, aggregation helpers
    ```
  - [ ] Create `readers/index.ts` barrel that re-exports everything for backward compatibility

---

### 3.4 Inefficient Arquero Filtering

- **File:** `apps/addin/src/lib/tools/readers.ts`
- **Lines:** 667-721
- **Code:**
  ```typescript
  const currentRows = result.objects() as Record<string, unknown>[];
  const filteredRows = currentRows.filter((row) => { ... });
  const columns: Record<string, unknown[]> = {};
  for (const colName of result.columnNames()) {
    columns[colName] = filteredRows.map((row) => row[colName]);
  }
  result = aq.table(columns) as ColumnTable;
  ```
- **Problem:** Converts Arquero table to row objects, filters in JavaScript, then converts back to Arquero table. This is O(n) for each conversion, done on every filter operation.
- **Fix:**
  - [ ] Use Arquero's native `.filter()` with an escape expression:
    ```typescript
    result = result.filter(aq.escape((d: Record<string, unknown>) => {
      return applyFilterPredicate(d, filter);
    }));
    ```
  - [ ] Or build Arquero-native filter expressions from the filter spec

---

### 3.5 Missing Error Boundaries

- **Problem:** No error boundaries around major UI sections. A rendering error in a tool result or message bubble crashes the entire app.
- **Fix:**
  - [ ] Wrap `ChatPane` in an error boundary:
    ```tsx
    <ErrorBoundary fallback={<ChatErrorFallback onReset={clearMessages} />}>
      <ChatPane />
    </ErrorBoundary>
    ```
  - [ ] Wrap `PreviewPanel` in a separate boundary
  - [ ] Wrap individual `MessageBubble` components (so one bad message doesn't kill the list)
  - [ ] Wrap `ToolResultDisplay` (tool results are the most likely to have unexpected shapes)

---

### 3.6 Redundant Profile Lookups

- **File:** `apps/addin/src/lib/tools/readers.ts`
- **Lines:** 104, 163, 270, 394
- **Problem:** `executeGetProfile()` is called separately in `executeSelectRows`, `executeGroupAggregate`, `executeFindOutliers`, and `executeSearchValues`. If the AI calls multiple tools in sequence, the profile is fetched multiple times.
- **Fix:**
  - [ ] Accept an optional `cachedProfile` parameter in each executor
  - [ ] Or create a short-lived execution context that caches the profile for the current batch:
    ```typescript
    class ToolExecutionContext {
      private profileCache = new Map<string, SheetProfile>();
      async getProfile(sheet?: string): Promise<SheetProfile> { ... }
    }
    ```

---

### 3.7 Inconsistent Error Response Shapes (Backend)

- **File:** `apps/backend/src/routes/chat.ts`
- **Problem:** Different endpoints return different error structures:
  ```typescript
  // Shape 1 (lines 83-89):
  { success: false, error: { code: 'VALIDATION_ERROR', message: '...' } }

  // Shape 2 (some places):
  { error: '...' }

  // Shape 3 (SSE errors):
  data: { type: 'error', message: '...' }
  ```
- **Fix:**
  - [ ] Define a standard error shape:
    ```typescript
    interface ApiError {
      success: false;
      error: { code: string; message: string };
    }
    ```
  - [ ] Create error factory functions:
    ```typescript
    function validationError(message: string) { ... }
    function serverError(message: string) { ... }
    ```
  - [ ] Use Fastify's `setErrorHandler` for consistent error formatting

---

### 3.8 `ToolCallCard.tsx`: 60-Line Function Inside Component

- **File:** `apps/addin/src/components/chat/ToolCallCard.tsx`
- **Lines:** 105-167
- **Code:**
  ```typescript
  const getParamSummary = (): string => {
    const params = parameters as Record<string, unknown>;
    const parts: string[] = [];
    // 60 lines of if-else chains per tool type...
  }
  ```
- **Problem:** Recreated on every render. Long function doing string formatting belongs outside the component.
- **Fix:**
  - [ ] Extract to pure function:
    ```typescript
    // Outside component or in utils
    const TOOL_SUMMARY_FORMATTERS: Record<string, (params: Record<string, unknown>) => string> = {
      write_range: (p) => `${p.address} (${(p.values as unknown[][])?.length} rows)`,
      set_formula: (p) => `${p.address}: ${truncate(String(p.formula), 30)}`,
      // ...
    };

    function getParamSummary(toolName: string, parameters: unknown): string {
      const formatter = TOOL_SUMMARY_FORMATTERS[toolName];
      return formatter ? formatter(parameters as Record<string, unknown>) : '';
    }
    ```

---

### 3.9 `unshift` in Loop is O(n²)

- **File:** `apps/backend/src/services/chat/sessionManager.ts`
- **Lines:** 120-130
- **Code:**
  ```typescript
  for (let i = messages.length - 1; i >= 0; i--) {
    // ...
    result.unshift(msg); // O(n) per call
  }
  ```
- **Problem:** `Array.unshift()` is O(n) because it shifts all existing elements. In a loop, this becomes O(n²).
- **Fix:**
  - [ ] Push then reverse:
    ```typescript
    const result: HistoryMessage[] = [];
    for (let i = messages.length - 1; i >= 0; i--) {
      // ... token budget check ...
      result.push(msg);
    }
    return result.reverse();
    ```

---

### 3.10 Hard-Coded Model Name in Planner

- **File:** `apps/backend/src/services/ai/planner.ts`
- **Line:** 125
- **Code:**
  ```typescript
  model: 'gpt-4o-mini',
  ```
- **Problem:** Can't be changed without code modification.
- **Fix:**
  - [ ] Add `OPENAI_PLANNER_MODEL` to `env.ts`:
    ```typescript
    OPENAI_PLANNER_MODEL: z.string().default('gpt-4o-mini'),
    ```

---

### 3.11 Duplicate Tool Call Handling in ChatPane

- **File:** `apps/addin/src/components/chat/ChatPane.tsx`
- **Lines:** 98-138
- **Problem:** `tool_call_start`, `tool_call_delta`, and `tool_call_end` cases all have nearly identical logic for finding/updating tool calls in the array.
- **Fix:**
  - [ ] Extract to helper:
    ```typescript
    function upsertToolCall(
      toolCalls: ToolCallInfo[],
      incoming: ToolCallChunk
    ): ToolCallInfo[] { ... }
    ```

---

### 3.12 History Loaded Twice in `/chat/continue`

- **File:** `apps/backend/src/routes/chat.ts`
- **Lines:** 326-332
- **Problem:** History is loaded from the database even though the frontend already sends it in `frontendHistory`. The DB call is redundant when the session exists.
- **Fix:**
  - [ ] Trust `frontendHistory` when provided, only fall back to DB if it's missing or empty
  - [ ] Or remove `frontendHistory` from the continue endpoint entirely and always use DB

---

## 4. Low Priority Issues

> Fix when convenient. These are minor quality improvements.

### 4.1 React Anti-Patterns

| Issue | File | Line(s) | Fix |
|-------|------|---------|-----|
| Array index as React key | `ToolResultDisplay.tsx` | 188, 251, 294 | Use row data hash or generate stable IDs |
| Inline keyframes likely broken | `TypingIndicator.tsx` | 18-27 | Use CSS keyframes or Griffel `@keyframes` |
| Missing memoization on table rows | `ToolResultDisplay.tsx` | 188 | Wrap table rows in `React.memo` |
| Function recreated every render | `ToolCallCard.tsx` | 105-167 | Extract to module-level function |
| `buildHistory` should be `useMemo` | `ChatPane.tsx` | 231-240 | Returns data, not a function |

---

### 4.2 Configuration Inconsistencies

| Issue | Fix |
|-------|-----|
| TypeScript `^5.3.3` in package.json but `5.9.3` installed | Update all package.json to `^5.9.3` |
| `apps/addin/tsconfig.json` missing `composite: true` | Add to match backend and shared |
| Vite proxy port hardcoded to `3001` | Use `process.env.VITE_BACKEND_PORT \|\| 3001` |
| Missing `.prettierignore` | Create with `node_modules`, `dist`, `coverage` |

---

### 4.3 Zustand Store Design

- **Files:** `apps/addin/src/store/chatStore.ts`, `excelStore.ts`
- **Issues:**
  - Mixes data state, UI state, and actions in one store
  - Deeply nested state updates are complex and error-prone
  - Missing computed selectors (e.g., `selectIsContextStale`)
- **Fix:**
  - [ ] Consider using Immer middleware for nested updates:
    ```typescript
    import { immer } from 'zustand/middleware/immer';
    ```
  - [ ] Add derived selectors:
    ```typescript
    export const selectIsContextStale = (state: ExcelState) =>
      state.lastRefresh != null && Date.now() - state.lastRefresh > 5 * 60 * 1000;
    ```
  - [ ] Consider splitting into `chatDataStore` and `chatUIStore` if complexity grows

---

### 4.4 Missing Observability

| Issue | File | Fix |
|-------|------|-----|
| `console.warn/error` instead of Fastify logger | `sessionManager.ts:54,105` | Pass logger instance or use shared logger |
| Token truncation logged without sizes | `chat.ts:129` | Log `{ original: systemTokens, limit, truncatedTo }` |
| No structured logging for session ops | `sessionManager.ts` | Add `{ sessionId, operation, success }` context |

---

### 4.5 Unused Code

| Item | File | Line | Action |
|------|------|------|--------|
| `columnToNumber` imported but unused | `readers.ts` | 20 | Remove import |
| `_params` unused parameter | `readers.ts` | 510 | Remove underscore, add `_: GetSheetNamesParams` or remove param |
| `tokenUsage` parameter never passed | `sessionManager.ts` | 69 | Remove parameter or implement token tracking |
| `parseColumnSpec` exported but never imported | `chunkedReader.ts` | 40 | Remove export or document intended usage |

---

### 4.6 Missing Accessibility

| Issue | File | Fix |
|-------|------|-----|
| Input missing `aria-label` | `InputBox.tsx` | Add `aria-label="Chat message"` |
| Confirmation dialog missing `aria-describedby` | `PreviewPanel.tsx` | Point to confirmation message element |
| No ARIA live regions for streaming | `MessageList.tsx` | Add `aria-live="polite"` to message container |
| No keyboard navigation for tool results | `ToolResultDisplay.tsx` | Add `tabIndex` and `role` attributes |

---

### 4.7 Planner Validation Uses Type Assertion Instead of Zod

- **File:** `apps/backend/src/services/ai/planner.ts`
- **Lines:** 149-164
- **Code:**
  ```typescript
  const plan = JSON.parse(content) as PlannerResponse;
  if (!plan.intent || !['action', 'question', 'clarify'].includes(plan.intent)) {
    plan.intent = 'clarify';
  }
  ```
- **Fix:**
  - [ ] Define `PlannerResponseSchema` with Zod and use `safeParse`:
    ```typescript
    const PlannerResponseSchema = z.object({
      intent: z.enum(['action', 'question', 'clarify']),
      confidence: z.number().min(0).max(1),
      reasoning: z.string(),
      // ...
    });
    const result = PlannerResponseSchema.safeParse(JSON.parse(content));
    ```

---

### 4.8 Information Leakage in Error Messages

- **File:** `apps/backend/src/routes/chat.ts`
- **Lines:** 87, 279-283, 317
- **Problem:** Zod validation errors are returned to the client, exposing internal schema structure.
- **Fix:**
  - [ ] Return generic messages in production:
    ```typescript
    const message = process.env.NODE_ENV === 'development'
      ? parseResult.error.errors[0]?.message
      : 'Invalid request parameters';
    ```
  - [ ] Log detailed errors server-side for debugging

---

## 5. Positive Findings

These are things the codebase does well and should be maintained:

| Area | What's Good |
|------|-------------|
| **Streaming stats** | Welford's algorithm and reservoir sampling in `streamingStats.ts` are solid, well-documented implementations |
| **Monorepo structure** | Clean separation with `apps/addin`, `apps/backend`, `packages/shared` and proper pnpm workspaces |
| **Safety-first design** | Preview system for write tools is well-designed with validation, limits, and user confirmation |
| **Provider abstraction** | AI service layer supports easy addition of new providers (Claude, etc.) |
| **Progressive profiling** | Smart approach to large Excel files — profile at different depth levels as needed |
| **Graceful degradation** | System works without Supabase configured (temporary session IDs, no persistence) |
| **No circular dependencies** | Clean module graph across all packages |
| **Consistent code style** | Prettier enforced, consistent TypeScript patterns throughout |
| **Shared types adoption** | 34 imports from `@cellix/shared` in addin, 5 in backend — good reuse |
| **Barrel exports** | Proper index.ts files throughout for clean import paths |
| **Office.js best practices** | Good use of batching, `context.sync()` minimization, and `load()` property selection |
| **Token budget management** | Proactive token counting and truncation prevents runaway costs |

---

## 6. Action Plan

### Phase 1: Immediate (Before Any Deployment)

| # | Task | Files | Effort |
|---|------|-------|--------|
| 1 | Rotate exposed API key | OpenRouter dashboard | 10 min |
| 2 | Fix `.env.example` placeholder | `apps/backend/.env.example` | 5 min |
| 3 | Remove CORS wildcard from SSE | `apps/backend/src/routes/chat.ts` | 15 min |
| 4 | Add `@fastify/rate-limit` | `apps/backend/src/server.ts`, `package.json` | 1 hour |

**Estimated total: 2 hours**

### Phase 2: Next Sprint — Type Safety and Architecture

| # | Task | Files | Effort |
|---|------|-------|--------|
| 5 | Add error boundaries | `App.tsx`, new `ChatErrorBoundary.tsx` | 2 hours |
| 6 | Replace unsafe casts with type guards | `executor.ts` | 3 hours |
| 7 | Validate `excelContext` with Zod | `chat.ts`, new schema file | 2 hours |
| 8 | Deduplicate types (shared vs backend) | `ai/types.ts`, shared types | 1 hour |
| 9 | Extract ChatPane into hooks | `ChatPane.tsx`, new hook files | 4 hours |
| 10 | Split `readers.ts` into 3 files | `readers/` directory | 2 hours |
| 11 | Centralize magic numbers | `constants.ts` files | 1 hour |
| 12 | Extract duplicate utilities | `lib/utils/format.ts` | 1 hour |

**Estimated total: 2 days**

### Phase 3: Code Quality and Polish

| # | Task | Files | Effort |
|---|------|-------|--------|
| 13 | Fix silent error swallowing | Multiple files | 2 hours |
| 14 | Standardize error response shapes | `chat.ts`, error helpers | 2 hours |
| 15 | Extract route logic to ChatService | New service file, `chat.ts` | 4 hours |
| 16 | Fix Arquero filtering efficiency | `readers.ts` | 1 hour |
| 17 | Fix React anti-patterns (keys, memo) | Component files | 1 hour |
| 18 | Remove unused code | Multiple files | 30 min |
| 19 | Fix config inconsistencies | `tsconfig.json`, `package.json` | 30 min |
| 20 | Add planner model to env config | `env.ts`, `planner.ts` | 15 min |

**Estimated total: 1.5 days**

### Phase 4: Technical Debt Backlog

| # | Task | Files | Effort |
|---|------|-------|--------|
| 21 | Implement authentication | New auth middleware, Supabase | 1-2 days |
| 22 | Add structured logging | Logger utility, all files | 4 hours |
| 23 | Add accessibility attributes | Component files | 2 hours |
| 24 | Improve Zustand stores (Immer, selectors) | Store files | 3 hours |
| 25 | Add Zod validation to planner response | `planner.ts` | 1 hour |
| 26 | Scrub API key from git history | Git operations | 1 hour |

**Estimated total: 3 days**

---

## Issue Counts Summary

| Severity | Count | Est. Fix Time |
|----------|-------|---------------|
| Critical | 4 | 2 hours |
| High | 6 | 2 days |
| Medium | 12 | 1.5 days |
| Low | 8 | 3 days |
| **Total** | **30** | **~7 days** |
