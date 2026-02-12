# PRP: Tool Result Feedback Loop

## Overview

Implement a feedback loop where tool execution results are sent back to the AI, enabling it to complete multi-turn analysis. Currently, the AI calls tools but never receives the results, so it cannot provide insights based on the fetched data.

## Context

- **Priority:** High
- **Estimated Effort:** 2-3 days
- **Dependencies:** PRP "Fix Read Tool Execution" should be completed first

### Problem Statement

OpenAI's tool calling expects this message flow:
```
1. user: "Analyze top revenue products"
2. assistant: null + tool_calls: [{ name: 'select_rows', arguments: {...} }]
3. tool: { tool_call_id: '...', content: '{"rows": [...]}' }  ← MISSING!
4. assistant: "Based on the data, your top products are..."
```

Currently Cellix stops at step 2. The tool is called, but:
- Results are never sent back to the AI
- AI cannot complete its analysis
- User sees partial response or "Please hold on..." forever

### Related Files

| File | Purpose |
|------|---------|
| `apps/addin/src/components/chat/ChatPane.tsx` | Orchestrates chat and tool calls |
| `apps/addin/src/lib/api.ts` | API client for chat streaming |
| `apps/backend/src/routes/chat.ts` | Chat endpoint |
| `apps/backend/src/services/ai/openai.ts` | OpenAI provider |

## Research Findings

### OpenAI Tool Call Protocol

When using tools, OpenAI expects:
1. Send messages with tools defined
2. Receive assistant message with `tool_calls`
3. Execute tools locally
4. Send new request with tool results as `role: 'tool'` messages
5. Receive final assistant response

```typescript
// Message sequence for tool calls
const messages = [
  { role: 'system', content: '...' },
  { role: 'user', content: 'Analyze revenue' },
  {
    role: 'assistant',
    content: null,
    tool_calls: [{ id: 'call_123', function: { name: 'select_rows', arguments: '...' }}]
  },
  {
    role: 'tool',
    tool_call_id: 'call_123',
    content: '{"rows": [...]}'  // Stringified result
  },
];
// Then call OpenAI again to get final response
```

### Current Architecture Gap

```
Frontend                          Backend                    OpenAI
─────────────────────────────────────────────────────────────────────
POST /api/chat ──────────────────→ Build messages ──────────→ API call
                                                              ↓
                ←─────────────────────────────────── Stream response
                                                    (with tool_calls)
Execute tool locally
Get result
??? (result never sent back)
```

### Proposed Architecture

```
Frontend                          Backend                    OpenAI
─────────────────────────────────────────────────────────────────────
POST /api/chat ──────────────────→ Build messages ──────────→ API call
                                                              ↓
                ←─────────────────────────────────── Stream response
                                                    (with tool_calls)
Execute tool locally
Get result
                                                              ↓
POST /api/chat/continue ─────────→ Add tool results ────────→ API call
  {toolResults: [...]}             to messages                 ↓
                                                              ↓
                ←─────────────────────────────────── Stream final response
```

## Implementation Plan

### Option A: Frontend-Driven Continuation (Recommended)

The frontend executes tools and makes a follow-up API call with results.

**Pros:**
- Simpler backend changes
- Tool execution stays in frontend (Office.js context)
- More control over when to continue

**Cons:**
- Two API calls per tool-using response
- Frontend complexity increases

### Option B: Backend-Driven with WebSocket

Backend orchestrates the full loop, frontend just streams results.

**Pros:**
- Single connection
- Backend has full control

**Cons:**
- Requires WebSocket or long-polling
- Tool execution would need to happen in frontend and report back
- More complex architecture

**Decision: Option A** - Frontend-driven is simpler and fits existing patterns.

---

### Files to Create

#### 1. `apps/backend/src/routes/chat.ts` - Add continuation endpoint

```typescript
/**
 * Continue chat after tool execution
 * POST /api/chat/continue
 */
fastify.post<{ Body: ChatContinueBody }>(
  '/chat/continue',
  async (request, reply) => {
    const { sessionId, toolResults, originalMessages } = request.body;

    // Build messages with tool results
    const messages = [
      ...originalMessages,
      // Add tool result messages
      ...toolResults.map(tr => ({
        role: 'tool' as const,
        tool_call_id: tr.toolCallId,
        content: typeof tr.result === 'string'
          ? tr.result
          : JSON.stringify(tr.result),
      })),
    ];

    // Set SSE headers
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    // Continue with AI - no tools needed for final response
    const provider = getAIProvider();
    for await (const event of provider.chat({
      messages,
      tools: [], // No tools for continuation
      toolChoice: 'none',
    })) {
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    }

    reply.raw.end();
  }
);
```

### Files to Modify

#### 2. `apps/addin/src/lib/api.ts` - Add continuation API

```typescript
export interface ToolResult {
  toolCallId: string;
  toolName: string;
  result: unknown;
  error?: string;
}

export interface ChatContinueParams {
  sessionId?: string;
  toolResults: ToolResult[];
  originalMessages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string | null;
    tool_calls?: Array<{
      id: string;
      function: { name: string; arguments: string };
    }>;
  }>;
}

export async function* continueChat(
  params: ChatContinueParams
): AsyncGenerator<ChatEvent, void, undefined> {
  const response = await fetch(`${API_BASE}/api/chat/continue`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  // Same SSE parsing as streamChat
  yield* parseSSEStream(response);
}
```

#### 3. `apps/addin/src/components/chat/ChatPane.tsx` - Orchestrate continuation

```typescript
const processStream = useCallback(
  async (content: string) => {
    let fullContent = '';
    const toolCalls: ToolCallInfo[] = [];
    let assistantMessageWithToolCalls: AssistantMessage | null = null;

    // First pass: receive AI response
    for await (const event of streamChat(content, excelContext)) {
      switch (event.type) {
        case 'text':
          fullContent += event.content || '';
          updateLastAssistantMessage(fullContent, toolCalls);
          break;

        case 'tool_call_end':
          if (event.toolCall) {
            toolCalls.push(event.toolCall);
            updateLastAssistantMessage(fullContent, toolCalls);
          }
          break;

        case 'done':
          // If there are tool calls, we need to execute and continue
          if (toolCalls.length > 0) {
            assistantMessageWithToolCalls = {
              role: 'assistant',
              content: fullContent || null,
              tool_calls: toolCalls.map(tc => ({
                id: tc.id,
                function: { name: tc.name, arguments: tc.arguments },
              })),
            };
          }
          break;
      }
    }

    // If we have tool calls, execute them and continue
    if (assistantMessageWithToolCalls && toolCalls.length > 0) {
      const toolResults = await executeAllTools(toolCalls);

      // Show intermediate results to user
      displayToolResults(toolResults);

      // Continue the conversation with tool results
      await continueWithToolResults(
        assistantMessageWithToolCalls,
        toolResults
      );
    }
  },
  [excelContext, updateLastAssistantMessage]
);

const executeAllTools = async (toolCalls: ToolCallInfo[]): Promise<ToolResult[]> => {
  const results: ToolResult[] = [];

  for (const tc of toolCalls) {
    if (isWriteTool(tc.name)) {
      // Write tools need preview/approval - handle separately
      results.push({
        toolCallId: tc.id,
        toolName: tc.name,
        result: { status: 'pending_approval', message: 'Awaiting user approval' },
      });
    } else {
      // Read tools execute immediately
      try {
        const result = await executeToolCall({
          id: tc.id,
          name: tc.name,
          parameters: JSON.parse(tc.arguments || '{}'),
          status: 'pending',
        });
        results.push({
          toolCallId: tc.id,
          toolName: tc.name,
          result: result.resultData,
        });
      } catch (err) {
        results.push({
          toolCallId: tc.id,
          toolName: tc.name,
          result: null,
          error: err instanceof Error ? err.message : 'Execution failed',
        });
      }
    }
  }

  return results;
};

const continueWithToolResults = async (
  assistantMessage: AssistantMessage,
  toolResults: ToolResult[]
) => {
  // Build original messages for context
  const originalMessages = [
    { role: 'system', content: buildSystemPrompt(excelContext) },
    { role: 'user', content: lastUserMessage },
    assistantMessage,
  ];

  // Add a new assistant message placeholder for continuation
  addMessage({ role: 'assistant', content: '' });

  // Stream the continuation
  for await (const event of continueChat({
    toolResults,
    originalMessages,
  })) {
    if (event.type === 'text' && event.content) {
      updateLastAssistantMessage(event.content, []);
    }
  }
};
```

#### 4. `apps/addin/src/store/chatStore.ts` - Track tool execution state

```typescript
interface ChatState {
  // ... existing ...

  /** Tool results awaiting continuation */
  pendingToolResults: ToolResult[];

  /** Whether we're in a tool execution phase */
  isExecutingTools: boolean;

  /** Add tool results */
  setPendingToolResults: (results: ToolResult[]) => void;

  /** Set tool execution state */
  setExecutingTools: (executing: boolean) => void;
}
```

### Implementation Steps

1. **Create continuation endpoint** in `apps/backend/src/routes/chat.ts`
2. **Add continueChat API** in `apps/addin/src/lib/api.ts`
3. **Add request schemas** for continuation endpoint
4. **Update ChatPane** to orchestrate tool execution and continuation
5. **Update chatStore** with tool execution state
6. **Add UI indicators** for tool execution phase
7. **Handle errors** gracefully in the continuation flow
8. **Test end-to-end** with read tools

### Sequence Diagram

```
User              Frontend           Backend            OpenAI
─────────────────────────────────────────────────────────────────
"Analyze data"
     │
     ├──────────► POST /api/chat ────────────────────► API call
     │                                                    │
     │            ◄─── SSE: tool_call(select_rows) ◄─────┘
     │
     │            Execute select_rows locally
     │            Get rows data
     │
     ├──────────► POST /api/chat/continue ───────────► API call
     │            {toolResults: [{rows: [...]}]}         │
     │                                                    │
     │            ◄─── SSE: "Your top products..." ◄────┘
     │
◄────┴────────── Display final analysis
```

## Validation Gates

### Build
- [ ] `pnpm build` passes
- [ ] `pnpm typecheck` passes

### Lint
- [ ] `pnpm lint` passes

### Manual Testing
- [ ] Ask "What are my top 5 products by revenue?"
  - AI calls select_rows
  - Tool executes, returns data
  - AI receives data and provides analysis
- [ ] Ask "Show outliers in my data"
  - AI calls find_outliers
  - Tool executes
  - AI explains the outliers found
- [ ] Test with multiple tool calls in one response
- [ ] Test error handling when tool execution fails

## Safety Considerations

- Limit tool result size sent back (truncate large datasets)
- Timeout for continuation requests
- Don't allow infinite tool call loops (max 3 iterations)
- Validate tool results before sending to backend

## Success Metrics

| Metric | Target |
|--------|--------|
| Tool-to-analysis completion rate | >95% |
| Time from tool call to final response | <5 seconds |
| User satisfaction with analysis quality | Qualitative feedback |

## Notes

### Write Tool Handling

Write tools still need user approval before execution. The continuation flow should:
1. Execute read tools immediately
2. For write tools, return "pending_approval" status
3. After user approves, execute and optionally continue

### Token Budget

Tool results can be large. Consider:
- Truncating to first N rows
- Summarizing instead of raw data
- Token counting before sending

### Future Enhancements

- Support parallel tool execution
- Cache tool results for re-use
- Allow user to modify tool parameters before execution
