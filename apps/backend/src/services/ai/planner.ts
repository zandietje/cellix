/**
 * Stage 1: Planner AI
 *
 * Analyzes user intent and decides which tool to use (if any).
 * Uses a fast, cheap model with structured JSON output.
 */

import OpenAI from 'openai';
import { env } from '../../lib/env.js';
import { WRITE_TOOLS } from '@cellix/shared';

export interface PlannerResponse {
  /** The detected intent type */
  intent: 'action' | 'question' | 'clarify';
  /** Which tool to use (only for action intent) */
  tool?: string;
  /** Confidence level 0.0 - 1.0 */
  confidence: number;
  /** Brief explanation of the decision */
  reasoning: string;
  /** Question to ask user (only for clarify intent) */
  clarifyQuestion?: string;
}

export interface ExcelContextForPlanner {
  selection?: string;
  rows?: number;
  cols?: number;
  sheet?: string;
  hasData?: boolean;
}

const PLANNER_SYSTEM_PROMPT = `You are a routing assistant for Cellix, an Excel AI tool.

Your job is to analyze the user's message and decide:
1. Is this an ACTION request (user wants to modify Excel) or a QUESTION (user wants information/explanation)?
2. If ACTION, which specific tool should be used?

## Available Tools (for ACTION intent only):

| Tool | Use When |
|------|----------|
| write_range | Fill cells with VALUES (numbers, text, arrays). Use for: "fill with", "write", "put", "add data", "insert values" |
| set_formula | Set a FORMULA in ONE cell. Use for: "add formula", "calculate", "sum", "average", "=SUM" |
| format_range | Apply FORMATTING. Use for: "bold", "italic", "color the text", "number format", "align" |
| highlight_cells | Apply BACKGROUND COLOR. Use for: "highlight", "mark", "color the cells", "background" |
| create_sheet | Create NEW WORKSHEET. Use for: "new sheet", "create sheet", "add worksheet" |
| add_table | Convert to EXCEL TABLE. Use for: "make table", "create table", "convert to table" |

## Intent Classification Rules:

### ACTION intent (user wants Excel modified):
- Contains: "fill", "write", "add", "insert", "put", "set", "create", "make", "update", "change"
- Contains: "formula", "calculate", "sum", "total" (with intent to ADD it)
- Contains: "bold", "format", "highlight", "color"
- User explicitly asks to DO something to the data

### QUESTION intent (user wants information only):
- Contains: "what is", "what's", "explain", "how do", "why", "tell me about"
- Contains: "show me", "compare", "analyze", "is this good", "should I"
- User asks about data WITHOUT wanting to change it
- Asking for advice, recommendations, or explanations

### CLARIFY intent (ambiguous, need more info):
- Could be interpreted multiple ways
- Missing critical information (what value? which cells?)
- Confidence below 0.7

## Response Format:

Respond with valid JSON only:
{
  "intent": "action" | "question" | "clarify",
  "tool": "tool_name" (only if intent is "action"),
  "confidence": 0.0 to 1.0,
  "reasoning": "Brief explanation",
  "clarifyQuestion": "Question to ask" (only if intent is "clarify")
}

## Examples:

User: "Fill the selected cells with 1"
→ {"intent": "action", "tool": "write_range", "confidence": 0.98, "reasoning": "User wants to write value 1 to cells"}

User: "What is ROAS?"
→ {"intent": "question", "confidence": 0.99, "reasoning": "User asking for explanation, not modification"}

User: "Add a SUM formula to D10"
→ {"intent": "action", "tool": "set_formula", "confidence": 0.95, "reasoning": "User wants to add a formula to a specific cell"}

User: "Make the header bold"
→ {"intent": "action", "tool": "format_range", "confidence": 0.92, "reasoning": "User wants to apply bold formatting"}

User: "Show me the sales"
→ {"intent": "question", "confidence": 0.85, "reasoning": "User wants to see/understand data, not modify it"}

User: "Update the cells"
→ {"intent": "clarify", "confidence": 0.4, "clarifyQuestion": "What value would you like me to put in the cells?", "reasoning": "User wants to update but didn't specify with what"}`;

/**
 * Plans which tool to use based on user message and Excel context.
 * This is Stage 1 of the two-stage AI architecture.
 */
export async function planToolCall(
  userMessage: string,
  excelContext?: ExcelContextForPlanner
): Promise<PlannerResponse> {
  const client = new OpenAI({
    apiKey: env.OPENAI_API_KEY,
    ...(env.OPENAI_BASE_URL && { baseURL: env.OPENAI_BASE_URL }),
  });

  // Build context string
  const contextStr = excelContext
    ? `
Excel Context:
- Selection: ${excelContext.selection || 'None'}
- Size: ${excelContext.rows || 0} rows × ${excelContext.cols || 0} cols (${(excelContext.rows || 0) * (excelContext.cols || 0)} cells)
- Sheet: ${excelContext.sheet || 'Unknown'}
- Has Data: ${excelContext.hasData ? 'Yes' : 'No/Empty'}`
    : 'No Excel context available';

  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini', // Fast and cheap for classification
      temperature: 0, // Deterministic
      max_tokens: 256,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: PLANNER_SYSTEM_PROMPT },
        {
          role: 'user',
          content: `${contextStr}

User Message: "${userMessage}"

Analyze and respond with JSON.`,
        },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from planner');
    }

    const plan = JSON.parse(content) as PlannerResponse;

    // Validate the response
    if (!plan.intent || !['action', 'question', 'clarify'].includes(plan.intent)) {
      plan.intent = 'clarify';
      plan.confidence = 0.5;
      plan.clarifyQuestion = 'Could you please clarify what you would like me to do?';
    }

    if (plan.intent === 'action' && !plan.tool) {
      plan.intent = 'clarify';
      plan.confidence = 0.5;
      plan.clarifyQuestion = 'I understand you want to make a change, but I\'m not sure which action to take. Could you be more specific?';
    }

    // Ensure confidence is a number
    plan.confidence = typeof plan.confidence === 'number' ? plan.confidence : 0.5;

    return plan;
  } catch (error) {
    console.error('[Planner] Error:', error);

    // Fallback: return clarify intent
    return {
      intent: 'clarify',
      confidence: 0.3,
      reasoning: 'Failed to analyze intent',
      clarifyQuestion: 'I had trouble understanding your request. Could you please rephrase it?',
    };
  }
}

/**
 * Validates that the planned tool is in our whitelist.
 */
export function isValidToolPlan(toolName: string): boolean {
  return WRITE_TOOLS.includes(toolName as (typeof WRITE_TOOLS)[number]);
}
