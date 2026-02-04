/**
 * AI provider types and interfaces.
 * Designed to support multiple AI providers (OpenAI, Claude, etc.)
 */

import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

/** Message type compatible with OpenAI format */
export type Message = ChatCompletionMessageParam;

/** Tool definition in OpenAI format */
export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/** Tool choice option - controls how the AI uses tools */
export type ToolChoice =
  | 'auto' // AI decides whether to use tools
  | 'none' // AI cannot use tools
  | 'required' // AI must use a tool
  | { type: 'function'; function: { name: string } }; // Force specific tool

/** Parameters for chat completion */
export interface ChatParams {
  /** Conversation messages */
  messages: Message[];
  /** Available tools for the AI to call */
  tools?: ToolDefinition[];
  /** Maximum tokens in response */
  maxTokens?: number;
  /** Temperature for response randomness (0-2) */
  temperature?: number;
  /** Control tool usage behavior */
  toolChoice?: ToolChoice;
}

/** Tool call data accumulated from stream */
export interface ToolCallChunk {
  /** Unique tool call ID */
  id: string;
  /** Name of the tool being called */
  name: string;
  /** JSON string of arguments (accumulated across chunks) */
  arguments: string;
}

/** Events emitted during chat streaming */
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

/** AI provider interface - implement for each provider */
export interface AIProvider {
  /** Stream a chat completion */
  chat(params: ChatParams): AsyncIterable<ChatStreamEvent>;
  /** Count tokens in text */
  countTokens(text: string): number;
  /** Provider name for logging */
  readonly name: string;
}
