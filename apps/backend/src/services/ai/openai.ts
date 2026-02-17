/**
 * OpenAI provider implementation.
 * Handles streaming chat completions with tool calling support.
 */

import OpenAI from 'openai';
import { encode } from 'gpt-tokenizer';
import { env } from '../../lib/env.js';
import type { AIProvider, ChatParams, ChatStreamEvent, ToolCallChunk } from './types.js';

let clientInstance: OpenAI | null = null;

/** Get a shared OpenAI client instance (singleton). */
export function getOpenAIClient(): OpenAI {
  if (!clientInstance) {
    clientInstance = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
      ...(env.OPENAI_BASE_URL && { baseURL: env.OPENAI_BASE_URL }),
    });
  }
  return clientInstance;
}

/** Fallback chains per model — OpenRouter tries each in order if the primary is unavailable. */
const MODEL_FALLBACKS: Record<string, string[]> = {
  'gpt-4.1-nano': ['gpt-4.1-nano', 'google/gemini-2.5-flash', 'gpt-4.1-mini'],
  'gpt-4.1-mini': ['gpt-4.1-mini', 'google/gemini-2.5-flash', 'gpt-4o-mini'],
  'gpt-4o-mini': ['gpt-4o-mini', 'gpt-4.1-mini', 'google/gemini-2.5-flash'],
  'gpt-4.1': ['gpt-4.1', 'gpt-4o', 'anthropic/claude-sonnet-4-20250514'],
  'gpt-4o': ['gpt-4o', 'gpt-4.1', 'anthropic/claude-sonnet-4-20250514'],
  'anthropic/claude-sonnet-4-20250514': ['anthropic/claude-sonnet-4-20250514', 'gpt-4.1', 'gpt-4o'],
  'deepseek/deepseek-reasoner': ['deepseek/deepseek-reasoner', 'anthropic/claude-sonnet-4-20250514', 'gpt-4.1'],
};

export class OpenAIProvider implements AIProvider {
  private client: OpenAI;
  readonly name = 'openai';

  constructor() {
    this.client = getOpenAIClient();
  }

  async *chat(params: ChatParams): AsyncIterable<ChatStreamEvent> {
    try {
      const hasTools = params.tools && params.tools.length > 0;
      const modelStr = params.model || env.OPENAI_MODEL;
      const isAnthropic = modelStr.includes('claude');

      // Add cache_control for Anthropic models to enable prompt caching
      let processedMessages = params.messages;
      if (isAnthropic && processedMessages.length > 0) {
        processedMessages = processedMessages.map((msg, i) => {
          if (i === 0 && msg.role === 'system') {
            return { ...msg, cache_control: { type: 'ephemeral' } } as typeof msg;
          }
          return msg;
        });
      }

      const fallbacks = MODEL_FALLBACKS[modelStr];
      const stream = await this.client.chat.completions.create({
        model: modelStr,
        messages: processedMessages,
        tools: hasTools ? params.tools : undefined,
        tool_choice: (params.toolChoice && hasTools) ? params.toolChoice : undefined,
        max_tokens: params.maxTokens ?? 4096,
        temperature: params.temperature ?? 0.7,
        stream: true,
        // OpenRouter extension: try fallback models if primary is unavailable
        ...(fallbacks ? { models: fallbacks } as Record<string, unknown> : {}),
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

        // Tool calls - accumulate across chunks
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const existing = toolCalls.get(tc.index);

            if (!existing) {
              // New tool call starting
              const newCall: ToolCallChunk = {
                id: tc.id || '',
                name: tc.function?.name || '',
                arguments: tc.function?.arguments || '',
              };
              toolCalls.set(tc.index, newCall);
              yield { type: 'tool_call_start', toolCall: { ...newCall } };
            } else {
              // Accumulate arguments
              if (tc.id) existing.id = tc.id;
              if (tc.function?.name) existing.name = tc.function.name;
              if (tc.function?.arguments) {
                existing.arguments += tc.function.arguments;
              }
              yield { type: 'tool_call_delta', toolCall: { ...existing } };
            }
          }
        }

        // Check for completion - emit tool_call_end for any finish reason if we have tool calls
        if (choice.finish_reason && toolCalls.size > 0) {
          // Emit completed tool calls
          for (const tc of toolCalls.values()) {
            yield { type: 'tool_call_end', toolCall: { ...tc } };
          }
          toolCalls.clear();
        }
      }

      yield { type: 'done' };
    } catch (error) {
      if (error instanceof OpenAI.APIError) {
        let errorMessage = `OpenAI API error: ${error.message}`;
        if (error.status === 429) {
          errorMessage = 'Rate limit exceeded. Please try again in a moment.';
        } else if (error.status === 401) {
          errorMessage = 'Authentication failed. Please check API key configuration.';
        } else if (error.status === 400) {
          errorMessage = 'Invalid request. The message may be too long.';
        }
        yield { type: 'error', error: errorMessage };
      } else {
        yield {
          type: 'error',
          error: error instanceof Error ? error.message : 'Unknown error occurred',
        };
      }
    }
  }

  countTokens(text: string): number {
    return encode(text).length;
  }
}
