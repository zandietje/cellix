# PRP: Intelligent Model Routing & Cost Optimization

## Overview

Replace the current single-model-with-manual-selector approach with an intelligent tiered routing system that automatically selects the optimal model for each query. Combined with prompt caching and model fallbacks, this should reduce AI costs by ~80% while improving response quality for complex tasks.

## Context

- **Phase:** Post-MVP (AI Infrastructure)
- **Dependencies:** Phase 4 (Tool Execution), existing planner+executor architecture
- **Estimated Effort:** 1-2 weeks (3 sub-phases, can ship incrementally)

### Current Architecture

```
User Message → Planner (gpt-4o-mini, hardcoded) → Executor (user-selected model)
```

**Problems:**
1. Users must manually pick a model — they don't know which is best for what
2. Simple questions ("what is ROAS?") burn expensive tokens on GPT-4o
3. Complex analysis on GPT-4o Mini produces wrong answers (e.g., confusing row counts with sums)
4. Write operations on small models drop required parameters
5. System prompt + tool definitions (~3-4K tokens) sent fresh every request — no caching
6. No fallback when a model/provider is down

### Target Architecture

```
User Message
    → Planner (gpt-4o-mini, ~$0.001)
        → classifyTier(plannerResult, message) [rule-based, free]
            → SIMPLE:    GPT-4.1 Nano    (~$0.001/query)
            → STANDARD:  GPT-4.1 Mini    (~$0.003/query)
            → COMPLEX:   GPT-4.1 / Sonnet (~$0.02/query)
            → REASONING: DeepSeek R1      (~$0.03/query)
```

**Expected savings:** ~80% vs. using GPT-4o for everything.

**Language support:** Fully language-independent. The planner (LLM) understands Thai, English, Dutch, and any other language. The tier classifier is a pure lookup on the planner's structured JSON output — no regex or keyword matching on the user's message.

### Related Files

| File | Purpose |
|------|---------|
| `apps/backend/src/routes/chat.ts` | SSE streaming endpoints, planner→executor flow |
| `apps/backend/src/services/ai/openai.ts` | OpenAI-compatible provider (OpenRouter) |
| `apps/backend/src/services/ai/planner.ts` | Stage 1 planner — intent + tool selection |
| `apps/backend/src/services/ai/types.ts` | ChatParams, AIProvider interface |
| `apps/backend/src/services/ai/prompt.ts` | System prompt construction |
| `apps/backend/src/services/ai/context.ts` | Excel context formatting |
| `apps/backend/src/lib/env.ts` | Environment variables (API key, base URL, model) |
| `apps/addin/src/store/chatStore.ts` | AVAILABLE_MODELS, DEFAULT_MODEL, model state |
| `apps/addin/src/components/controls/ControlPanel.tsx` | Model selector dropdown |
| `apps/addin/src/lib/api.ts` | Frontend API client |

---

## Sub-Phase A: Quick Wins (Prompt Caching + Model Fallbacks)

**Effort:** 2-3 hours. Ship independently. Immediate cost savings.

### A1: Prompt Caching

The system prompt + tool definitions (~3-4K tokens) are sent identically with every request. OpenRouter charges cached tokens at 0.25x. Anthropic models get 90% off, OpenAI models get 75% off — but only if the cacheable content is placed at the START of the messages array (which it already is).

#### Changes

**File: `apps/backend/src/services/ai/openai.ts`**

For Anthropic models routed through OpenRouter, add `cache_control` breakpoints. OpenRouter passes these through to Anthropic's API.

```typescript
// In the chat() method, before creating the stream:
// Add cache_control for Anthropic models to enable prompt caching
const modelStr = params.model || env.OPENAI_MODEL;
const isAnthropic = modelStr.includes('claude');

let messagesWithCaching = params.messages;
if (isAnthropic && messagesWithCaching.length > 0) {
  // Mark the system message for caching (it's static across requests)
  messagesWithCaching = messagesWithCaching.map((msg, i) => {
    if (i === 0 && msg.role === 'system') {
      return { ...msg, cache_control: { type: 'ephemeral' } };
    }
    return msg;
  });
}
```

For OpenAI/DeepSeek/Gemini models, prompt caching is automatic — no code changes needed. OpenRouter handles it transparently.

**File: `apps/backend/src/services/ai/prompt.ts`**

Ensure the system prompt is deterministic (no timestamps, no random elements) so the cache key is stable across requests. Move any dynamic content (Excel context) to a separate user message or append it after the cacheable prefix.

Restructure message order:
```
1. System message: SYSTEM_PROMPT + tool definitions  ← CACHEABLE (static)
2. System message: Excel context                     ← DYNAMIC (changes per request)
3. History messages
4. User message
```

Currently Excel context is appended to the system prompt string. Split it into a separate message so the base system prompt remains cache-stable.

### A2: Model Fallbacks via OpenRouter

When the primary model is unavailable (rate limited, provider down), fall back to an equivalent model automatically.

#### Changes

**File: `apps/backend/src/services/ai/openai.ts`**

Add a fallback model list to the OpenRouter request body. OpenRouter's `models` parameter tries each in order:

```typescript
// Define fallback chains per model tier
const MODEL_FALLBACKS: Record<string, string[]> = {
  // Nano tier
  'gpt-4.1-nano': ['gpt-4.1-nano', 'google/gemini-2.5-flash', 'gpt-4.1-mini'],
  // Mini tier
  'gpt-4.1-mini': ['gpt-4.1-mini', 'google/gemini-2.5-flash', 'gpt-4o-mini'],
  'gpt-4o-mini': ['gpt-4o-mini', 'gpt-4.1-mini', 'google/gemini-2.5-flash'],
  // Standard tier
  'gpt-4.1': ['gpt-4.1', 'gpt-4o', 'anthropic/claude-sonnet-4-20250514'],
  'gpt-4o': ['gpt-4o', 'gpt-4.1', 'anthropic/claude-sonnet-4-20250514'],
  // Premium tier
  'claude-sonnet-4-20250514': ['anthropic/claude-sonnet-4-20250514', 'gpt-4.1', 'gpt-4o'],
};

// In the create() call, add the models array:
const stream = await this.client.chat.completions.create({
  model: params.model || env.OPENAI_MODEL,
  // @ts-expect-error -- OpenRouter extension, not in OpenAI types
  models: MODEL_FALLBACKS[params.model || env.OPENAI_MODEL],
  // ... rest of params
});
```

**Note:** The `models` parameter is an OpenRouter extension. If using the raw OpenAI SDK, it needs to be passed as an extra body field. The OpenAI SDK allows extra body params via `{ ...params, models: [...] }` — verify this works with the current SDK version.

### A3: Planner Model Fallback

The planner currently hardcodes `gpt-4o-mini`. If this model is down, the entire chat breaks. Add a fallback.

**File: `apps/backend/src/services/ai/planner.ts`**

```typescript
// Replace hardcoded model with fallback chain
const PLANNER_MODEL = 'gpt-4o-mini';
const PLANNER_FALLBACKS = ['gpt-4o-mini', 'gpt-4.1-mini', 'google/gemini-2.5-flash'];
```

---

## Sub-Phase B: Tiered Model Routing

**Effort:** 1-2 days. The core feature.

### B1: Define Model Tiers

**New file: `apps/backend/src/services/ai/router.ts`**

```typescript
/**
 * Intelligent model router.
 * Selects the optimal model based on query complexity and intent.
 */

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
    fallbacks: ['google/gemini-2.5-flash', 'gpt-4.1-mini'],
    temperature: 0.7,
    description: 'Fast, cheap — definitions, simple questions, greetings',
  },
  standard: {
    tier: 'standard',
    model: 'gpt-4.1-mini',
    fallbacks: ['gpt-4o-mini', 'google/gemini-2.5-flash'],
    temperature: 0.5,
    description: 'Balanced — single tool calls, basic read operations',
  },
  complex: {
    tier: 'complex',
    model: 'gpt-4.1',
    fallbacks: ['gpt-4o', 'anthropic/claude-sonnet-4-20250514'],
    temperature: 0.3,
    description: 'Powerful — write operations, formulas, multi-step tasks',
  },
  reasoning: {
    tier: 'reasoning',
    model: 'deepseek/deepseek-reasoner',
    fallbacks: ['anthropic/claude-sonnet-4-20250514', 'gpt-4.1'],
    temperature: 0.2,
    description: 'Deep analysis — math, aggregations, anomaly detection',
  },
};
```

### B2: Route Classification

The tier classifier is a **pure lookup table** on the planner's structured output — no regex, no keyword matching on the user's message. This is critical because:

1. **Language-independent**: Users will write in Thai, English, or mixed. Regex patterns only work for English. The planner (an LLM) understands all languages and outputs a structured JSON with `intent`, `tool`, and `confidence`. The tier classifier only reads those fields.
2. **Deterministic**: Given the same planner output, the tier is always the same. No ambiguity.
3. **Safe default direction**: When uncertain (low confidence), the classifier upgrades to a higher tier. Wasting $0.01 on a complex model for a simple query is far better than giving a wrong answer with a cheap model.

**In the same file: `apps/backend/src/services/ai/router.ts`**

```typescript
import type { PlannerResponse } from './planner.js';

/**
 * Classify which model tier to use based on planner output.
 *
 * This is a pure lookup — no regex or keyword matching on the user's message.
 * The planner (LLM) handles language understanding (English, Thai, etc.)
 * and returns structured intent/tool/confidence. We just map that to a tier.
 *
 * When uncertain, we always upgrade (standard → complex) rather than
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
    // High confidence: planner is sure this is a simple knowledge question
    // Low confidence: might actually need data analysis, play it safe
    return plan.confidence >= 0.8 ? 'simple' : 'standard';
  }

  // Analysis intent — needs to read and interpret data
  if (plan.intent === 'analysis') {
    // Low confidence: planner isn't sure what to do → use capable model
    if (plan.confidence < 0.7) {
      return 'complex';
    }

    // Math/aggregation tools need strong reasoning
    const reasoningTools = ['group_aggregate', 'find_outliers'];
    if (plan.tool && reasoningTools.includes(plan.tool)) {
      return 'reasoning';
    }

    // All other analysis (select_rows, search_values, read_range, etc.)
    // Standard tier handles tool calling well; the continuation router
    // (Sub-Phase C) will upgrade if the tool results need deeper math
    return 'standard';
  }

  // Unknown intent — safe default
  return 'standard';
}
```

**Why no regex?** The previous design used English regex patterns like `/\b(sum|total|average)\b/i` to detect reasoning queries. This fails for Thai ("คำนวณยอดรวม" = "calculate the total"), Dutch, or any non-English input. Since the planner already uses an LLM that understands all languages, we rely entirely on its structured output.

### B3: Integrate Router into Chat Endpoint

**File: `apps/backend/src/routes/chat.ts`**

Replace the current model selection logic (including the `SMALL_MODELS` / `UPGRADE_TARGET` block) with the router:

```typescript
import { classifyTier, MODEL_TIERS } from '../services/ai/router.js';

// After planner returns (around line 210):
const tier = classifyTier(plan);
const tierConfig = MODEL_TIERS[tier];

// Use tier model (ignore user-selected model for the executor)
const effectiveModel = tierConfig.model;

fastify.log.info({
  msg: 'Router decision',
  tier,
  model: effectiveModel,
  intent: plan.intent,
  tool: plan.tool,
});

// Notify user which tier was selected
reply.raw.write(`data: ${JSON.stringify({
  type: 'text',
  content: '', // Could optionally show: `*Using ${tierConfig.description}*\n\n`
})}\n\n`);

// Pass to executor
for await (const event of provider.chat({
  messages,
  tools,
  toolChoice,
  temperature: tierConfig.temperature,
  model: effectiveModel,
  // @ts-expect-error OpenRouter extension
  models: tierConfig.fallbacks,
})) {
  // ... existing streaming logic
}
```

### B4: Remove Model Selector — Backend Always Auto-Routes

The model selector is removed entirely from the frontend. The backend's tier router is the sole decision-maker. This simplifies the UX (users shouldn't need to think about models) and prevents users from accidentally picking a weak model for complex tasks.

#### Frontend Changes

**File: `apps/addin/src/store/chatStore.ts`**

Remove `AVAILABLE_MODELS`, `DEFAULT_MODEL`, the `model` state field, and the `setModel` action. Remove `model` from all API calls.

```typescript
// DELETE: AVAILABLE_MODELS, DEFAULT_MODEL
// DELETE: model field from ChatState
// DELETE: setModel action
```

**File: `apps/addin/src/components/controls/ControlPanel.tsx`**

Remove the model selector dropdown entirely from the UI.

**File: `apps/addin/src/lib/api.ts`**

Remove the `model` parameter from `streamChat()` and `continueChat()` request bodies.

**File: `apps/addin/src/components/chat/ChatPane.tsx`**

Remove `model` from the `useChatStore` destructure. Remove it from `streamChat()` and `continueChat()` calls.

#### Backend Changes

**File: `apps/backend/src/routes/chat.ts`**

Remove `model` from the `chatRequestSchema` and `chatContinueSchema` Zod schemas. The router determines the model — no frontend input needed.

```typescript
// DELETE from chatRequestSchema:
//   model: z.string().optional(),
// DELETE from chatContinueSchema:
//   model: z.string().optional(),

// The executor always uses the router's decision:
const tier = classifyTier(plan, message);
const tierConfig = MODEL_TIERS[tier];
const effectiveModel = tierConfig.model;
```

Also remove the `SMALL_MODELS` / `UPGRADE_TARGET` model guard block added earlier — it's superseded by the tier router (write operations always route to the `complex` tier).

### B5: Tier Indicator in Chat UI (Optional)

Show a subtle badge on assistant messages indicating which tier/model was used. Useful for debugging and user trust.

**File: `apps/backend/src/routes/chat.ts`**

Send the tier info as a `session` SSE event (or a new `metadata` event type):

```typescript
reply.raw.write(`data: ${JSON.stringify({
  type: 'session',
  sessionId: activeSessionId,
  tier,
  model: effectiveModel,
})}\n\n`);
```

**File: `apps/addin/src/components/chat/MessageList.tsx`**

Display a small tag like `⚡ Nano` or `🧠 Reasoning` next to the timestamp.

---

## Sub-Phase C: Continuation Router (Analysis Quality Fix)

**Effort:** Half a day. Fixes the "sum = row count" bug class.

### Problem

The continuation endpoint (`/api/chat/continue`) always uses the same model the user selected. When tool results come back from read operations, the AI needs to INTERPRET those results (sum values, find patterns, explain data). GPT-4o Mini misread the row count as a sum.

### Solution

Apply the router to continuation requests too. When tool results contain data that needs mathematical interpretation, upgrade the continuation model.

**File: `apps/backend/src/routes/chat.ts`** (in the `/chat/continue` handler)

```typescript
// Analyze tool results to decide continuation model
function classifyContinuationTier(
  toolResults: Array<{ toolCallId: string; content: string }>,
  originalModel?: string,
): ModelTier {
  // If tool results contain large data sets, use reasoning tier
  const totalContentSize = toolResults.reduce((sum, tr) => sum + tr.content.length, 0);

  // Large result sets need better interpretation
  if (totalContentSize > 2000) return 'reasoning';

  // Results mentioning numbers/data need at least standard
  const hasNumbers = toolResults.some(tr => /\d{3,}/.test(tr.content));
  if (hasNumbers) return 'standard';

  return 'standard'; // Default for continuations
}
```

---

## Cost Analysis

Assumptions: 10-message session. Each message averages ~3K system prompt tokens (cacheable), ~1.6K context/history tokens, ~100 user message tokens, ~500 output tokens, ~600 tool tokens.

### Strategy 1: GPT-4o for everything, no caching (baseline)

GPT-4o: $2.50 input / $10.00 output per MTok

| Component | Tokens | Cost |
|-----------|--------|------|
| System prompt (10 calls) | 30K in | $0.075 |
| Context + messages | 16K in | $0.040 |
| Output | 5K out | $0.050 |
| Tool overhead | 6K mixed | $0.030 |
| **Total per session** | | **~$0.195** |
| **Per 1,000 sessions/month** | | **~$195** |

### Strategy 2: GPT-4o + prompt caching only (Sub-Phase A)

System prompt cached after first call (0.25x via OpenRouter).

| Component | Tokens | Cost |
|-----------|--------|------|
| System prompt (1 fresh + 9 cached) | 3K + 27K×0.25 | $0.024 |
| Context + messages | 16K in | $0.040 |
| Output | 5K out | $0.050 |
| Tool overhead | 6K mixed | $0.030 |
| **Total per session** | | **~$0.144** |
| **Per 1,000 sessions/month** | | **~$144** |

### Strategy 3: GPT-4o Mini for everything, no caching (current setup)

GPT-4o Mini: $0.15 input / $0.60 output per MTok

| Component | Tokens | Cost |
|-----------|--------|------|
| System prompt (10 calls) | 30K in | $0.005 |
| Context + messages | 16K in | $0.002 |
| Output | 5K out | $0.003 |
| Tool overhead | 6K mixed | $0.002 |
| **Total per session** | | **~$0.012** |
| **Per 1,000 sessions/month** | | **~$12** |

**Cheapest, but produces wrong answers** — wrong sums, dropped formula parameters, bad tool calls on complex tasks.

### Strategy 4: Tiered routing + prompt caching (this PRP)

Assumes: 60% simple, 25% standard, 10% complex, 5% reasoning.

| Tier | Messages | Model | In Cost | Out Cost | Total |
|------|----------|-------|---------|----------|-------|
| Simple (6 msgs) | 6 × 4.6K in, 3K out | Nano $0.10/$0.40 | $0.003 | $0.001 | $0.004 |
| Standard (2.5 msgs) | 2.5 × 4.6K in, 1.25K out | Mini $0.40/$1.60 | $0.005 | $0.002 | $0.007 |
| Complex (1 msg) | 1 × 4.6K in, 0.5K out | GPT-4.1 $2/$8 | $0.009 | $0.004 | $0.013 |
| Reasoning (0.5 msg) | 0.5 × 4.6K in, 0.5K out | DeepSeek R1 $0.55/$2.19 | $0.001 | $0.001 | $0.002 |
| Prompt caching savings | ~27K cached tokens | 75% off | | | -$0.005 |
| **Total per session** | | | | | **~$0.017** |
| **Per 1,000 sessions/month** | | | | | **~$17** |

### Comparison Summary

| Strategy | Per session | Per 1,000 sessions | Quality | vs GPT-4o savings |
|----------|-----------|--------------------|---------|--------------------|
| GPT-4o (no caching) | $0.195 | $195 | Good | — |
| GPT-4o + caching | $0.144 | $144 | Good | 26% cheaper |
| GPT-4o Mini (current) | $0.012 | $12 | **Poor** — wrong answers on complex tasks | 94% cheaper |
| **Tiered routing + caching** | **$0.017** | **$17** | **Good** — right model for each task | **91% cheaper** |

### Key Takeaways

- **vs GPT-4o**: 91% cheaper ($195 → $17) with equivalent quality. The router sends only ~15% of queries to expensive models.
- **vs GPT-4o Mini (current)**: Only $5/month more ($12 → $17) but with correct answers on complex tasks. The $5 buys you GPT-4.1 and DeepSeek R1 for the queries that actually need them.
- **Prompt caching alone** saves 26% on any strategy — easiest quick win.

---

## Implementation Order

| Step | What | Effort | Can Ship Alone |
|------|------|--------|----------------|
| A1 | Prompt caching (split system prompt) | 1-2 hours | Yes |
| A2 | Model fallbacks via OpenRouter | 1 hour | Yes |
| A3 | Planner model fallback | 30 min | Yes |
| B1-B2 | Define tiers + classifier | 2-3 hours | No (needs B3) |
| B3 | Integrate router into chat endpoint | 2-3 hours | Yes (with B1-B2) |
| B4 | Frontend: Remove model selector, strip `model` from API | 1 hour | Yes (with B3) |
| B5 | Tier badge in UI (optional) | 1-2 hours | Yes |
| C | Continuation router for analysis quality | 2-3 hours | Yes |

**Recommended order:** A1 → A2 → A3 → B1+B2+B3 → B4 → C → B5

---

## Testing

### Manual Tests

1. **Prompt caching**: Send the same query twice. Check OpenRouter dashboard — second request should show cached input tokens at 0.25x price.
2. **Fallbacks**: Temporarily set primary model to a nonexistent model slug. Verify the fallback model handles the request.
3. **Tier routing**:
   - "What is ROAS?" → should route to `simple` (Nano)
   - "Read cell A1" → should route to `standard` (Mini)
   - "Write a discount formula in column Z" → should route to `complex` (GPT-4.1)
   - "Sum all values in column E and tell me the average" → should route to `reasoning` (DeepSeek R1)
4. **Model selector removed**: Verify the model dropdown is gone from the ControlPanel. No `model` field in API requests.
5. **Continuation quality**: Ask "sum from selected cells" → continuation should use at least `standard` tier to interpret results correctly (no more row-count-as-sum errors).

### Logging

Add structured logs for every routed request:
```
{ tier: 'simple', model: 'gpt-4.1-nano', intent: 'question', latency_ms: 340 }
```

This data enables future tuning of tier thresholds.

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Router misclassifies (sends complex task to Nano) | Continuation router upgrades when interpreting results. Planner confidence < 0.7 defaults to complex tier. Log all routing decisions for tuning. |
| DeepSeek R1 slow for reasoning tier | Add timeout; fall back to GPT-4.1 if >15s. |
| OpenRouter `models` fallback array not supported by all providers | Test with each provider. Worst case: catch error and retry manually with next model. |
| Prompt cache miss rate high (context changes every message) | Split static system prompt from dynamic context. Cache hit rate should be >80% for the static portion. |
| New models released, tier config becomes stale | Keep tier config in a single file (`router.ts`). Easy to update model slugs. |
| Planner misclassifies Thai queries | GPT-4o-mini handles Thai well, but test with real Thai ecommerce queries. If planner accuracy drops for Thai, consider upgrading planner model to GPT-4.1-mini or adding Thai examples to the planner prompt. |

---

## Future Enhancements (Not in This PRP)

- **Analytics dashboard**: Track cost per tier, cache hit rates, model quality scores
- **Adaptive routing**: Use response quality signals (user thumbs up/down, retry rate) to tune tier thresholds
- **Batch API for profiling**: Use Anthropic/OpenAI batch endpoints (50% off) for background sheet analysis
- **Evaluator-optimizer for formulas**: Second model verifies formula correctness before preview
