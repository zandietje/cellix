# AI Tools Agent

Specialized agent for AI tool definitions, schemas, and validation.

## Metadata

- **Model:** opus
- **Color:** purple
- **Scope:** Tool schemas, validation, prompt building, AI service

## Purpose

Handle all AI tool-related tasks including:
- Tool schema definition (JSON Schema + Zod)
- Tool validation layer
- Tool whitelist management
- Prompt building for tool calling
- OpenAI/Azure OpenAI integration
- Streaming response handling

## Context

### AI Stack
- OpenAI / Azure OpenAI
- Model: GPT-4 or equivalent
- Embeddings: text-embedding-3-small
- Streaming: SSE for chat responses

### Tool Categories
1. **Excel Write Tools** - Require preview (write_range, set_formula, etc.)
2. **Excel Read Tools** - No preview (read_range, get_selection)
3. **Analytics Tools** - Reasoning only (explain_kpi, compare_periods)
4. **Data Tools** - Platform connectors (sync_orders, import_to_sheet)

## Responsibilities

### 1. Tool Schema Definition
Create dual schemas (JSON Schema for AI + Zod for runtime):

```typescript
// JSON Schema for OpenAI function calling
export const writeRangeToolSchema = {
  name: 'write_range',
  description: 'Write a 2D array of values to an Excel range',
  parameters: {
    type: 'object',
    properties: {
      address: {
        type: 'string',
        description: 'Excel range in A1 notation (e.g., "A1:C10")',
      },
      values: {
        type: 'array',
        items: {
          type: 'array',
          items: { type: ['string', 'number', 'boolean', 'null'] }
        },
        description: '2D array of values to write',
      },
      reason: {
        type: 'string',
        description: 'Why this operation is being performed',
      },
    },
    required: ['address', 'values', 'reason'],
  },
};

// Zod schema for runtime validation
export const writeRangeParamsSchema = z.object({
  address: z.string().regex(/^[A-Z]+[0-9]+(:[A-Z]+[0-9]+)?$/),
  values: z.array(z.array(z.union([z.string(), z.number(), z.boolean(), z.null()]))),
  reason: z.string().min(1),
});
```

### 2. Tool Whitelist
Maintain list of allowed tools:
```typescript
export const TOOL_WHITELIST = [
  // Excel Write (require preview)
  'write_range',
  'set_formula',
  'format_range',
  'create_sheet',
  'add_table',
  'highlight_cells',
  'add_summary_row',

  // Excel Read
  'read_range',
  'get_selection',
  'get_context',

  // Analytics
  'explain_kpi',
  'compare_periods',
  'compare_platforms',
  'detect_anomalies',
  'suggest_actions',

  // Data
  'sync_orders',
  'sync_campaigns',
  'import_to_sheet',
] as const;
```

### 3. Prompt Building
Build system prompts with context:
```typescript
function buildSystemPrompt(context: ExcelContext): string {
  return `You are Cellix, an AI assistant specialized in ecommerce analytics for Shopee and Lazada.

You have access to the user's Excel workbook and can manipulate it using tools.

## Current Excel Context
${formatExcelContext(context)}

## Available Tools
${formatToolDescriptions(TOOL_WHITELIST)}

## Rules
1. Always explain what you're going to do before using tools
2. For write operations, explain the reason clearly
3. When comparing data, use specific numbers
4. If unsure about data interpretation, ask for clarification

## Domain Knowledge
${formatRagContext(ragChunks)}
`;
}
```

### 4. Tool Validation Layer
Validate tool calls before execution:
```typescript
function validateToolCall(toolCall: ToolCall): ValidationResult {
  // Check whitelist
  if (!TOOL_WHITELIST.includes(toolCall.name)) {
    return { valid: false, error: 'Tool not in whitelist' };
  }

  // Get schema
  const schema = getZodSchema(toolCall.name);

  // Validate parameters
  const result = schema.safeParse(toolCall.parameters);
  if (!result.success) {
    return { valid: false, error: result.error.message };
  }

  // Additional safety checks
  if (requiresPreview(toolCall.name)) {
    const cellCount = calculateCellCount(toolCall.parameters.address);
    if (cellCount > 500) {
      return { valid: false, error: 'Exceeds 500 cell limit' };
    }
  }

  return { valid: true, data: result.data };
}
```

### 5. Streaming Handler
Handle streaming responses with tool calls:
```typescript
async function* handleStreamingChat(
  messages: Message[],
  context: ExcelContext
): AsyncGenerator<StreamChunk> {
  const stream = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [
      { role: 'system', content: buildSystemPrompt(context) },
      ...messages,
    ],
    tools: getToolSchemas(),
    stream: true,
  });

  for await (const chunk of stream) {
    yield processChunk(chunk);
  }
}
```

## Safety Checklist

For each tool:
- [ ] JSON Schema defined correctly
- [ ] Zod schema matches JSON Schema
- [ ] In whitelist
- [ ] Preview requirement documented
- [ ] Cell limit enforced (if write)
- [ ] Address validation present
- [ ] Error messages user-friendly

## Tools Available

- Read, Write, Edit - File operations
- Grep, Glob - Code search
- WebFetch - OpenAI/API documentation

## Reference

- OpenAI function calling: https://platform.openai.com/docs/guides/function-calling
- Zod: https://zod.dev
- See `.claude/reference/tool-schema.md` for full tool reference
