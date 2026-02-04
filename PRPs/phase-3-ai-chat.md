# PRP: Cellix Phase 3 - AI Chat Integration

## Overview

Implement AI chat service with OpenAI integration, tool schemas, and streaming responses. The chat will understand Excel context and return structured tool calls for Phase 4 execution.

## Context

- **Phase:** 3 (AI Chat Integration)
- **Timeline:** Week 3 of MVP
- **Dependencies:** Phase 1 (Foundation), Phase 2 (Excel Integration)
- **Related Files:**
  - `CLAUDE.md` - Project context and rules
  - `FEATURE_PLAN.md` - Detailed specifications
  - `INITIAL.md` - Phase 3 feature brief
  - `.claude/examples/backend/FastifyRoute.ts` - Route patterns

## Documentation References

- [OpenAI Node.js SDK](https://github.com/openai/openai-node) - Official OpenAI SDK
- [OpenAI Function Calling](https://platform.openai.com/docs/guides/function-calling) - Tool/function calling guide
- [OpenAI Streaming](https://platform.openai.com/docs/api-reference/streaming) - Streaming responses
- [Zod to JSON Schema](https://github.com/StefanTerdell/zod-to-json-schema) - Schema conversion
- [Fastify SSE](https://github.com/fastify/fastify/issues/1352) - SSE with raw response

## Research Findings

### Existing Patterns (from Phase 1-2 codebase)

1. **Fastify Route Pattern** (`apps/backend/src/routes/health.ts`)
   - Async route handlers
   - Type-safe request/reply
   - Error handling in global handler

2. **Environment Config** (`apps/backend/src/lib/env.ts`)
   - Zod schema for env validation
   - Type-safe env access

3. **Shared Types** (`packages/shared/src/types/chat.ts`)
   - ChatMessage, ToolCall interfaces already defined
   - ChatStreamChunk type exists

### OpenAI SDK Best Practices

1. **Streaming with Tool Calls**
   - Tool calls come in chunks with `index` for accumulation
   - Must accumulate `function.arguments` string across chunks
   - `finish_reason: 'tool_calls'` indicates tool call complete

2. **Error Handling**
   - `OpenAI.APIError` for API errors
   - Status codes: 429 (rate limit), 400 (bad request), 401 (auth)
   - Implement exponential backoff for rate limits

3. **Token Management**
   - Use `gpt-tokenizer` (faster than tiktoken in Node.js)
   - Count tokens before sending to avoid truncation

## Implementation Plan

### Files to Create

```
apps/backend/src/
├── services/
│   ├── ai/
│   │   ├── index.ts              # Provider factory
│   │   ├── types.ts              # AIProvider interface
│   │   ├── openai.ts             # OpenAI implementation
│   │   ├── prompt.ts             # System prompt
│   │   └── context.ts            # Excel context formatting
│   └── tools/
│       ├── index.ts              # Tool exports
│       ├── schemas.ts            # Zod schemas for tools
│       └── definitions.ts        # OpenAI tool definitions
├── routes/
│   └── chat.ts                   # Chat endpoint with SSE
└── lib/
    └── tokens.ts                 # Token counting utilities
```

### Files to Modify

1. `apps/backend/src/lib/env.ts` - Add OPENAI_API_KEY
2. `apps/backend/src/index.ts` - Register chat routes
3. `apps/backend/package.json` - Add openai, zod-to-json-schema dependencies
4. `apps/addin/src/components/chat/ChatPane.tsx` - Use backend API
5. `apps/addin/src/lib/api.ts` - Add chat API with SSE handling

### Implementation Steps

#### Step 1: Add Dependencies

```bash
# Backend
cd apps/backend
pnpm add openai zod-to-json-schema gpt-tokenizer
```

#### Step 2: Update Environment Config

```typescript
// apps/backend/src/lib/env.ts
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform(Number).default('3001'),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  // OpenAI
  OPENAI_API_KEY: z.string().min(1, 'OPENAI_API_KEY is required'),
  OPENAI_MODEL: z.string().default('gpt-4o'),
});

export const env = envSchema.parse(process.env);
```

#### Step 3: Create AI Provider Types

```typescript
// apps/backend/src/services/ai/types.ts
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

export type Message = ChatCompletionMessageParam;

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ChatParams {
  messages: Message[];
  tools?: ToolDefinition[];
  maxTokens?: number;
  temperature?: number;
}

export interface ToolCallChunk {
  id: string;
  name: string;
  arguments: string;
}

export interface ChatStreamEvent {
  type: 'text' | 'tool_call_start' | 'tool_call_delta' | 'tool_call_end' | 'done' | 'error';
  content?: string;
  toolCall?: ToolCallChunk;
  error?: string;
}

export interface AIProvider {
  chat(params: ChatParams): AsyncIterable<ChatStreamEvent>;
  countTokens(text: string): number;
  readonly name: string;
}
```

#### Step 4: Create OpenAI Provider

```typescript
// apps/backend/src/services/ai/openai.ts
import OpenAI from 'openai';
import { encode } from 'gpt-tokenizer';
import { env } from '../../lib/env.js';
import type { AIProvider, ChatParams, ChatStreamEvent, ToolCallChunk } from './types.js';

export class OpenAIProvider implements AIProvider {
  private client: OpenAI;
  readonly name = 'openai';

  constructor() {
    this.client = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
    });
  }

  async *chat(params: ChatParams): AsyncIterable<ChatStreamEvent> {
    try {
      const stream = await this.client.chat.completions.create({
        model: env.OPENAI_MODEL,
        messages: params.messages,
        tools: params.tools,
        max_tokens: params.maxTokens ?? 4096,
        temperature: params.temperature ?? 0.7,
        stream: true,
      });

      // Accumulate tool calls across chunks
      const toolCalls = new Map<number, ToolCallChunk>();

      for await (const chunk of stream) {
        const choice = chunk.choices[0];
        if (!choice) continue;

        const delta = choice.delta;

        // Text content
        if (delta.content) {
          yield { type: 'text', content: delta.content };
        }

        // Tool calls
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const existing = toolCalls.get(tc.index);

            if (!existing) {
              // New tool call
              const newCall: ToolCallChunk = {
                id: tc.id || '',
                name: tc.function?.name || '',
                arguments: tc.function?.arguments || '',
              };
              toolCalls.set(tc.index, newCall);
              yield { type: 'tool_call_start', toolCall: newCall };
            } else {
              // Accumulate arguments
              if (tc.function?.arguments) {
                existing.arguments += tc.function.arguments;
                yield { type: 'tool_call_delta', toolCall: existing };
              }
            }
          }
        }

        // Check for finish
        if (choice.finish_reason === 'tool_calls') {
          // Emit completed tool calls
          for (const tc of toolCalls.values()) {
            yield { type: 'tool_call_end', toolCall: tc };
          }
        }
      }

      yield { type: 'done' };
    } catch (error) {
      if (error instanceof OpenAI.APIError) {
        yield {
          type: 'error',
          error: `OpenAI API error: ${error.message} (${error.status})`,
        };
      } else {
        yield {
          type: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }
  }

  countTokens(text: string): number {
    return encode(text).length;
  }
}
```

#### Step 5: Create System Prompt

```typescript
// apps/backend/src/services/ai/prompt.ts
export const SYSTEM_PROMPT = `You are Cellix, an AI assistant specialized in Shopee and Lazada ecommerce analytics for Excel.

## Your Capabilities
- Read and analyze Excel data (selections, sheets, tables)
- Write data, formulas, and formatting to Excel (with user preview first)
- Explain ecommerce KPIs and metrics
- Provide actionable insights from data

## Ecommerce Knowledge

### Key Performance Indicators (KPIs)
- **ROAS** (Return on Ad Spend): Revenue / Ad Spend. Target: >4.0 for healthy campaigns
- **CTR** (Click-Through Rate): Clicks / Impressions × 100. Benchmark: 1-3%
- **CVR** (Conversion Rate): Orders / Sessions × 100. Good: >2%
- **AOV** (Average Order Value): Total Revenue / Number of Orders
- **GMV** (Gross Merchandise Value): Total value of goods sold
- **CAC** (Customer Acquisition Cost): Marketing Spend / New Customers
- **Profit Margin**: (Revenue - COGS - Fees) / Revenue

### Platform-Specific Metrics

#### Shopee
- Commission: 2-6% depending on category
- Transaction fee: ~2%
- Shipping fee subsidy programs
- Flash sale metrics (units sold, conversion rate)
- Voucher redemption rate
- Chat response rate

#### Lazada
- Commission: 1-4% depending on category
- Payment fee: ~2%
- Sponsored Discovery vs Search ads performance
- LazMall vs regular seller differences
- Flexi Combo metrics

### Common Excel Formulas for Ecommerce
- ROAS: =Revenue/AdSpend
- CVR: =Orders/Sessions*100
- AOV: =Revenue/Orders
- Profit Margin: =(Revenue-COGS-Fees)/Revenue
- YoY Growth: =(Current-Previous)/Previous*100
- Break-even ROAS: =1/ProfitMargin

## Tool Usage Guidelines
1. **Always explain WHY** you're suggesting a change before using a tool
2. For write operations, be specific about the target range
3. Use formulas when values should update automatically
4. Highlight cells to draw attention to important data
5. Keep tool calls focused - one clear action per tool call

## Response Style
- Be concise and actionable
- Use bullet points for lists
- Include specific numbers when analyzing data
- Suggest logical next steps
- If you don't have enough context, ask clarifying questions

## Important Notes
- All write operations will show a preview to the user before execution
- You cannot delete sheets or make workbook-level changes
- Maximum 500 cells per write operation
- Be careful with formulas - no external links or dangerous functions`;
```

#### Step 6: Create Excel Context Formatter

```typescript
// apps/backend/src/services/ai/context.ts
import type { ExcelContextFull } from '@cellix/shared';

/**
 * Formats Excel context for inclusion in the AI prompt.
 */
export function formatExcelContext(context: ExcelContextFull | undefined): string {
  if (!context) return '';

  const lines: string[] = [];

  lines.push('\n## Current Excel Context\n');

  // Selection info
  lines.push(`**Active Sheet:** ${context.activeSheet}`);
  lines.push(`**Selection:** ${context.selection.address}`);
  lines.push(`**Size:** ${context.selection.rowCount} rows × ${context.selection.columnCount} columns`);

  if (context.selection.sampled) {
    lines.push(`*(Data sampled to first ${context.selection.rowCount} rows)*`);
  }

  // Headers
  if (context.selection.headers.length > 0) {
    lines.push('\n**Headers:**');
    lines.push(context.selection.headers.join(' | '));
  }

  // Data types
  if (context.dataTypes.length > 0) {
    lines.push('\n**Column Types:**');
    for (const dt of context.dataTypes.slice(0, 10)) {
      lines.push(`- ${dt.header}: ${dt.type}`);
    }
  }

  // Stats
  if (context.stats.numericColumns.length > 0) {
    lines.push('\n**Numeric Summary:**');
    for (const col of context.stats.numericColumns.slice(0, 5)) {
      lines.push(`- ${col.header}: Sum=${formatNum(col.sum)}, Avg=${formatNum(col.avg)}, Min=${formatNum(col.min)}, Max=${formatNum(col.max)}`);
    }
  }

  // Sample data (first 10 rows for AI context)
  if (context.selection.values.length > 1) {
    lines.push('\n**Sample Data (first 10 rows):**');
    lines.push('```');
    const sample = context.selection.values.slice(0, 10);
    for (const row of sample) {
      lines.push(row.map(cell => String(cell ?? '')).join('\t'));
    }
    lines.push('```');
  }

  // Tables
  if (context.tables.length > 0) {
    lines.push('\n**Tables:**');
    for (const table of context.tables) {
      lines.push(`- ${table.name}: ${table.address} (${table.rowCount} rows)`);
    }
  }

  // All sheets
  if (context.allSheets.length > 1) {
    lines.push(`\n**All Sheets:** ${context.allSheets.join(', ')}`);
  }

  return lines.join('\n');
}

function formatNum(n: number): string {
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return Number.isInteger(n) ? n.toString() : n.toFixed(2);
}
```

#### Step 7: Create Tool Schemas

```typescript
// apps/backend/src/services/tools/schemas.ts
import { z } from 'zod';

// Excel Write Tools (require preview in Phase 4)
export const writeRangeSchema = z.object({
  address: z.string().describe('Target range in A1 notation (e.g., "A1:C10")'),
  values: z.array(z.array(z.unknown())).describe('2D array of values to write'),
  reason: z.string().describe('Brief explanation of why this write is needed'),
});

export const setFormulaSchema = z.object({
  address: z.string().describe('Target cell address (e.g., "D1")'),
  formula: z.string().describe('Excel formula starting with = (e.g., "=SUM(A1:A10)")'),
  reason: z.string().describe('Brief explanation of the formula purpose'),
});

export const formatRangeSchema = z.object({
  address: z.string().describe('Target range in A1 notation'),
  style: z.object({
    fillColor: z.string().optional().describe('Background color in hex (e.g., "#FFFF00")'),
    fontColor: z.string().optional().describe('Font color in hex'),
    bold: z.boolean().optional().describe('Make text bold'),
    italic: z.boolean().optional().describe('Make text italic'),
    numberFormat: z.string().optional().describe('Number format (e.g., "0.00%", "$#,##0")'),
  }).describe('Formatting options to apply'),
  reason: z.string().describe('Brief explanation of why this formatting is needed'),
});

export const createSheetSchema = z.object({
  name: z.string().max(31).describe('Name for the new worksheet'),
  reason: z.string().describe('Brief explanation of why this sheet is needed'),
});

export const addTableSchema = z.object({
  address: z.string().describe('Range to convert to table (e.g., "A1:D10")'),
  name: z.string().describe('Name for the table'),
  hasHeaders: z.boolean().default(true).describe('Whether first row contains headers'),
  reason: z.string().describe('Brief explanation of why this table is needed'),
});

export const highlightCellsSchema = z.object({
  address: z.string().describe('Range to highlight'),
  color: z.string().describe('Highlight color in hex (e.g., "#FFFF00" for yellow)'),
  reason: z.string().describe('Brief explanation of why highlighting these cells'),
});

// Excel Read Tools (no preview needed)
export const readRangeSchema = z.object({
  address: z.string().describe('Range to read in A1 notation'),
});

// Analytics Tools (reasoning only, no Excel modification)
export const explainKpiSchema = z.object({
  kpiName: z.string().describe('Name of the KPI to explain (e.g., "ROAS", "CVR")'),
  context: z.string().optional().describe('Additional context about the user\'s data'),
});

export const suggestActionsSchema = z.object({
  analysisContext: z.string().describe('Summary of the data analysis performed'),
});
```

#### Step 8: Create Tool Definitions

```typescript
// apps/backend/src/services/tools/definitions.ts
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { ToolDefinition } from '../ai/types.js';
import * as schemas from './schemas.js';

function createToolDef(
  name: string,
  description: string,
  schema: Parameters<typeof zodToJsonSchema>[0]
): ToolDefinition {
  return {
    type: 'function',
    function: {
      name,
      description,
      parameters: zodToJsonSchema(schema, { target: 'openAI' }),
    },
  };
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  // Excel Write Tools
  createToolDef(
    'write_range',
    'Write values to a range of cells. Shows preview before execution.',
    schemas.writeRangeSchema
  ),
  createToolDef(
    'set_formula',
    'Set an Excel formula in a cell. Shows preview before execution.',
    schemas.setFormulaSchema
  ),
  createToolDef(
    'format_range',
    'Apply formatting (colors, bold, number format) to a range. Shows preview before execution.',
    schemas.formatRangeSchema
  ),
  createToolDef(
    'create_sheet',
    'Create a new worksheet in the workbook.',
    schemas.createSheetSchema
  ),
  createToolDef(
    'add_table',
    'Convert a range to an Excel table with headers.',
    schemas.addTableSchema
  ),
  createToolDef(
    'highlight_cells',
    'Highlight cells with a background color to draw attention.',
    schemas.highlightCellsSchema
  ),

  // Excel Read Tools
  createToolDef(
    'read_range',
    'Read values from a specific range (useful when selection doesn\'t contain the data you need).',
    schemas.readRangeSchema
  ),

  // Analytics Tools
  createToolDef(
    'explain_kpi',
    'Explain an ecommerce KPI/metric and provide context for the user\'s data.',
    schemas.explainKpiSchema
  ),
  createToolDef(
    'suggest_actions',
    'Suggest actionable next steps based on data analysis.',
    schemas.suggestActionsSchema
  ),
];

export const TOOL_WHITELIST = new Set(TOOL_DEFINITIONS.map(t => t.function.name));
```

#### Step 9: Create AI Provider Factory

```typescript
// apps/backend/src/services/ai/index.ts
import { OpenAIProvider } from './openai.js';
import type { AIProvider } from './types.js';

export * from './types.js';
export { SYSTEM_PROMPT } from './prompt.js';
export { formatExcelContext } from './context.js';

let providerInstance: AIProvider | null = null;

export function getAIProvider(): AIProvider {
  if (!providerInstance) {
    providerInstance = new OpenAIProvider();
  }
  return providerInstance;
}
```

#### Step 10: Create Chat Route

```typescript
// apps/backend/src/routes/chat.ts
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { getAIProvider, SYSTEM_PROMPT, formatExcelContext } from '../services/ai/index.js';
import { TOOL_DEFINITIONS } from '../services/tools/definitions.js';
import type { ExcelContextFull } from '@cellix/shared';

const chatRequestSchema = z.object({
  message: z.string().min(1, 'Message is required'),
  sessionId: z.string().optional(),
  excelContext: z.any().optional(), // ExcelContextFull - validated loosely for flexibility
});

type ChatRequest = z.infer<typeof chatRequestSchema>;

export async function chatRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post<{ Body: ChatRequest }>(
    '/chat',
    async (request: FastifyRequest<{ Body: ChatRequest }>, reply: FastifyReply) => {
      // Validate request
      const parseResult = chatRequestSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: parseResult.error.errors[0]?.message || 'Invalid request',
          },
        });
      }

      const { message, excelContext } = parseResult.data;

      // Build messages
      const contextText = formatExcelContext(excelContext as ExcelContextFull | undefined);
      const systemContent = SYSTEM_PROMPT + contextText;

      const messages = [
        { role: 'system' as const, content: systemContent },
        { role: 'user' as const, content: message },
      ];

      // Set SSE headers
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no', // Disable nginx buffering
      });

      // Stream response
      const provider = getAIProvider();

      try {
        for await (const event of provider.chat({ messages, tools: TOOL_DEFINITIONS })) {
          reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        reply.raw.write(`data: ${JSON.stringify({ type: 'error', error: errorMessage })}\n\n`);
      }

      reply.raw.end();
    }
  );
}
```

#### Step 11: Register Chat Routes

```typescript
// apps/backend/src/index.ts - Update to register chat routes
import { buildServer } from './server.js';
import { healthRoutes } from './routes/health.js';
import { chatRoutes } from './routes/chat.js';
import { env } from './lib/env.js';

async function main() {
  const server = await buildServer();

  // Register routes
  await server.register(healthRoutes, { prefix: '/api' });
  await server.register(chatRoutes, { prefix: '/api' });

  // Start server
  try {
    await server.listen({ port: env.PORT, host: env.HOST });
    server.log.info(`Server running at http://${env.HOST}:${env.PORT}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

main();
```

#### Step 12: Update Add-in API Client

```typescript
// apps/addin/src/lib/api.ts - Add streaming chat function
import axios, { AxiosError } from 'axios';
import type { ApiResponse, ExcelContextFull, ChatStreamChunk } from '@cellix/shared';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://localhost:3001/api';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiResponse<unknown>>) => {
    const message = error.response?.data?.error?.message || 'Network error';
    console.error('API Error:', message);
    return Promise.reject(new Error(message));
  }
);

// Health check
export async function checkHealth(): Promise<boolean> {
  try {
    const response = await apiClient.get('/health');
    return response.data.status === 'ok';
  } catch {
    return false;
  }
}

/**
 * Sends a chat message and streams the response.
 */
export async function* streamChat(
  message: string,
  excelContext?: ExcelContextFull
): AsyncIterable<ChatStreamChunk> {
  const response = await fetch(`${API_BASE_URL}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message, excelContext }),
  });

  if (!response.ok) {
    throw new Error(`Chat request failed: ${response.statusText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('No response body');
  }

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Parse SSE events
    const lines = buffer.split('\n');
    buffer = lines.pop() || ''; // Keep incomplete line in buffer

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data) {
          try {
            const event = JSON.parse(data) as ChatStreamChunk;
            yield event;
          } catch {
            // Ignore parse errors
          }
        }
      }
    }
  }
}
```

#### Step 13: Update ChatPane to Use Backend

```typescript
// apps/addin/src/components/chat/ChatPane.tsx
import { makeStyles, tokens } from '@fluentui/react-components';
import { MessageList } from './MessageList';
import { InputBox } from './InputBox';
import { TypingIndicator } from './TypingIndicator';
import { useChatStore } from '../../store/chatStore';
import { useExcelStore } from '../../store/excelStore';
import { streamChat } from '../../lib/api';

const useStyles = makeStyles({
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    backgroundColor: tokens.colorNeutralBackground1,
  },
  messages: {
    flex: 1,
    overflow: 'auto',
    padding: tokens.spacingVerticalM,
  },
  input: {
    borderTop: `1px solid ${tokens.colorNeutralStroke1}`,
    padding: tokens.spacingVerticalS,
  },
});

export function ChatPane() {
  const styles = useStyles();
  const { messages, isTyping, addMessage, setTyping, updateLastAssistantMessage } = useChatStore();
  const { context: excelContext } = useExcelStore();

  const handleSend = async (content: string) => {
    // Add user message
    addMessage({ role: 'user', content });
    setTyping(true);

    // Create placeholder for assistant message
    addMessage({ role: 'assistant', content: '' });

    try {
      let fullContent = '';
      const toolCalls: Array<{ id: string; name: string; arguments: string }> = [];

      for await (const event of streamChat(content, excelContext || undefined)) {
        switch (event.type) {
          case 'text':
            if (event.content) {
              fullContent += event.content;
              updateLastAssistantMessage(fullContent, toolCalls);
            }
            break;

          case 'tool_call_end':
            if (event.toolCall) {
              toolCalls.push({
                id: event.toolCall.id,
                name: event.toolCall.name,
                arguments: event.toolCall.arguments,
              });
              updateLastAssistantMessage(fullContent, toolCalls);
            }
            break;

          case 'error':
            fullContent += `\n\n*Error: ${event.error}*`;
            updateLastAssistantMessage(fullContent, toolCalls);
            break;

          case 'done':
            break;
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to send message';
      updateLastAssistantMessage(`*Error: ${errorMessage}*`, []);
    } finally {
      setTyping(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.messages}>
        <MessageList messages={messages} />
        {isTyping && <TypingIndicator />}
      </div>
      <div className={styles.input}>
        <InputBox onSend={handleSend} disabled={isTyping} />
      </div>
    </div>
  );
}
```

#### Step 14: Update Chat Store

```typescript
// apps/addin/src/store/chatStore.ts - Add updateLastAssistantMessage
import { create } from 'zustand';
import type { ChatMessage, ToolCall } from '@cellix/shared';

interface ChatState {
  messages: ChatMessage[];
  isTyping: boolean;
  addMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  updateLastAssistantMessage: (content: string, toolCalls: Array<{ id: string; name: string; arguments: string }>) => void;
  setTyping: (isTyping: boolean) => void;
  clearMessages: () => void;
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  isTyping: false,

  addMessage: (message) =>
    set((state) => ({
      messages: [
        ...state.messages,
        {
          ...message,
          id: crypto.randomUUID(),
          timestamp: Date.now(),
        },
      ],
    })),

  updateLastAssistantMessage: (content, toolCalls) =>
    set((state) => {
      const messages = [...state.messages];
      const lastIndex = messages.length - 1;

      if (lastIndex >= 0 && messages[lastIndex].role === 'assistant') {
        messages[lastIndex] = {
          ...messages[lastIndex],
          content,
          toolCalls: toolCalls.map((tc) => ({
            id: tc.id,
            name: tc.name,
            parameters: JSON.parse(tc.arguments || '{}'),
            status: 'pending' as const,
          })),
        };
      }

      return { messages };
    }),

  setTyping: (isTyping) => set({ isTyping }),

  clearMessages: () => set({ messages: [] }),
}));
```

### Code Snippets

#### Token Budget Enforcement

```typescript
// apps/backend/src/lib/tokens.ts
import { encode } from 'gpt-tokenizer';

export const TOKEN_LIMITS = {
  MAX_INPUT_TOKENS: 8000,
  MAX_OUTPUT_TOKENS: 4096,
  SYSTEM_PROMPT_RESERVE: 2000,
};

export function countTokens(text: string): number {
  return encode(text).length;
}

export function truncateToTokenLimit(text: string, limit: number): string {
  const tokens = encode(text);
  if (tokens.length <= limit) return text;

  // Truncate and add indicator
  const truncated = tokens.slice(0, limit - 10);
  return new TextDecoder().decode(new Uint8Array(truncated)) + '\n...[truncated]';
}
```

## Validation Gates

### Build

- [ ] `pnpm build` passes for all packages
- [ ] No TypeScript errors

### Lint

- [ ] `pnpm lint` passes with no errors
- [ ] `pnpm typecheck` passes

### Manual Testing

- [ ] Backend starts without errors
- [ ] `/api/health` returns OK
- [ ] `/api/chat` accepts POST requests
- [ ] Streaming responses work (SSE events received)
- [ ] Add-in connects to backend
- [ ] Messages stream in real-time
- [ ] Tool calls are included in response
- [ ] Excel context is included in AI prompt
- [ ] Error handling works (invalid API key, etc.)

## Safety Considerations

- **No hardcoded API keys** - Use environment variables
- **Token limits enforced** - Prevent runaway costs
- **Tool whitelist** - Only allow defined tools
- **Request validation** - Zod schemas for all inputs

## Confidence Score

**8/10** - High confidence

**Strengths:**
- OpenAI SDK well-documented
- SSE streaming is standard pattern
- Zod validation already used in codebase
- Existing chat types in shared package

**Uncertainties:**
- SSE handling in Fastify requires raw response
- Token counting accuracy across different models
- Tool call accumulation edge cases

## Notes

### Deferred to Phase 4
- Tool execution
- Preview system
- Audit logging
- Conversation history persistence

### Environment Setup Required
```bash
# Create .env file in apps/backend
OPENAI_API_KEY=sk-your-key-here
```
