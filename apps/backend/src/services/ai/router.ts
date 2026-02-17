/**
 * Intelligent model router.
 * Selects the optimal model based on query complexity and intent.
 *
 * The tier classifier is a pure lookup on the planner's structured JSON output —
 * no regex or keyword matching on the user's message. This makes it fully
 * language-independent (English, Thai, Dutch, etc.).
 */

import type { PlannerResponse } from './planner.js';

export type ModelTier = 'simple' | 'standard' | 'complex' | 'reasoning';

export interface TierConfig {
  tier: ModelTier;
  model: string;
  fallbacks: string[];
  temperature: number;
  description: string;
}

export const MODEL_TIERS: Record<ModelTier, TierConfig> = {
  simple: {
    tier: 'simple',
    model: 'gpt-4.1-nano',
    fallbacks: ['gpt-4.1-nano', 'google/gemini-2.5-flash', 'gpt-4.1-mini'],
    temperature: 0.7,
    description: 'Fast, cheap — definitions, simple questions, greetings',
  },
  standard: {
    tier: 'standard',
    model: 'gpt-4.1-mini',
    fallbacks: ['gpt-4.1-mini', 'gpt-4o-mini', 'google/gemini-2.5-flash'],
    temperature: 0.5,
    description: 'Balanced — single tool calls, basic read operations',
  },
  complex: {
    tier: 'complex',
    model: 'gpt-4.1',
    fallbacks: ['gpt-4.1', 'gpt-4o', 'anthropic/claude-sonnet-4-20250514'],
    temperature: 0.3,
    description: 'Powerful — write operations, formulas, multi-step tasks',
  },
  reasoning: {
    tier: 'reasoning',
    model: 'deepseek/deepseek-reasoner',
    fallbacks: ['deepseek/deepseek-reasoner', 'anthropic/claude-sonnet-4-20250514', 'gpt-4.1'],
    temperature: 0.2,
    description: 'Deep analysis — math, aggregations, anomaly detection',
  },
};

/**
 * Classify which model tier to use based on planner output.
 *
 * This is a pure lookup — no regex or keyword matching on the user's message.
 * The planner (LLM) handles language understanding (English, Thai, etc.)
 * and returns structured intent/tool/confidence. We just map that to a tier.
 *
 * When uncertain, we always upgrade (standard -> complex) rather than
 * downgrade. A wasted $0.01 beats a wrong answer.
 */
export function classifyTier(plan: PlannerResponse): ModelTier {
  // Write operations always need a capable model
  if (plan.intent === 'action') {
    return 'complex';
  }

  // Clarify intent — just asking a follow-up question, cheap model is fine
  if (plan.intent === 'clarify') {
    return 'simple';
  }

  // Pure knowledge questions — no tool calls, just text response
  if (plan.intent === 'question') {
    return plan.confidence >= 0.8 ? 'simple' : 'standard';
  }

  // Analysis intent — needs to read and interpret data
  if (plan.intent === 'analysis') {
    // Low confidence: planner isn't sure what to do -> use capable model
    if (plan.confidence < 0.7) {
      return 'complex';
    }

    // Math/aggregation tools need strong reasoning
    const reasoningTools = ['group_aggregate', 'find_outliers'];
    if (plan.tool && reasoningTools.includes(plan.tool)) {
      return 'reasoning';
    }

    // All other analysis (select_rows, search_values, read_range, etc.)
    return 'standard';
  }

  // Unknown intent — safe default
  return 'standard';
}

/**
 * Classify which model tier to use for continuation requests.
 * When tool results contain data that needs mathematical interpretation,
 * upgrades the model to ensure accurate analysis.
 */
export function classifyContinuationTier(
  toolResults: Array<{ toolCallId: string; content: string }>,
): ModelTier {
  const totalContentSize = toolResults.reduce((sum, tr) => sum + tr.content.length, 0);

  // Large result sets need better interpretation
  if (totalContentSize > 2000) return 'reasoning';

  // Results containing substantial numbers need at least standard
  const hasNumbers = toolResults.some(tr => /\d{3,}/.test(tr.content));
  if (hasNumbers) return 'standard';

  return 'standard';
}
