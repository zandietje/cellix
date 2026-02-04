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
  /** Excel context from the add-in */
  excelContext?: ExcelContext;
}

/** Excel context sent with chat requests */
export interface ExcelContext {
  /** Currently selected range address (e.g., "A1:C10") */
  selectedRange?: string;
  /** Values in the selected range (2D array) */
  selectedValues?: unknown[][];
  /** Active sheet name */
  activeSheet?: string;
  /** All sheet names in the workbook */
  sheetNames?: string[];
  /** Detected headers from selection */
  headers?: string[];
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

/** @deprecated Use ChatStreamEvent instead */
export type ChatStreamChunk = ChatStreamEvent;
