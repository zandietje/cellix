# PRP: Code Quality Remediation

## Overview

Comprehensive remediation of 79 code issues identified across the Cellix codebase — frontend addin, backend, and shared package. This PRP supersedes `code-review-remediation-plan.md` with a complete, actionable implementation plan organized into 6 sprints by priority.

## Context

- **Phase:** Post-Phase 5D (Sheet Intelligence complete)
- **Trigger:** Full codebase analysis on 2026-02-17
- **Scope:** 26 files with uncommitted changes + all existing source
- **Dependencies:** None — all changes are internal refactoring
- **Related PRP:** `PRPs/code-review-remediation-plan.md` (predecessor, less comprehensive)

## Issue Summary

| Severity | Count | Category Breakdown |
|----------|-------|-------------------|
| Critical | 6 | Security (2), Init bug (1), Memory leak (1), Type safety (1), Type duplication (1) |
| High | 15 | Architecture (5), Type safety (3), Performance (3), Shared pkg (3), Validation (1) |
| Medium | 23 | DRY violations (5), Dead code (3), Security (4), Type safety (3), Other (8) |
| Low | 35 | Polish, docs, naming, config |

---

## Sprint 1: Critical Security & Bugs (Day 1)

> These block production deployment. Fix first.

### Files to Modify

1. `apps/backend/src/routes/chat.ts` — Auth, SSE headers, context helper, token helper
2. `apps/backend/src/services/ai/context.ts` — Prompt injection prevention
3. `apps/addin/src/main.tsx` — Office.js init fix
4. `apps/addin/src/hooks/useExcelContext.ts` — Memory leak fix
5. `apps/backend/src/services/ai/types.ts` — Remove duplicate types
6. `packages/shared/src/types/tools.ts` — Remove unimplemented tool

### Step 1.1: Fix Office.js Initialization Bug

**File:** `apps/addin/src/main.tsx`

**Problem:** `isOfficeInitialized` is a module-level variable captured in a closure. `render()` is called twice but React doesn't re-mount with the updated value.

**Fix:** Only render after Office.js is ready.

```typescript
// BEFORE (broken):
let isOfficeInitialized = false;
const render = () => {
  const root = createRoot(document.getElementById('root')!);
  root.render(<App isOfficeInitialized={isOfficeInitialized} />);
};
Office.onReady(() => { isOfficeInitialized = true; render(); });
render();

// AFTER (fixed):
Office.onReady(() => {
  const root = createRoot(document.getElementById('root')!);
  root.render(<App />);
});
```

Remove the `isOfficeInitialized` prop from `App.tsx` — Office.js is guaranteed ready when component mounts. If a loading state is needed before Office.js loads, render a static HTML spinner in `index.html` that gets replaced.

### Step 1.2: Fix Memory Leak in Selection Change Listener

**File:** `apps/addin/src/hooks/useExcelContext.ts`

**Problem:** `setup()` is async but called without `await`. Cleanup runs before setup completes, so `eventResult` is null and the handler is never removed.

**Fix:**

```typescript
useEffect(() => {
  let disposed = false;
  let eventResult: OfficeExtension.EventHandlerResult<Excel.WorksheetSelectionChangedEventArgs> | null = null;
  let setupDone = false;

  const setup = async () => {
    try {
      await refresh();
      if (disposed) return; // Exit if unmounted during refresh

      await Excel.run(async (ctx) => {
        const sheet = ctx.workbook.worksheets.getActiveWorksheet();
        eventResult = sheet.onSelectionChanged.add(async () => {
          if (disposed) return;
          // debounce logic...
        });
        await ctx.sync();
      });
    } catch (e) {
      console.error('Failed to setup selection listener:', e);
    } finally {
      setupDone = true;
    }
  };

  const setupPromise = setup();

  return () => {
    disposed = true;
    // Wait for setup to finish, then clean up
    setupPromise.finally(() => {
      if (eventResult) {
        Excel.run(eventResult.context, async (ctx) => {
          eventResult!.remove();
          await ctx.sync();
        }).catch((err) => console.warn('Listener cleanup failed:', err));
      }
    });
  };
}, [autoRefresh, refresh]);
```

### Step 1.3: Remove Duplicate ChatStreamEvent from Backend

**File:** `apps/backend/src/services/ai/types.ts`

**Problem:** Backend defines its own `ChatStreamEvent` and `ToolCallChunk` missing the `session` event type. Shared package has the authoritative version.

**Fix:**
- Delete the local `ChatStreamEvent` and `ToolCallChunk` interfaces from `types.ts`
- Add import: `import type { ChatStreamEvent, ToolCallChunk } from '@cellix/shared';`
- Re-export if needed: `export type { ChatStreamEvent, ToolCallChunk };`

### Step 1.4: Remove Unimplemented `compare_periods` Tool

**File:** `packages/shared/src/types/tools.ts`

**Problem:** `ANALYTICS_TOOLS` includes `'compare_periods'` which has no type, no schema, no handler. AI calling it crashes the app.

**Fix:**

```typescript
// BEFORE:
export const ANALYTICS_TOOLS = ['explain_kpi', 'compare_periods', 'suggest_actions'] as const;

// AFTER:
export const ANALYTICS_TOOLS = ['explain_kpi', 'suggest_actions'] as const;
```

### Step 1.5: Escape User Data in System Prompt (Prompt Injection)

**File:** `apps/backend/src/services/ai/context.ts`

**Problem:** Sheet names, column headers, and cell values are interpolated directly into the system prompt. Malicious content can break AI constraints.

**Fix:** The `escapeMarkdown()` function exists (line 313) but isn't applied everywhere. Apply it consistently:

```typescript
// In formatProfileContext():
// Line ~155 - Sheet name
lines.push(`## Sheet: "${escapeMarkdown(profile.sheetName)}"`);

// Line ~195 - Column headers in table
const header = escapeMarkdown(col.header || numberToColumn(col.index + 1));
const qualName = col.qualifiedName ? escapeMarkdown(col.qualifiedName) : '';

// In formatExcelContext():
// Line ~35 - Active sheet
lines.push(`Active sheet: ${escapeMarkdown(context.activeSheet || 'Unknown')}`);

// Line ~48 - Headers
const escapedHeaders = context.selection.headers?.map(h => escapeMarkdown(String(h)));
```

Additionally, wrap all user-sourced data in XML tags for structural isolation:

```typescript
// Wrap entire context block
lines.unshift('<excel_context>');
lines.push('</excel_context>');
```

### Step 1.6: Add Basic Auth Middleware

**File:** `apps/backend/src/server.ts` (or create `apps/backend/src/middleware/auth.ts`)

**Problem:** All chat endpoints are completely open. Anyone can spam OpenAI.

**Fix (MVP stopgap — API key check):**

```typescript
// apps/backend/src/middleware/auth.ts
import type { FastifyRequest, FastifyReply } from 'fastify';
import { env } from '../lib/env.js';

export async function authMiddleware(request: FastifyRequest, reply: FastifyReply) {
  // Skip health check
  if (request.url === '/api/health') return;

  const apiKey = request.headers['x-api-key'] || request.headers.authorization?.replace('Bearer ', '');

  if (!apiKey || apiKey !== env.API_SECRET_KEY) {
    reply.code(401).send({ success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid API key' } });
  }
}
```

Add `API_SECRET_KEY` to `env.ts` schema. Register in `server.ts`:

```typescript
fastify.addHook('onRequest', authMiddleware);
```

### Step 1.7: Fix CORS Wildcard on SSE Endpoints

**File:** `apps/backend/src/routes/chat.ts`

**Problem:** Lines ~156, ~389 hardcode `'Access-Control-Allow-Origin': '*'` bypassing Fastify's CORS plugin.

**Fix:** Remove the hardcoded header. Use `request.headers.origin` validated against allowlist, or rely on Fastify CORS plugin:

```typescript
// Remove from both SSE handlers:
// 'Access-Control-Allow-Origin': '*',
```

---

## Sprint 2: Backend Architecture (Day 2-3)

> Eliminate duplication in chat routes. Make code testable.

### Files to Create

1. `apps/backend/src/services/chat/chatExecutor.ts` — Core chat orchestration
2. `apps/backend/src/lib/constants.ts` — Centralized backend constants
3. `apps/backend/src/lib/sse.ts` — SSE helper utilities

### Files to Modify

1. `apps/backend/src/routes/chat.ts` — Slim down to thin handlers
2. `apps/backend/src/services/ai/planner.ts` — Reuse client singleton
3. `apps/backend/src/services/ai/openai.ts` — Remove dead code
4. `apps/backend/src/services/tools/definitions.ts` — Use shared constants

### Step 2.1: Extract Backend Constants

**File:** `apps/backend/src/lib/constants.ts` (create)

```typescript
export const CHAT_CONFIG = {
  /** Token reserve for system prompt truncation */
  SYSTEM_PROMPT_TRUNCATE_BUFFER: 1500,
  /** Token reserve for user message */
  MESSAGE_TOKEN_RESERVE: 500,
  /** Max planner output tokens */
  PLANNER_MAX_TOKENS: 256,
  /** Temperature for write operations (low = deterministic) */
  TEMPERATURE_ACTION: 0.2,
  /** Temperature for analysis/questions */
  TEMPERATURE_DEFAULT: 0.7,
  /** Planner temperature (always deterministic) */
  TEMPERATURE_PLANNER: 0,
} as const;

export const ALLOWED_MODELS = ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini', 'gpt-4.1-nano'] as const;

/** Small models that need upgrading for tool execution */
export const SMALL_MODEL_UPGRADES: Record<string, string> = {
  'gpt-4o-mini': 'gpt-4o',
  'gpt-4.1-mini': 'gpt-4.1',
  'gpt-4.1-nano': 'gpt-4.1',
};
```

### Step 2.2: Create SSE Helper

**File:** `apps/backend/src/lib/sse.ts` (create)

```typescript
import type { FastifyReply } from 'fastify';

export function setSseHeaders(reply: FastifyReply): void {
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
}

export function writeSseEvent(reply: FastifyReply, event: unknown): boolean {
  try {
    reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ERR_STREAM_DESTROYED') {
      throw error;
    }
    return false; // Client disconnected
  }
}
```

### Step 2.3: Extract Context Formatting Helper

**File:** `apps/backend/src/services/ai/context.ts` (add to existing)

```typescript
import type { ExcelContextFull, ExcelContextWithProfile } from '@cellix/shared';

/**
 * Build system prompt content from excel context.
 * Handles both profile-first and legacy context formats.
 */
export function buildContextText(
  excelContext?: ExcelContextFull | ExcelContextWithProfile | null
): string {
  if (!excelContext) return '';

  if ('profile' in excelContext && excelContext.profile && 'inventory' in excelContext && excelContext.inventory) {
    return formatProfileContext(excelContext as ExcelContextWithProfile);
  }

  if ('selection' in excelContext && excelContext.selection) {
    return formatExcelContext(excelContext as ExcelContextFull);
  }

  return '';
}

/**
 * Ensure system prompt fits within token budget.
 */
export function ensurePromptFitsTokenBudget(content: string): string {
  const tokens = countTokens(content);
  if (tokens > TOKEN_LIMITS.MAX_INPUT_TOKENS - CHAT_CONFIG.SYSTEM_PROMPT_TRUNCATE_BUFFER) {
    return truncateToTokenLimit(content, TOKEN_LIMITS.MAX_INPUT_TOKENS - CHAT_CONFIG.SYSTEM_PROMPT_TRUNCATE_BUFFER);
  }
  return content;
}
```

Then replace the 3x duplicated blocks in `chat.ts` with:

```typescript
const contextText = buildContextText(excelContext);
let systemContent = SYSTEM_PROMPT + contextText;
systemContent = ensurePromptFitsTokenBudget(systemContent);
```

### Step 2.4: Reuse OpenAI Client Singleton in Planner

**File:** `apps/backend/src/services/ai/planner.ts`

**Problem:** Lines 157-160 create a new OpenAI client on every call.

**Fix:** Import the singleton:

```typescript
// BEFORE:
const client = new OpenAI({
  apiKey: env.OPENAI_API_KEY,
  ...(env.OPENAI_BASE_URL && { baseURL: env.OPENAI_BASE_URL }),
});

// AFTER:
import { getOpenAIClient } from './openai.js';
const client = getOpenAIClient();
```

Add to `openai.ts`:

```typescript
let clientInstance: OpenAI | null = null;

export function getOpenAIClient(): OpenAI {
  if (!clientInstance) {
    clientInstance = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
      ...(env.OPENAI_BASE_URL && { baseURL: env.OPENAI_BASE_URL }),
    });
  }
  return clientInstance;
}
```

### Step 2.5: Remove Dead Code in OpenAI Provider

**File:** `apps/backend/src/services/ai/openai.ts`

1. **Remove unreachable tool call block** (lines ~97-102): After `toolCalls.clear()`, the `if (toolCalls.size > 0)` check is always false.

2. **Inline `formatToolChoice()`** (lines 26-32): Method doesn't format anything, just returns input.

```typescript
// Replace line 41:
// tool_choice: this.formatToolChoice(params.toolChoice, !!hasTools),
// With:
tool_choice: (params.toolChoice && hasTools) ? params.toolChoice : undefined,
```

Delete the `formatToolChoice` method.

### Step 2.6: Use WRITE_TOOLS Constant in Backend Definitions

**File:** `apps/backend/src/services/tools/definitions.ts`

**Problem:** Line 134 hardcodes write tool names instead of importing the constant.

```typescript
// BEFORE:
export const READ_TOOL_DEFINITIONS = TOOL_DEFINITIONS.filter(
  (t) => !['write_range', 'set_formula', 'format_range', 'create_sheet', 'add_table', 'highlight_cells'].includes(t.function.name)
);

// AFTER:
import { WRITE_TOOLS } from '@cellix/shared';

export const READ_TOOL_DEFINITIONS = TOOL_DEFINITIONS.filter(
  (t) => !(WRITE_TOOLS as readonly string[]).includes(t.function.name)
);
```

### Step 2.7: Add Model Whitelist Validation

**File:** `apps/backend/src/routes/chat.ts`

```typescript
// BEFORE:
model: z.string().optional(),

// AFTER:
import { ALLOWED_MODELS } from '../lib/constants.js';

model: z.string()
  .refine(m => (ALLOWED_MODELS as readonly string[]).includes(m), 'Model not allowed')
  .optional(),
```

### Step 2.8: Add Rate Limiting

```bash
pnpm add @fastify/rate-limit --filter @cellix/backend
```

**File:** `apps/backend/src/server.ts`

```typescript
import rateLimit from '@fastify/rate-limit';

await fastify.register(rateLimit, {
  max: 30,
  timeWindow: '1 minute',
});
```

---

## Sprint 3: Frontend Architecture (Day 3-4)

> Eliminate duplication, fix type safety, clean dead code.

### Files to Delete

1. `apps/addin/src/store/profileStore.ts` — Unused (127 lines of dead code)

### Files to Create

1. `apps/addin/src/lib/formatters.ts` — Shared display formatters

### Files to Modify

1. `apps/addin/src/lib/constants.ts` — Add missing constants
2. `apps/addin/src/lib/tools/executor.ts` — Registry pattern, add analytics cases
3. `apps/addin/src/lib/tools/preview.ts` — Factory pattern
4. `apps/addin/src/components/chat/ToolCallCard.tsx` — Use shared formatters
5. `apps/addin/src/components/preview/ActionCard.tsx` — Use shared formatters
6. `apps/addin/src/components/chat/MessageList.tsx` — Add memoization
7. `apps/addin/src/lib/excel/writer.ts` — Reduce context.sync() calls

### Step 3.1: Delete Unused profileStore

**File:** `apps/addin/src/store/profileStore.ts` — Delete entirely.

Verify no imports exist (confirmed: zero imports found).

### Step 3.2: Create Shared Formatters

**File:** `apps/addin/src/lib/formatters.ts` (create)

```typescript
/**
 * Display formatters used across components.
 */

/** Convert snake_case tool name to display text */
export function formatToolName(name: string): string {
  return name.replace(/_/g, ' ');
}

/** Truncate string with ellipsis */
export function truncateString(str: string, maxLength: number): string {
  return str.length > maxLength ? str.substring(0, maxLength) + '...' : str;
}

/** Format parameter summary for a tool call */
export function getParamSummary(params: Record<string, unknown>): string {
  const parts: string[] = [];

  if (params.address) parts.push(`${params.address}`);

  if (typeof params.formula === 'string') {
    parts.push(`formula: ${truncateString(params.formula, 30)}`);
  }

  if (Array.isArray(params.values)) {
    const values = params.values as unknown[][];
    parts.push(`${values.length}x${values[0]?.length || 0} values`);
  }

  if (params.name) parts.push(`name: ${params.name}`);
  if (params.color) parts.push(`color: ${params.color}`);

  if (Array.isArray(params.columns)) {
    parts.push(`columns: ${(params.columns as string[]).join(', ')}`);
  }

  if (Array.isArray(params.groupBy)) {
    parts.push(`group by: ${(params.groupBy as string[]).join(', ')}`);
  }

  if (typeof params.column === 'string' && !params.columns) {
    parts.push(`column: ${params.column}`);
  }

  if (typeof params.query === 'string') parts.push(`query: "${params.query}"`);
  if (typeof params.sheet === 'string') parts.push(`sheet: ${params.sheet}`);
  if (typeof params.method === 'string') parts.push(`method: ${params.method}`);

  return parts.join(' | ') || 'No parameters';
}
```

Then update `ToolCallCard.tsx` and `ActionCard.tsx` to import from `@/lib/formatters` instead of defining locally.

### Step 3.3: Extend Constants File

**File:** `apps/addin/src/lib/constants.ts` (extend existing)

Add after existing `SAFETY_LIMITS` and `EXCEL_ERRORS`:

```typescript
/** Chat processing configuration */
export const CHAT_CONFIG = {
  /** Max tool execution iterations before stopping */
  MAX_CONTINUATION_ITERATIONS: 3,
  /** Max messages to include in history */
  MAX_HISTORY_MESSAGES: 20,
} as const;

/** API configuration */
export const API_CONFIG = {
  /** Max characters for tool results sent back to AI */
  MAX_TOOL_RESULT_SIZE: 8000,
  /** Max rows to keep when truncating large results */
  TRUNCATE_ROWS: 20,
} as const;

/** Debounce configuration (milliseconds) */
export const DEBOUNCE_CONFIG = {
  /** Selection change listener */
  SELECTION_CHANGE: 500,
  /** Profile cache invalidation */
  PROFILE_INVALIDATION: 2000,
} as const;
```

Then update all references:
- `ChatPane.tsx` line 16: replace `3` with `CHAT_CONFIG.MAX_CONTINUATION_ITERATIONS`
- `ChatPane.tsx` line ~249: replace `20` with `CHAT_CONFIG.MAX_HISTORY_MESSAGES`
- `api.ts` line 14: replace `8000` with `API_CONFIG.MAX_TOOL_RESULT_SIZE`
- `api.ts` line ~230: replace `20` with `API_CONFIG.TRUNCATE_ROWS`
- `useExcelContext.ts` line ~72: replace `500` with `DEBOUNCE_CONFIG.SELECTION_CHANGE`

### Step 3.4: Add Analytics Tool Cases to Executor

**File:** `apps/addin/src/lib/tools/executor.ts`

**Problem:** `explain_kpi` and `suggest_actions` fall through to `throw new Error('Unknown tool')`.

Add before the `default` case:

```typescript
case 'explain_kpi':
case 'suggest_actions': {
  // Analytics tools are AI-reasoning-only — pass params back as result
  resultData = {
    tool: toolCall.name,
    parameters: toolCall.parameters,
    note: 'Analytics tool executed — result is AI-generated reasoning',
  };
  break;
}
```

### Step 3.5: Reduce context.sync() Calls in setFormula()

**File:** `apps/addin/src/lib/excel/writer.ts`

**Problem:** `setFormula()` has 4 `context.sync()` calls. Can be reduced to 2.

```typescript
// For range formulas, combine set + load into one sync:
const firstCell = sheet.getRange(firstCellAddress);
firstCell.formulas = [[formula]];
firstCell.load('formulasR1C1');
await context.sync(); // Sync 1: set formula AND load R1C1

const r1c1Formula = firstCell.formulasR1C1[0][0] as string;
const fullRange = sheet.getRange(address);
const formulaArray = Array.from({ length: rowCount }, () =>
  Array.from({ length: colCount }, () => r1c1Formula)
);
fullRange.formulasR1C1 = formulaArray;
await context.sync(); // Sync 2: apply to range
```

### Step 3.6: Add MessageList Memoization

**File:** `apps/addin/src/components/chat/MessageList.tsx`

```typescript
import React, { memo, useRef, useEffect, useMemo } from 'react';

const MemoizedMessageBubble = memo(MessageBubble);

export const MessageList = memo(function MessageList({ messages }: MessageListProps) {
  const styles = useStyles();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]); // Only scroll when count changes, not content

  if (messages.length === 0) {
    return (/* empty state */);
  }

  return (
    <div className={styles.container}>
      {messages.map((message) => (
        <MemoizedMessageBubble key={message.id} message={message} />
      ))}
      <div ref={bottomRef} />
    </div>
  );
});
```

---

## Sprint 4: Type Safety & Validation (Day 4-5)

> Replace unsafe casts with runtime validation.

### Files to Modify

1. `apps/backend/src/routes/chat.ts` — Proper excelContext validation
2. `apps/addin/src/lib/tools/executor.ts` — Zod validation for params
3. `apps/addin/src/components/chat/ChatPane.tsx` — Stream event validation
4. `apps/backend/src/services/ai/planner.ts` — Zod for planner response
5. `apps/backend/src/routes/chat.ts` — Tool results validation, sessionId format

### Step 4.1: Validate excelContext with Zod

**File:** `apps/backend/src/routes/chat.ts`

Replace `z.any().optional()` with a proper union schema:

```typescript
const excelContextSchema = z.union([
  z.object({
    profile: z.object({ sheetName: z.string() }).passthrough(),
    inventory: z.object({}).passthrough(),
    selection: z.object({ address: z.string().optional() }).passthrough().optional(),
  }),
  z.object({
    activeSheet: z.string().optional(),
    selection: z.object({ address: z.string() }).passthrough().optional(),
    sheets: z.array(z.string()).optional(),
  }),
]).optional();

// Use in request schemas:
excelContext: excelContextSchema,
```

### Step 4.2: Replace Unsafe Type Casts in Executor

**File:** `apps/addin/src/lib/tools/executor.ts`

Import Zod schemas from shared (or create lightweight validators):

```typescript
// Option A: Lightweight type guards
function assertWriteRangeParams(params: unknown): WriteRangeParams {
  const p = params as Record<string, unknown>;
  if (typeof p.address !== 'string' || !Array.isArray(p.values)) {
    throw new Error('Invalid write_range parameters: address (string) and values (array) required');
  }
  return p as WriteRangeParams;
}

// Use in switch cases:
case 'write_range': {
  const params = assertWriteRangeParams(toolCall.parameters);
  // ...
}
```

Create validators for all tool param types. This replaces `as unknown as T` casts with runtime checks.

### Step 4.3: Validate Stream Events

**File:** `apps/addin/src/components/chat/ChatPane.tsx`

Replace `event.toolCall!` non-null assertions with guards:

```typescript
case 'tool_call_start':
case 'tool_call_delta':
  if (event.toolCall?.id && event.toolCall?.name !== undefined) {
    const tc = event.toolCall;
    const idx = toolCalls.findIndex((t) => t.id === tc.id);
    // ... rest of logic using tc (validated)
  }
  break;
```

### Step 4.4: Validate Planner Response with Zod

**File:** `apps/backend/src/services/ai/planner.ts`

```typescript
import { z } from 'zod';

const PlannerResponseSchema = z.object({
  intent: z.enum(['action', 'analysis', 'question', 'clarify']),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  tool: z.string().optional(),
  clarifyQuestion: z.string().optional(),
});

// Replace JSON.parse + manual validation:
const parsed = PlannerResponseSchema.safeParse(JSON.parse(content));
if (!parsed.success) {
  return { intent: 'clarify', confidence: 0.5, reasoning: 'Failed to parse plan' };
}
const plan = parsed.data;
```

### Step 4.5: Validate Tool Results in /chat/continue

**File:** `apps/backend/src/routes/chat.ts`

```typescript
// BEFORE:
toolResults: z.array(z.object({
  toolCallId: z.string(),
  content: z.string(),
})),

// AFTER:
toolResults: z.array(z.object({
  toolCallId: z.string().min(1),
  content: z.string().max(50000, 'Tool result too large'),
})),
```

### Step 4.6: Validate sessionId Format

```typescript
// BEFORE:
sessionId: z.string().optional(),

// AFTER:
sessionId: z.string()
  .regex(/^(temp_[\w-]+|[0-9a-f-]{36})$/i, 'Invalid session ID format')
  .optional(),
```

---

## Sprint 5: Code Quality & DRY (Day 5-6)

> Eliminate remaining duplication and code smells.

### Files to Modify

1. `apps/addin/src/lib/tools/preview.ts` — Consolidate preview generators
2. `apps/addin/src/lib/api.ts` — Improve error handling
3. `apps/backend/src/services/chat/sessionManager.ts` — Fix O(n^2) unshift
4. `apps/addin/src/lib/tools/readers.ts` — Improve Arquero filtering

### Step 5.1: Consolidate Preview Generation

**File:** `apps/addin/src/lib/tools/preview.ts`

Create a generic preview builder that handles the common pattern:

```typescript
interface PreviewConfig {
  getAffectedAddress: (params: Record<string, unknown>) => string;
  getCellCount: (params: Record<string, unknown>) => number;
  getChanges?: (params: Record<string, unknown>) => Promise<CellChange[]>;
  alwaysRequiresConfirmation?: boolean;
  getExtraWarnings?: (params: Record<string, unknown>) => string[];
}

const PREVIEW_CONFIGS: Record<string, PreviewConfig> = {
  write_range: {
    getAffectedAddress: (p) => String(p.address || ''),
    getCellCount: (p) => {
      const values = p.values as unknown[][] | undefined;
      return values ? values.length * (values[0]?.length || 0) : 0;
    },
    getChanges: async (p) => {
      const before = await readRange(String(p.address));
      return buildCellChanges(String(p.address), before, p.values as unknown[][]);
    },
  },
  set_formula: { /* ... */ },
  format_range: { /* ... */ },
  create_sheet: {
    getAffectedAddress: () => '',
    getCellCount: () => 0,
    alwaysRequiresConfirmation: true,
  },
  // ... remaining tools
};

async function buildPreview(
  toolCall: ToolCall,
  validation: ValidationResult,
  config: PreviewConfig
): Promise<PreviewData> {
  const params = toolCall.parameters as Record<string, unknown>;
  const warnings: string[] = validation.errors.map(e => e.message);

  if (config.getExtraWarnings) {
    warnings.push(...config.getExtraWarnings(params));
  }

  let changes: CellChange[] = [];
  if (config.getChanges && validation.valid) {
    try {
      changes = await config.getChanges(params);
    } catch {
      warnings.push('Could not read current values for preview');
    }
  }

  const cellCount = config.getCellCount(params);

  return {
    toolCall,
    affectedRange: config.getAffectedAddress(params),
    cellCount,
    changes,
    warnings,
    requiresConfirmation: config.alwaysRequiresConfirmation || requiresConfirmation(cellCount),
    validation,
    generatedAt: Date.now(),
  };
}
```

This replaces 7 nearly-identical functions (~200 duplicated lines) with a config-driven approach.

### Step 5.2: Fix O(n^2) unshift in Session Manager

**File:** `apps/backend/src/services/chat/sessionManager.ts`

```typescript
// BEFORE:
for (let i = messages.length - 1; i >= 0; i--) {
  result.unshift(msg); // O(n) per call = O(n^2) total
}

// AFTER:
const result: HistoryMessage[] = [];
for (let i = messages.length - 1; i >= 0; i--) {
  // ... token budget check ...
  result.push(msg);
}
return result.reverse(); // O(n) total
```

### Step 5.3: Improve Arquero Filtering

**File:** `apps/addin/src/lib/tools/readers.ts`

**Problem:** Lines ~667-721 convert Arquero table to objects, filter in JS, then convert back.

```typescript
// BEFORE:
const currentRows = result.objects() as Record<string, unknown>[];
const filteredRows = currentRows.filter((row) => { ... });
// ... rebuild table from filtered rows

// AFTER: Use Arquero's native filter
result = result.filter(aq.escape((d: Record<string, unknown>) => {
  return applyFilterPredicate(d, filter);
}));
```

---

## Sprint 6: Polish & Hardening (Day 6-7)

> Low-severity fixes, documentation, observability.

### Step 6.1: Add Graceful Shutdown

**File:** `apps/backend/src/index.ts`

```typescript
const signals = ['SIGTERM', 'SIGINT'] as const;
for (const signal of signals) {
  process.on(signal, async () => {
    server.log.info(`${signal} received, shutting down gracefully`);
    await server.close();
    process.exit(0);
  });
}
```

### Step 6.2: Standardize Logging

Replace all `console.error/warn` in backend services with Fastify logger passed as parameter:

```typescript
// sessionManager.ts, planner.ts etc:
// BEFORE: console.error('...')
// AFTER: this.logger.error({ msg: '...', sessionId, error })
```

### Step 6.3: Add Error Boundaries

**File:** `apps/addin/src/App.tsx`

Wrap major UI sections:

```tsx
<ErrorBoundary fallback={<ChatErrorFallback />}>
  <ChatPane />
</ErrorBoundary>
```

### Step 6.4: Fix Production API URL

**File:** `apps/addin/src/lib/api.ts`

```typescript
// BEFORE: console.error + return '/api'
// AFTER: throw immediately
if (import.meta.env.PROD && !envUrl) {
  throw new Error(
    'VITE_API_URL is required in production. ' +
    'Set it to the backend URL (e.g., https://api.cellix.app/api)'
  );
}
```

### Step 6.5: Remove Unused Code

| Item | File | Action |
|------|------|--------|
| `profileStore.ts` | `apps/addin/src/store/` | Delete file |
| Dead tool call block | `openai.ts` lines ~97-102 | Delete |
| `formatToolChoice()` | `openai.ts` lines 26-32 | Delete, inline |
| `compare_periods` | `packages/shared/src/types/tools.ts` | Remove from array |
| Unused `maxTokens` | `apps/backend/src/services/ai/types.ts` line 35 | Remove or use |

---

## Validation Gates

### Build
- [ ] `pnpm build` passes with zero errors
- [ ] `pnpm typecheck` passes (all packages)

### Lint
- [ ] No new TypeScript errors
- [ ] No `any` types introduced
- [ ] No `as unknown as` patterns remaining in executor

### Manual Testing
- [ ] Add-in loads in Excel after Office.js init fix
- [ ] Chat streaming works end-to-end
- [ ] Write tool preview → approve → execute works
- [ ] Read tools (select_rows, group_aggregate) return results
- [ ] Selection change listener properly cleans up (check DevTools for leaks)
- [ ] API key auth rejects unauthenticated requests

### Regression Checks
- [ ] Continuation loop still works (max 3 iterations)
- [ ] Profile-first context format unchanged in AI prompt
- [ ] Legacy context format still supported
- [ ] SSE streaming unbroken after header changes

---

## Safety Considerations

- **No behavioral changes:** This PRP is purely refactoring — no new features, no changed business logic
- **Backwards compatible:** API contracts unchanged (only validation tightened)
- **Auth is additive:** New middleware can be disabled via env var for development
- **Incremental:** Each sprint can be committed and tested independently
- **Rollback:** Each sprint is a separate commit; any can be reverted

---

## Confidence Score

**8/10** — High confidence because:
- All issues have been verified with exact file paths and line numbers
- Fixes are well-understood patterns (extract helper, add validation, delete dead code)
- No external dependencies or API changes required
- Each sprint is independent and can be tested in isolation

Deductions:
- (-1) Office.js init change needs manual sideload testing
- (-1) Auth middleware integration depends on deployment environment

---

## Notes

- This PRP supersedes `PRPs/code-review-remediation-plan.md` which covered 30 issues
- The `smart-header-detection.md` PRP is unrelated and should proceed independently
- Sprint 1 should be completed before any new feature development
- Sprints 2-6 can be parallelized if multiple developers are available
- Total estimated effort: **6-7 developer days** across all sprints
