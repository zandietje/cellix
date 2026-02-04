/**
 * OpenAI provider implementation.
 * Handles streaming chat completions with tool calling support.
 */

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
      // Support OpenRouter or other OpenAI-compatible APIs
      ...(env.OPENAI_BASE_URL && { baseURL: env.OPENAI_BASE_URL }),
    });
  }

  async *chat(params: ChatParams): AsyncIterable<ChatStreamEvent> {
    try {
      const stream = await this.client.chat.completions.create({
        model: env.OPENAI_MODEL,
        messages: params.messages,
        tools: params.tools && params.tools.length > 0 ? params.tools : undefined,
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

        // Check for completion
        if (choice.finish_reason === 'tool_calls') {
          // Emit completed tool calls
          for (const tc of toolCalls.values()) {
            yield { type: 'tool_call_end', toolCall: { ...tc } };
          }
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
