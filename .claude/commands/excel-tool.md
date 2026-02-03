# Excel Tool Command

Generate a new Excel tool definition with proper schema and validation.

## Arguments

- `$ARGUMENTS` - Tool name and brief description (e.g., "create_pivot_table - Create a pivot table from data range")

## Purpose

Generate a complete tool definition following Cellix's patterns for AI-powered Excel manipulation.

## Process

### Step 1: Parse Arguments

Extract:
- Tool name (snake_case)
- Brief description

### Step 2: Determine Tool Category

| Category | Requires Preview | Examples |
|----------|-----------------|----------|
| Write | YES | write_range, set_formula, format_range |
| Read | NO | read_range, get_selection, get_context |
| Analytics | NO | explain_kpi, compare_periods |
| Data | Depends | sync_orders, import_to_sheet |

### Step 3: Generate Schema

Create JSON Schema for the tool parameters:

```typescript
// In apps/backend/src/services/tools/schemas/{tool-name}.ts

import { z } from 'zod';

export const {toolName}Schema = z.object({
  // Required parameters
  address: z.string()
    .regex(/^[A-Z]+[0-9]+(:[A-Z]+[0-9]+)?$/, 'Invalid A1 notation'),

  // Optional parameters with defaults
  option: z.string().optional().default('default'),

  // Reason is required for write operations
  reason: z.string().min(1, 'Reason required for write operations'),
});

export type {ToolName}Params = z.infer<typeof {toolName}Schema>;
```

### Step 4: Generate Tool Definition

```typescript
// Add to apps/backend/src/services/tools/definitions.ts

export const {toolName}Tool: ToolDefinition = {
  name: '{tool_name}',
  description: '{Description from arguments}',
  category: 'write' | 'read' | 'analytics' | 'data',
  requiresPreview: true | false,
  parameters: {
    type: 'object',
    properties: {
      address: {
        type: 'string',
        description: 'Excel range in A1 notation (e.g., "A1:C10")',
      },
      // ... other parameters
      reason: {
        type: 'string',
        description: 'Why this operation is being performed',
      },
    },
    required: ['address', 'reason'],
  },
};
```

### Step 5: Generate Executor

```typescript
// In apps/addin/src/lib/tools/executors/{tool-name}.ts

import type { {ToolName}Params } from '@cellix/shared';

export async function execute{ToolName}(
  context: Excel.RequestContext,
  params: {ToolName}Params
): Promise<ToolResult> {
  // Validate parameters
  const validated = {toolName}Schema.parse(params);

  // Execute Office.js operations
  const sheet = context.workbook.worksheets.getActiveWorksheet();
  const range = sheet.getRange(validated.address);

  // ... implementation

  await context.sync();

  return {
    success: true,
    message: 'Operation completed',
    affectedCells: range.cellCount,
  };
}
```

### Step 6: Generate Preview (if write operation)

```typescript
// In apps/addin/src/lib/tools/previews/{tool-name}.ts

export function preview{ToolName}(
  params: {ToolName}Params
): PreviewAction {
  return {
    tool: '{tool_name}',
    description: `{Description} at ${params.address}`,
    affectedRange: params.address,
    cellCount: calculateCellCount(params.address),
    requiresConfirmation: calculateCellCount(params.address) > 50,
    changes: [
      {
        type: 'write' | 'format' | 'formula',
        range: params.address,
        preview: '...', // Preview of changes
      },
    ],
  };
}
```

### Step 7: Generate Tests

```typescript
// In apps/addin/src/lib/tools/__tests__/{tool-name}.test.ts

import { describe, it, expect } from 'vitest';
import { {toolName}Schema } from '../schemas/{tool-name}';

describe('{tool_name} schema', () => {
  it('validates correct parameters', () => {
    const result = {toolName}Schema.safeParse({
      address: 'A1:B10',
      reason: 'Test operation',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid address format', () => {
    const result = {toolName}Schema.safeParse({
      address: 'invalid',
      reason: 'Test',
    });
    expect(result.success).toBe(false);
  });
});
```

## Output

Generate and display:
1. Schema file content
2. Tool definition to add
3. Executor file content
4. Preview file content (if applicable)
5. Test file content

Ask user to confirm before creating files.

## Safety Checklist

For write tools, verify:
- [ ] Preview generation implemented
- [ ] Cell count calculated
- [ ] Confirmation threshold (50 cells)
- [ ] Reason parameter required
- [ ] Audit logging integrated
- [ ] Error handling for Office.js errors
