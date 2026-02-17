/**
 * AI provider types and interfaces.
 * Designed to support multiple AI providers (OpenAI, Claude, etc.)
 */

import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import type { ChatStreamEvent, ToolCallChunk } from '@cellix/shared';

// Re-export shared types for convenience
export type { ChatStreamEvent, ToolCallChunk };

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
  /** Model override (uses env default if not specified) */
  model?: string;
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
