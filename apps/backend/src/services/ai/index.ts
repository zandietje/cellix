/**
 * AI service exports and provider factory.
 */

import { OpenAIProvider } from './openai.js';
import type { AIProvider } from './types.js';

export * from './types.js';
export { SYSTEM_PROMPT } from './prompt.js';
export { formatExcelContext } from './context.js';

let providerInstance: AIProvider | null = null;

/**
 * Get the AI provider instance (singleton).
 * Currently only OpenAI is supported; Claude can be added later.
 */
export function getAIProvider(): AIProvider {
  if (!providerInstance) {
    providerInstance = new OpenAIProvider();
  }
  return providerInstance;
}
