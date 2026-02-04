/**
 * Chat message types for Cellix
 */

/** Tool call status in the execution lifecycle */
export type ToolCallStatus = 'pending' | 'preview' | 'executed' | 'cancelled' | 'error';

/** A tool call requested by the AI assistant */
export interface ToolCall {
  /** Unique identifier for this tool call */
  id: string;
  /** Name of the tool to execute */
  name: string;
  /** Parameters for the tool */
  parameters: Record<string, unknown>;
  /** Current status of the tool call */
  status: ToolCallStatus;
  /** Error message if status is 'error' */
  error?: string;
  /** Result of the tool execution */
  result?: unknown;
}

/** Role of the message sender */
export type MessageRole = 'user' | 'assistant' | 'system';

/** A chat message in the conversation */
export interface ChatMessage {
  /** Unique identifier for this message */
  id: string;
  /** Who sent the message */
  role: MessageRole;
  /** Text content of the message */
  content: string;
  /** Unix timestamp in milliseconds */
  timestamp: number;
  /** Tool calls included in this message (assistant only) */
  toolCalls?: ToolCall[];
}

/** Request body for chat endpoint */
export interface ChatRequest {
  /** User's message content */
  message: string;
  /** Session ID for conversation continuity */
  sessionId?: string;
  /** Excel context from the add-in (uses full context type) */
  excelContext?: import('./excel.js').ExcelContextFull;
}

/** Tool call data from streaming */
export interface ToolCallChunk {
  /** Unique tool call ID */
  id: string;
  /** Name of the tool being called */
  name: string;
  /** JSON string of arguments (accumulated across chunks) */
  arguments: string;
}

/** Streaming chat response event (matches backend ChatStreamEvent) */
export interface ChatStreamEvent {
  /** Type of event */
  type: 'text' | 'tool_call_start' | 'tool_call_delta' | 'tool_call_end' | 'done' | 'error';
  /** Text content (for text events) */
  content?: string;
  /** Tool call data (for tool_call events) */
  toolCall?: ToolCallChunk;
  /** Error message (for error events) */
  error?: string;
}
