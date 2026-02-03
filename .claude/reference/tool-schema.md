# Tool Schema Reference

## Overview

Cellix uses a dual-schema approach:
1. **JSON Schema** - For OpenAI function calling
2. **Zod Schema** - For runtime validation

Both schemas must match for each tool.

## Tool Categories

| Category | Requires Preview | Examples |
|----------|-----------------|----------|
| `write` | YES | write_range, set_formula, format_range |
| `read` | NO | read_range, get_selection, get_context |
| `analytics` | NO | explain_kpi, compare_periods |
| `data` | DEPENDS | sync_orders (no), import_to_sheet (yes) |

## Tool Definition Structure

```typescript
interface ToolDefinition {
  name: string;                    // snake_case
  description: string;             // For AI to understand when to use
  category: 'write' | 'read' | 'analytics' | 'data';
  requiresPreview: boolean;
  parameters: JSONSchema;          // OpenAI function calling schema
  zodSchema: z.ZodSchema;          // Runtime validation
}
```

## Complete Tool Definitions

### Excel Write Tools

#### write_range
```typescript
// JSON Schema
{
  name: 'write_range',
  description: 'Write a 2D array of values to an Excel range. Use for inserting data, results, or calculations.',
  parameters: {
    type: 'object',
    properties: {
      address: {
        type: 'string',
        description: 'Excel range in A1 notation (e.g., "A1:C10", "Sheet1!B2:D5")',
      },
      values: {
        type: 'array',
        items: {
          type: 'array',
          items: { type: ['string', 'number', 'boolean', 'null'] }
        },
        description: '2D array of values matching the range dimensions',
      },
      reason: {
        type: 'string',
        description: 'Explanation of why this data is being written',
      },
    },
    required: ['address', 'values', 'reason'],
  },
}

// Zod Schema
const writeRangeSchema = z.object({
  address: z.string().regex(/^('?[\w\s]+'?!)?[A-Z]+[0-9]+(:[A-Z]+[0-9]+)?$/),
  values: z.array(z.array(z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
  ]))),
  reason: z.string().min(1),
});
```

#### set_formula
```typescript
{
  name: 'set_formula',
  description: 'Set an Excel formula in a cell. Use for calculations, SUMIF, VLOOKUP, etc.',
  parameters: {
    type: 'object',
    properties: {
      address: {
        type: 'string',
        description: 'Single cell address (e.g., "A1", "Sheet1!B2")',
      },
      formula: {
        type: 'string',
        description: 'Excel formula starting with = (e.g., "=SUM(A1:A10)")',
      },
      reason: {
        type: 'string',
        description: 'Explanation of what this formula calculates',
      },
    },
    required: ['address', 'formula', 'reason'],
  },
}

// Zod Schema
const setFormulaSchema = z.object({
  address: z.string().regex(/^('?[\w\s]+'?!)?[A-Z]+[0-9]+$/),
  formula: z.string().startsWith('=').min(2),
  reason: z.string().min(1),
}).refine(
  (data) => !data.formula.includes('http'),
  { message: 'External links not allowed in formulas' }
);
```

#### format_range
```typescript
{
  name: 'format_range',
  description: 'Apply formatting to an Excel range (colors, fonts, number formats).',
  parameters: {
    type: 'object',
    properties: {
      address: {
        type: 'string',
        description: 'Excel range in A1 notation',
      },
      style: {
        type: 'object',
        properties: {
          fillColor: { type: 'string', description: 'Hex color (e.g., "#FFFF00")' },
          fontColor: { type: 'string', description: 'Hex color' },
          bold: { type: 'boolean' },
          italic: { type: 'boolean' },
          numberFormat: { type: 'string', description: 'Excel number format' },
        },
      },
      reason: {
        type: 'string',
        description: 'Why this formatting is being applied',
      },
    },
    required: ['address', 'style', 'reason'],
  },
}

// Zod Schema
const formatRangeSchema = z.object({
  address: z.string().regex(/^('?[\w\s]+'?!)?[A-Z]+[0-9]+(:[A-Z]+[0-9]+)?$/),
  style: z.object({
    fillColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
    fontColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
    bold: z.boolean().optional(),
    italic: z.boolean().optional(),
    numberFormat: z.string().optional(),
  }),
  reason: z.string().min(1),
});
```

#### create_sheet
```typescript
{
  name: 'create_sheet',
  description: 'Create a new worksheet in the workbook.',
  parameters: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Name for the new sheet (max 31 chars, no []:*?/\\)',
      },
      reason: {
        type: 'string',
        description: 'Why this sheet is being created',
      },
    },
    required: ['name', 'reason'],
  },
}

// Zod Schema
const createSheetSchema = z.object({
  name: z.string()
    .min(1)
    .max(31)
    .refine(
      (name) => !/[\[\]:*?\/\\]/.test(name),
      { message: 'Sheet name cannot contain []:*?/\\' }
    ),
  reason: z.string().min(1),
});
```

### Excel Read Tools

#### read_range
```typescript
{
  name: 'read_range',
  description: 'Read values from an Excel range. Use to get data for analysis.',
  parameters: {
    type: 'object',
    properties: {
      address: {
        type: 'string',
        description: 'Excel range in A1 notation',
      },
    },
    required: ['address'],
  },
}
```

#### get_selection
```typescript
{
  name: 'get_selection',
  description: 'Get the currently selected range and its values.',
  parameters: {
    type: 'object',
    properties: {},
  },
}
```

### Analytics Tools (Reasoning Only)

#### explain_kpi
```typescript
{
  name: 'explain_kpi',
  description: 'Explain what a KPI means and how to interpret it in ecommerce context.',
  parameters: {
    type: 'object',
    properties: {
      kpi_name: {
        type: 'string',
        description: 'Name of the KPI (e.g., "ROAS", "CTR", "CVR")',
      },
      context: {
        type: 'string',
        description: 'Additional context about where this KPI appears',
      },
    },
    required: ['kpi_name'],
  },
}
```

#### compare_periods
```typescript
{
  name: 'compare_periods',
  description: 'Compare a metric across two time periods and explain the change.',
  parameters: {
    type: 'object',
    properties: {
      metric: {
        type: 'string',
        description: 'The metric being compared',
      },
      period1: {
        type: 'object',
        properties: {
          label: { type: 'string' },
          value: { type: 'number' },
        },
      },
      period2: {
        type: 'object',
        properties: {
          label: { type: 'string' },
          value: { type: 'number' },
        },
      },
    },
    required: ['metric', 'period1', 'period2'],
  },
}
```

## Validation Flow

```typescript
function validateToolCall(toolCall: ToolCall): ValidationResult {
  // 1. Check whitelist
  if (!TOOL_WHITELIST.includes(toolCall.name)) {
    return { valid: false, error: `Unknown tool: ${toolCall.name}` };
  }

  // 2. Get schemas
  const toolDef = getToolDefinition(toolCall.name);

  // 3. Validate with Zod
  const result = toolDef.zodSchema.safeParse(toolCall.parameters);
  if (!result.success) {
    return {
      valid: false,
      error: result.error.issues.map(i => i.message).join(', '),
    };
  }

  // 4. Safety checks for write tools
  if (toolDef.requiresPreview) {
    const cellCount = calculateCellCount(toolCall.parameters.address);
    if (cellCount > 500) {
      return { valid: false, error: 'Operation exceeds 500 cell limit' };
    }
  }

  // 5. Formula safety check
  if (toolCall.name === 'set_formula') {
    if (!isFormulaSafe(toolCall.parameters.formula)) {
      return { valid: false, error: 'Formula contains unsafe elements' };
    }
  }

  return { valid: true, data: result.data };
}
```

## Adding New Tools

1. Define JSON Schema for OpenAI
2. Define matching Zod schema
3. Add to TOOL_WHITELIST
4. Implement executor in add-in
5. Implement preview generator (if write tool)
6. Add tests
7. Update CLAUDE.md tool reference
