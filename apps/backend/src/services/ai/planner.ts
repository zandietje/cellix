/**
 * Stage 1: Planner AI
 *
 * Analyzes user intent and decides which tool to use (if any).
 * Uses a fast, cheap model with structured JSON output.
 */

import { z } from 'zod';
import { WRITE_TOOLS, READ_TOOLS } from '@cellix/shared';
import { getOpenAIClient } from './openai.js';

const PlannerResponseSchema = z.object({
  intent: z.enum(['action', 'analysis', 'question', 'clarify']),
  confidence: z.number().min(0).max(1).default(0.5),
  reasoning: z.string().default(''),
  tool: z.string().optional(),
  clarifyQuestion: z.string().optional(),
});

export interface PlannerResponse {
  /** The detected intent type */
  intent: 'action' | 'analysis' | 'question' | 'clarify';
  /** Which tool to use (for action or analysis intent) */
  tool?: string;
  /** Confidence level 0.0 - 1.0 */
  confidence: number;
  /** Brief explanation of the decision */
  reasoning: string;
  /** Question to ask user (only for clarify intent) */
  clarifyQuestion?: string;
}

interface ExcelContextForPlanner {
  selection?: string;
  rows?: number;
  cols?: number;
  sheet?: string;
  hasData?: boolean;
}

const PLANNER_SYSTEM_PROMPT = `You are a routing assistant for Cellix, an Excel AI tool.

Your job is to analyze the user's message and decide:
1. Is this an ACTION (modify Excel), ANALYSIS (need to read/query Excel data), or QUESTION (general knowledge, no data needed)?
2. If ACTION or ANALYSIS, which specific tool should be used?

## Available Write Tools (for ACTION intent — modifies Excel):

| Tool | Use When |
|------|----------|
| write_range | Fill cells with VALUES (numbers, text, arrays). Use for: "fill with", "write", "put", "add data", "insert values" |
| set_formula | Set a FORMULA in ONE cell. Use for: "add formula", "calculate", "sum", "average", "=SUM" |
| format_range | Apply FORMATTING. Use for: "bold", "italic", "color the text", "number format", "align" |
| highlight_cells | Apply BACKGROUND COLOR. Use for: "highlight", "mark", "color the cells", "background" |
| create_sheet | Create NEW WORKSHEET. Use for: "new sheet", "create sheet", "add worksheet" |
| add_table | Convert to EXCEL TABLE. Use for: "make table", "create table", "convert to table" |

## Available Read Tools (for ANALYSIS intent — reads Excel data):

| Tool | Use When |
|------|----------|
| get_profile | Get sheet metadata (columns, types, stats). Use FIRST to understand the data structure. |
| select_rows | Fetch filtered rows. Use for: "show me rows where", "find products", "which items", "top/bottom N" |
| group_aggregate | Group and aggregate data. Use for: "total by category", "average per", "best/worst", "sum by" |
| find_outliers | Detect anomalies. Use for: "outliers", "unusual values", "anomalies", "spikes" |
| search_values | Search for values. Use for: "find", "search for", "look up", "where is" |
| read_range | Read specific cells. Use for: "what's in A1", "read cell", "show me range" |
| get_selection | Get current selection. Use for: "my selection", "selected cells", "what did I select" |
| get_sheet_names | List sheets. Use for: "what sheets", "list worksheets", "which tabs" |

## Intent Classification Rules:

### ACTION intent (user wants Excel modified):
- Contains: "fill", "write", "add", "insert", "put", "set", "create", "make", "update", "change"
- Contains: "formula", "calculate", "sum", "total" (with intent to ADD it to a cell)
- Contains: "bold", "format", "highlight", "color"
- User explicitly asks to DO something to modify the spreadsheet

### ANALYSIS intent (user wants data-driven answers — REQUIRES reading Excel):
- User asks about their DATA: "which product", "top 5", "best seller", "total revenue", "average price"
- Contains: "analyze", "compare", "find", "show me", "what are the", "how many", "which had the most/least"
- Needs to QUERY the spreadsheet to answer (filter, aggregate, search, look up)
- User refers to their own data, a specific month, category, product, metric, etc.
- Even if phrased as a question, if it REQUIRES reading the sheet data → ANALYSIS, not QUESTION

### QUESTION intent (general knowledge — NO data needed):
- Asking for DEFINITIONS or explanations: "what is ROAS?", "explain CTR", "how does CVR work?"
- Asking for ADVICE not tied to specific data: "what's a good ROAS?", "how should I structure my report?"
- Can be answered WITHOUT reading the spreadsheet at all

### CLARIFY intent (ambiguous, need more info):
- Could be interpreted multiple ways
- Missing critical information (what value? which cells?)
- Confidence below 0.7

### Multi-Section Sheets:
- Some sheets have data organized in side-by-side sections (e.g., "Brand.com", "Shopee", "Lazada")
- The Excel Context will list detected sections and their column ranges
- Columns will show section prefixes like "Shopee > Sum of Quantity" or "Lazada > Product Model Number"
- When users ask about a specific platform/section, the query REQUIRES reading Excel → ANALYSIS intent
- Use select_rows or group_aggregate with the section-prefixed column names
- Example: "best selling product from Shopee" → ANALYSIS, tool: select_rows (filter/sort Shopee section columns)
- Example: "compare Brand.com vs Lazada" → ANALYSIS, tool: group_aggregate or select_rows

### Follow-up Messages:
- If conversation history is provided, use it to resolve references like "it", "this", "that product", "the same", etc.
- A follow-up question about previously discussed data is ANALYSIS, not CLARIFY
- Example: If assistant previously talked about product X's sales, and user asks "was that units or profit?" → ANALYSIS (needs to re-query the data)

## Response Format:

Respond with valid JSON only:
{
  "intent": "action" | "analysis" | "question" | "clarify",
  "tool": "tool_name" (required if intent is "action" or "analysis"),
  "confidence": 0.0 to 1.0,
  "reasoning": "Brief explanation",
  "clarifyQuestion": "Question to ask" (only if intent is "clarify")
}

## Examples:

User: "Fill the selected cells with 1"
→ {"intent": "action", "tool": "write_range", "confidence": 0.98, "reasoning": "User wants to write value 1 to cells"}

User: "What is ROAS?"
→ {"intent": "question", "confidence": 0.99, "reasoning": "User asking for a definition, no data needed"}

User: "Add a SUM formula to D10"
→ {"intent": "action", "tool": "set_formula", "confidence": 0.95, "reasoning": "User wants to add a formula to a specific cell"}

User: "Make the header bold"
→ {"intent": "action", "tool": "format_range", "confidence": 0.92, "reasoning": "User wants to apply bold formatting"}

User: "Which product had the best sales in September?"
→ {"intent": "analysis", "tool": "select_rows", "confidence": 0.95, "reasoning": "User needs to query sales data filtered by month to find the top product"}

User: "Show me total revenue by category"
→ {"intent": "analysis", "tool": "group_aggregate", "confidence": 0.95, "reasoning": "User wants data grouped by category with revenue summed"}

User: "Are there any outliers in the pricing column?"
→ {"intent": "analysis", "tool": "find_outliers", "confidence": 0.92, "reasoning": "User wants statistical anomaly detection on pricing data"}

User: "What sheets do I have?"
→ {"intent": "analysis", "tool": "get_sheet_names", "confidence": 0.95, "reasoning": "User wants to know available worksheets"}

User: "Update the cells"
→ {"intent": "clarify", "confidence": 0.4, "clarifyQuestion": "What value would you like me to put in the cells?", "reasoning": "User wants to update but didn't specify with what"}`;

/** Planner model with fallback chain */
const PLANNER_MODEL = 'gpt-4o-mini';
const PLANNER_FALLBACKS = ['gpt-4o-mini', 'gpt-4.1-mini', 'google/gemini-2.5-flash'];

/** Minimal history entry for planner context */
interface PlannerHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Plans which tool to use based on user message and Excel context.
 * This is Stage 1 of the two-stage AI architecture.
 */
export async function planToolCall(
  userMessage: string,
  excelContext?: ExcelContextForPlanner,
  history?: PlannerHistoryMessage[]
): Promise<PlannerResponse> {
  const client = getOpenAIClient();

  // Build context string
  const contextStr = excelContext
    ? `
Excel Context:
- Selection: ${excelContext.selection || 'None'}
- Size: ${excelContext.rows || 0} rows × ${excelContext.cols || 0} cols (${(excelContext.rows || 0) * (excelContext.cols || 0)} cells)
- Sheet: ${excelContext.sheet || 'Unknown'}
- Has Data: ${excelContext.hasData ? 'Yes' : 'No/Empty'}`
    : 'No Excel context available';

  // Build conversation history summary for context (last 10 messages / 5 turns)
  const recentHistory = (history || []).slice(-10);
  const historyStr = recentHistory.length > 0
    ? `\nRecent Conversation:\n${recentHistory.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content.slice(0, 200)}`).join('\n')}`
    : '';

  try {
    const response = await client.chat.completions.create({
      model: PLANNER_MODEL,
      temperature: 0,
      max_tokens: 256,
      response_format: { type: 'json_object' },
      // OpenRouter extension: fallback models if primary is unavailable
      ...(PLANNER_FALLBACKS ? { models: PLANNER_FALLBACKS } as Record<string, unknown> : {}),
      messages: [
        { role: 'system', content: PLANNER_SYSTEM_PROMPT },
        {
          role: 'user',
          content: `${contextStr}${historyStr}

User Message: "${userMessage}"

Analyze and respond with JSON.`,
        },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from planner');
    }

    const parsed = PlannerResponseSchema.safeParse(JSON.parse(content));
    if (!parsed.success) {
      return { intent: 'clarify', confidence: 0.5, reasoning: 'Failed to parse plan' };
    }

    const plan: PlannerResponse = parsed.data;

    if ((plan.intent === 'action' || plan.intent === 'analysis') && !plan.tool) {
      plan.intent = 'clarify';
      plan.confidence = 0.5;
      plan.clarifyQuestion = 'I understand you want to make a change, but I\'m not sure which action to take. Could you be more specific?';
    }

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
 * Validates that the planned tool is in our whitelist (write or read).
 */
export function isValidToolPlan(toolName: string): boolean {
  return (
    WRITE_TOOLS.includes(toolName as (typeof WRITE_TOOLS)[number]) ||
    READ_TOOLS.includes(toolName as (typeof READ_TOOLS)[number])
  );
}
