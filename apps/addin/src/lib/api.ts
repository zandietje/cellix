import type {
  ChatStreamEvent,
  ExcelContextFull,
  ExcelContextWithProfile,
} from '@cellix/shared';

import { API_CONFIG } from './constants';

/** Context type that can be sent to the API (either legacy or profile-first) */
export type ChatContext = ExcelContextFull | ExcelContextWithProfile;

/**
 * Get the API base URL.
 * - In development: Uses '/api' which is proxied by Vite to http://localhost:3001
 * - In production: Requires VITE_API_URL environment variable
 */
function getApiBaseUrl(): string {
  const envUrl = import.meta.env.VITE_API_URL;

  if (envUrl) {
    return envUrl;
  }

  // In production, VITE_API_URL must be set
  if (import.meta.env.PROD) {
    throw new Error(
      'VITE_API_URL is required in production. ' +
        'Set it to the backend URL (e.g., https://api.cellix.app/api)'
    );
  }

  // In development, use proxy path (Vite handles the proxy)
  return '/api';
}

const API_BASE_URL = getApiBaseUrl();


// ============================================
// SSE Stream Parser
// ============================================

/**
 * Parse SSE events from a fetch Response.
 * Shared between streamChat and continueChat.
 */
async function* parseSSEStream(
  response: Response
): AsyncGenerator<ChatStreamEvent, void, unknown> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('No response body available');
  }

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data) {
            try {
              const event = JSON.parse(data) as ChatStreamEvent;
              yield event;

              if (event.type === 'done' || event.type === 'error') {
                return;
              }
            } catch {
              console.warn('Failed to parse SSE data:', data);
            }
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ============================================
// Chat API
// ============================================

/** Minimal message shape for conversation history sent to backend */
export interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Send a chat message and stream the response via SSE.
 * Yields ChatStreamEvent objects as they arrive from the backend.
 * Accepts either profile-first or legacy context.
 * Sends sessionId and history for conversation memory.
 */
export async function* streamChat(
  message: string,
  excelContext?: ChatContext | null,
  sessionId?: string | null,
  history?: HistoryMessage[],
): AsyncGenerator<ChatStreamEvent, void, unknown> {
  const response = await fetch(`${API_BASE_URL}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message,
      excelContext: excelContext ?? undefined,
      sessionId: sessionId || undefined,
      history: history && history.length > 0 ? history : undefined,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Chat request failed: ${response.status} ${error}`);
  }

  yield* parseSSEStream(response);
}

// ============================================
// Continuation API (Tool Result Feedback Loop)
// ============================================

/** Result of executing a tool locally */
export interface ToolResult {
  toolCallId: string;
  toolName: string;
  result: unknown;
  isError?: boolean;
}

/** Parameters for the continuation endpoint */
export interface ChatContinueParams {
  /** Original user message */
  message: string;
  /** Session ID for conversation continuity */
  sessionId?: string | null;
  /** Conversation history fallback (when no DB) */
  history?: HistoryMessage[];
  /** Original Excel context */
  excelContext?: ChatContext | null;
  /** Text content from the assistant's response */
  assistantContent: string | null;
  /** Tool calls from the assistant's response */
  toolCalls: Array<{ id: string; name: string; arguments: string }>;
  /** Results from executing the tools */
  toolResults: ToolResult[];
  /** Whether the AI can call more tools (false on final iteration) */
  allowTools?: boolean;
}

/**
 * Truncate a tool result to fit within token limits.
 * Preserves structure for objects/arrays by truncating rows.
 */
function truncateToolResult(result: unknown): string {
  const str = typeof result === 'string' ? result : JSON.stringify(result);

  if (str.length <= API_CONFIG.MAX_TOOL_RESULT_SIZE) {
    return str;
  }

  // For arrays (common for row results), truncate rows
  if (Array.isArray(result)) {
    const truncated = result.slice(0, 20);
    const json = JSON.stringify({
      rows: truncated,
      totalRows: result.length,
      truncated: true,
      note: `Showing first 20 of ${result.length} results`,
    });
    if (json.length <= API_CONFIG.MAX_TOOL_RESULT_SIZE) return json;
  }

  // For objects with a rows/data property, truncate that
  if (result && typeof result === 'object' && 'rows' in result) {
    const obj = result as Record<string, unknown>;
    const rows = Array.isArray(obj.rows) ? obj.rows.slice(0, API_CONFIG.TRUNCATE_ROWS) : obj.rows;
    const json = JSON.stringify({
      ...obj,
      rows,
      truncated: true,
    });
    if (json.length <= API_CONFIG.MAX_TOOL_RESULT_SIZE) return json;
  }

  // Last resort: simple character truncation
  return str.slice(0, API_CONFIG.MAX_TOOL_RESULT_SIZE - 50) + '\n...[Result truncated]';
}

/**
 * Continue a chat conversation after tool execution.
 * Sends tool results back to the AI and streams the continuation response.
 */
export async function* continueChat(
  params: ChatContinueParams
): AsyncGenerator<ChatStreamEvent, void, unknown> {
  const { message, sessionId, history, excelContext, assistantContent, toolCalls, toolResults, allowTools = true } =
    params;

  // Build tool result payloads with truncation
  const formattedResults = toolResults.map((tr) => {
    let content: string;
    if (tr.isError) {
      content = JSON.stringify({ error: tr.result });
    } else {
      content = truncateToolResult(tr.result);
    }
    return {
      toolCallId: tr.toolCallId,
      content,
    };
  });

  const response = await fetch(`${API_BASE_URL}/chat/continue`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message,
      sessionId: sessionId || undefined,
      history: history && history.length > 0 ? history : undefined,
      excelContext: excelContext ?? undefined,
      assistantContent,
      toolCalls: toolCalls.map((tc) => ({
        id: tc.id,
        name: tc.name,
        arguments: tc.arguments,
      })),
      toolResults: formattedResults,
      allowTools,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Continuation request failed: ${response.status} ${error}`);
  }

  yield* parseSSEStream(response);
}

