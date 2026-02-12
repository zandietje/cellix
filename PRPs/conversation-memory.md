# PRP: Conversation Memory

## Overview

Implement conversation memory so the AI remembers previous messages within a chat session. Currently, each request is stateless - the AI only sees the current message and has no context of what was discussed before.

## Context

- **Priority:** High
- **Estimated Effort:** 2-3 days
- **Dependencies:** Supabase database setup (already exists)

### Problem Statement

Current flow:
```
User: "Analyze my sales data"
AI: "Your sales show strong growth in Electronics..."

User: "What about the top 5?"
AI: "I don't have context about what you're referring to. Could you clarify?"
```

The AI loses all context between messages because:
1. Frontend stores messages locally but doesn't send history
2. Backend only receives the current message
3. No database persistence of conversation history

### Related Files

| File | Purpose |
|------|---------|
| `apps/addin/src/store/chatStore.ts` | Frontend message storage |
| `apps/addin/src/lib/api.ts` | API client |
| `apps/backend/src/routes/chat.ts` | Chat endpoint |
| `apps/backend/src/lib/supabase.ts` | Database client (may need creation) |
| `packages/shared/src/types/chat.ts` | Message types |

### Database Schema

From `.claude/reference/supabase-schema.md`:
```sql
CREATE TABLE chat_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  title text,
  messages jsonb NOT NULL DEFAULT '[]',
  token_usage jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

## Research Findings

### Current Message Flow

```
Frontend (Zustand)              Backend                    OpenAI
────────────────────────────────────────────────────────────────────
messages: [                     Receives:
  {user: "Analyze"},            { message: "What top 5?" }
  {assistant: "Sales..."},
  {user: "What top 5?"}         Builds:                    Sees:
]                               [system, "What top 5?"]    [system, user]
                                ↑ NO HISTORY!
```

### Desired Message Flow

```
Frontend (Zustand)              Backend                    OpenAI
────────────────────────────────────────────────────────────────────
messages: [...]                 Receives:
sessionId: "abc-123"            { message, sessionId }
                                      ↓
                                Load from DB:
                                SELECT messages FROM chat_sessions
                                WHERE id = sessionId
                                      ↓
                                Builds:                    Sees:
                                [system, ...history,       [system,
                                 currentMessage]            history,
                                      ↓                     user]
                                Save to DB:
                                UPDATE chat_sessions
                                SET messages = [..., new]
```

### Token Budget Considerations

With conversation history, token usage grows. Need to:
1. Limit history to last N messages or N tokens
2. Summarize old messages if context too long
3. Track token usage per session

Current limits from `apps/backend/src/lib/tokens.ts`:
```typescript
export const TOKEN_LIMITS = {
  MAX_INPUT_TOKENS: 8000,
  MAX_OUTPUT_TOKENS: 4000,
  MAX_SESSION_TOKENS: 50000,
  WARN_THRESHOLD: 0.8,
};
```

## Implementation Plan

### Files to Create

#### 1. `apps/backend/src/lib/supabase.ts`

```typescript
import { createClient } from '@supabase/supabase-js';
import { env } from './env.js';

// Only create client if Supabase is configured
export const supabase = env.SUPABASE_URL && env.SUPABASE_ANON_KEY
  ? createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY)
  : null;

export function isSupabaseConfigured(): boolean {
  return supabase !== null;
}
```

#### 2. `apps/backend/src/services/chat/sessionManager.ts`

```typescript
import { supabase, isSupabaseConfigured } from '../../lib/supabase.js';
import type { ChatMessage } from '@cellix/shared';

export interface ChatSession {
  id: string;
  messages: ChatMessage[];
  tokenUsage: { input: number; output: number };
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Create a new chat session
 */
export async function createSession(): Promise<string> {
  if (!isSupabaseConfigured()) {
    // Fallback: return a temporary ID (no persistence)
    return `temp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  }

  const { data, error } = await supabase
    .from('chat_sessions')
    .insert({ messages: [], token_usage: { input: 0, output: 0 } })
    .select('id')
    .single();

  if (error) throw new Error(`Failed to create session: ${error.message}`);
  return data.id;
}

/**
 * Load session history
 */
export async function loadSessionHistory(
  sessionId: string,
  maxMessages = 20
): Promise<ChatMessage[]> {
  if (!isSupabaseConfigured() || sessionId.startsWith('temp_')) {
    return []; // No persistence available
  }

  const { data, error } = await supabase
    .from('chat_sessions')
    .select('messages')
    .eq('id', sessionId)
    .single();

  if (error) {
    console.warn(`Failed to load session ${sessionId}:`, error.message);
    return [];
  }

  // Return last N messages
  const messages = (data?.messages || []) as ChatMessage[];
  return messages.slice(-maxMessages);
}

/**
 * Save messages to session
 */
export async function saveSessionMessages(
  sessionId: string,
  newMessages: ChatMessage[],
  tokenUsage?: { input: number; output: number }
): Promise<void> {
  if (!isSupabaseConfigured() || sessionId.startsWith('temp_')) {
    return; // No persistence available
  }

  // Load existing messages
  const { data } = await supabase
    .from('chat_sessions')
    .select('messages, token_usage')
    .eq('id', sessionId)
    .single();

  const existingMessages = (data?.messages || []) as ChatMessage[];
  const existingTokens = (data?.token_usage || { input: 0, output: 0 });

  // Append new messages
  const updatedMessages = [...existingMessages, ...newMessages];

  // Update token usage
  const updatedTokens = tokenUsage
    ? {
        input: existingTokens.input + tokenUsage.input,
        output: existingTokens.output + tokenUsage.output,
      }
    : existingTokens;

  const { error } = await supabase
    .from('chat_sessions')
    .update({
      messages: updatedMessages,
      token_usage: updatedTokens,
      updated_at: new Date().toISOString(),
    })
    .eq('id', sessionId);

  if (error) {
    console.error(`Failed to save session ${sessionId}:`, error.message);
  }
}

/**
 * Trim history to fit token budget
 */
export function trimHistoryToTokenBudget(
  messages: ChatMessage[],
  maxTokens: number,
  countTokens: (text: string) => number
): ChatMessage[] {
  let totalTokens = 0;
  const result: ChatMessage[] = [];

  // Process from newest to oldest
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    const tokens = countTokens(msg.content || '');

    if (totalTokens + tokens > maxTokens) {
      break; // Would exceed budget
    }

    totalTokens += tokens;
    result.unshift(msg); // Add to front
  }

  return result;
}
```

### Files to Modify

#### 3. `apps/backend/src/lib/env.ts`

Add Supabase config (optional):

```typescript
const envSchema = z.object({
  // ... existing ...

  // Database (optional for MVP)
  SUPABASE_URL: z.string().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),
});
```

#### 4. `apps/backend/src/routes/chat.ts`

Update to load and save history:

```typescript
import {
  loadSessionHistory,
  saveSessionMessages,
  createSession,
  trimHistoryToTokenBudget,
} from '../services/chat/sessionManager.js';

// In the chat handler:
fastify.post<{ Body: ChatRequestBody }>(
  '/chat',
  async (request, reply) => {
    const { message, sessionId, excelContext } = parseResult.data;

    // Create session if not provided
    const activeSessionId = sessionId || await createSession();

    // Load conversation history
    const history = await loadSessionHistory(activeSessionId);

    // Trim history to fit token budget (leave room for system + current)
    const maxHistoryTokens = TOKEN_LIMITS.MAX_INPUT_TOKENS - 3000;
    const trimmedHistory = trimHistoryToTokenBudget(
      history,
      maxHistoryTokens,
      countTokens
    );

    // Build messages with history
    const messages = [
      { role: 'system' as const, content: systemContent },
      ...trimmedHistory.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      { role: 'user' as const, content: message },
    ];

    // ... rest of handler ...

    // After streaming completes, save messages
    const newMessages: ChatMessage[] = [
      { role: 'user', content: message, timestamp: Date.now() },
      { role: 'assistant', content: fullResponseContent, timestamp: Date.now() },
    ];
    await saveSessionMessages(activeSessionId, newMessages);

    // Include sessionId in response for client to store
    reply.raw.write(`data: ${JSON.stringify({
      type: 'session',
      sessionId: activeSessionId
    })}\n\n`);
  }
);
```

#### 5. `apps/addin/src/store/chatStore.ts`

Add sessionId tracking:

```typescript
interface ChatState {
  // ... existing ...

  /** Current session ID */
  sessionId: string | null;

  /** Set session ID */
  setSessionId: (id: string) => void;

  /** Start new session (clear messages and sessionId) */
  startNewSession: () => void;
}

export const useChatStore = create<ChatState>((set) => ({
  // ... existing ...
  sessionId: null,

  setSessionId: (id) => set({ sessionId: id }),

  startNewSession: () => set({
    messages: [],
    sessionId: null,
    toolCalls: [],
  }),

  clearMessages: () => set({
    messages: [],
    // Keep sessionId to continue same session
  }),
}));
```

#### 6. `apps/addin/src/lib/api.ts`

Include sessionId in requests:

```typescript
export async function* streamChat(
  message: string,
  excelContext?: ExcelContext,
  sessionId?: string | null
): AsyncGenerator<ChatEvent, void, undefined> {
  const response = await fetch(`${API_BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      excelContext,
      sessionId: sessionId || undefined,
    }),
  });

  // ... SSE parsing ...
}
```

#### 7. `apps/addin/src/components/chat/ChatPane.tsx`

Use sessionId:

```typescript
export function ChatPane() {
  const { sessionId, setSessionId } = useChatStore();

  const processStream = useCallback(
    async (content: string) => {
      for await (const event of streamChat(content, excelContext, sessionId)) {
        switch (event.type) {
          // ... existing cases ...

          case 'session':
            // Store sessionId from server
            if (event.sessionId && !sessionId) {
              setSessionId(event.sessionId);
            }
            break;
        }
      }
    },
    [excelContext, sessionId, setSessionId]
  );

  // ... rest of component
}
```

### Implementation Steps

1. **Create Supabase client** in `apps/backend/src/lib/supabase.ts`
2. **Create sessionManager** service with CRUD operations
3. **Update env schema** to include optional Supabase config
4. **Update chat route** to load/save history
5. **Update chatStore** with sessionId tracking
6. **Update API client** to send sessionId
7. **Update ChatPane** to handle session events
8. **Add "New Chat" button** to clear session
9. **Test with and without Supabase** configured

### Graceful Degradation

If Supabase is not configured:
- Sessions get temporary IDs
- History is not persisted (frontend-only)
- No errors thrown, just warnings logged

This allows MVP testing without database setup.

## Validation Gates

### Build
- [ ] `pnpm build` passes
- [ ] `pnpm typecheck` passes

### Lint
- [ ] `pnpm lint` passes

### Manual Testing

Without Supabase:
- [ ] Chat works normally (no errors)
- [ ] Session is frontend-only (refreshing loses history)

With Supabase:
- [ ] First message creates session
- [ ] Follow-up messages include history
- [ ] AI remembers context from previous messages
- [ ] "New Chat" starts fresh session
- [ ] Refreshing page and resuming works (if sessionId stored)

### Conversation Memory Test

```
User: "What's my total revenue?"
AI: "Your total revenue is $1.2M..."

User: "Break it down by category"
AI: "Based on the revenue data we just discussed, here's the breakdown..."
     ↑ AI should remember the context!
```

## Safety Considerations

- Limit history size to prevent token overflow
- Don't store sensitive data in session (Excel data should be re-fetched)
- Session cleanup (TTL for old sessions)
- Rate limiting per session

## Success Metrics

| Metric | Target |
|--------|--------|
| Context retention | AI recalls info from last 5+ messages |
| Token efficiency | <80% of budget used for history |
| Latency impact | <200ms added for DB operations |

## Notes

### Token Budget Strategy

With 8000 max input tokens:
- ~2000 for system prompt + Excel context
- ~1000 for current message
- ~5000 for history (roughly 10-15 messages)

### Future Enhancements

- Session titles (auto-generated from first message)
- Session list/history UI
- Export conversation
- Share session link
- Conversation summarization for long chats

### Out of Scope

- Multi-user sessions (collaboration)
- Session branching/forking
- Offline sync
