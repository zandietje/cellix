/**
 * Token counting and budget management utilities.
 * Uses gpt-tokenizer for accurate token counting.
 */

import { encode } from 'gpt-tokenizer';

/** Token limits for cost and context management */
export const TOKEN_LIMITS = {
  /** Maximum input tokens per request */
  MAX_INPUT_TOKENS: 8000,
  /** Maximum output tokens per response */
  MAX_OUTPUT_TOKENS: 4096,
  /** Reserved tokens for system prompt */
  SYSTEM_PROMPT_RESERVE: 2500,
  /** Maximum tokens per chat session */
  MAX_SESSION_TOKENS: 50000,
  /** Warning threshold (percentage of limit) */
  WARN_THRESHOLD: 0.8,
};

/**
 * Count tokens in a string using GPT tokenizer.
 */
export function countTokens(text: string): number {
  return encode(text).length;
}

/**
 * Truncate text to fit within a token limit.
 * Adds truncation indicator when text is shortened.
 */
export function truncateToTokenLimit(text: string, limit: number): string {
  const tokens = encode(text);
  if (tokens.length <= limit) {
    return text;
  }

  // Estimate character position based on token ratio
  // Reserve ~20 tokens for truncation indicator
  const targetTokens = limit - 20;
  const ratio = targetTokens / tokens.length;
  const estimatedCharPos = Math.floor(text.length * ratio);

  // Find a good break point (newline or space)
  let breakPos = estimatedCharPos;
  const searchStart = Math.max(0, estimatedCharPos - 100);
  const lastNewline = text.lastIndexOf('\n', estimatedCharPos);
  const lastSpace = text.lastIndexOf(' ', estimatedCharPos);

  if (lastNewline > searchStart) {
    breakPos = lastNewline;
  } else if (lastSpace > searchStart) {
    breakPos = lastSpace;
  }

  const truncated = text.slice(0, breakPos);
  return truncated + '\n\n...[Content truncated due to length]';
}

