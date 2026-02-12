# PRP: Missing Basic Read Tools

## Overview

Implement the basic read tools that are defined in shared types but missing from the backend tool definitions and have no executors: `read_range`, `get_selection`, `get_sheet_names`, and `get_context`.

## Context

- **Priority:** Low
- **Estimated Effort:** 1 day
- **Dependencies:** None

### Problem Statement

The shared types define these read tools:
```typescript
// packages/shared/src/types/tools.ts
export const READ_TOOLS = [
  'read_range',        // ❌ Schema missing, executor missing
  'get_selection',     // ❌ Schema missing, executor missing
  'get_sheet_names',   // ❌ Schema missing, executor missing
  'get_context',       // ❌ Schema missing, executor missing
  'get_profile',       // ✅ Implemented
  'select_rows',       // ✅ Implemented
  'group_aggregate',   // ✅ Implemented
  'find_outliers',     // ✅ Implemented
  'search_values',     // ✅ Implemented
] as const;
```

The smart retrieval tools (Phase 5B) are implemented, but the basic read tools from the MVP spec are not.

### Related Files

| File | Purpose |
|------|---------|
| `apps/backend/src/services/tools/schemas.ts` | Tool parameter schemas |
| `apps/backend/src/services/tools/definitions.ts` | OpenAI tool definitions |
| `apps/addin/src/lib/tools/readers.ts` | Read tool executors |
| `apps/addin/src/lib/excel/reader.ts` | Excel read helpers (already exist) |
| `packages/shared/src/types/tools.ts` | Tool type definitions |

## Research Findings

### Existing Excel Read Helpers

The `reader.ts` file already has helper functions that can be used:

```typescript
// apps/addin/src/lib/excel/reader.ts
export async function getSelectedRangeValues(): Promise<unknown[][]>
export async function getSelectedRangeAddress(): Promise<string>
export async function getActiveSheetName(): Promise<string>
export async function getSheetNames(): Promise<string[]>
export async function getTableMetadata(): Promise<TableInfo[]>
export async function readRange(address: string): Promise<unknown[][]>
```

These just need to be exposed as AI-callable tools.

### Why These Tools Are Useful

| Tool | Use Case |
|------|----------|
| `read_range` | AI reads specific cells: "What's in A1:C10?" |
| `get_selection` | AI sees what user selected: "Analyze my selection" |
| `get_sheet_names` | AI lists sheets: "What sheets do I have?" |
| `get_context` | AI gets full context: Debugging, understanding workbook |

### Comparison with Smart Retrieval Tools

| Basic Tools | Smart Tools |
|-------------|-------------|
| Simple, direct reads | Filtered, aggregated data |
| Small data amounts | Large dataset handling |
| Exact cell/range | Query-based |
| No processing | Arquero processing |

Both are useful for different scenarios.

## Implementation Plan

### Files to Modify

#### 1. `apps/backend/src/services/tools/schemas.ts`

Add schemas for basic read tools:

```typescript
// ═══════════════════════════════════════════════════════════
// BASIC READ TOOLS
// ═══════════════════════════════════════════════════════════

/** read_range - Read values from a specific range */
export const readRangeSchema = z.object({
  address: z.string()
    .min(1, 'Address is required')
    .describe('Excel range address (e.g., "A1:C10", "Sheet1!A1:B5")'),
  includeHeaders: z.boolean()
    .optional()
    .default(true)
    .describe('Whether first row contains headers'),
});

/** get_selection - Get current user selection */
export const getSelectionSchema = z.object({
  includeValues: z.boolean()
    .optional()
    .default(true)
    .describe('Whether to include cell values (false for just address/size)'),
  maxRows: z.number()
    .optional()
    .default(100)
    .describe('Maximum rows to return if includeValues is true'),
});

/** get_sheet_names - List all worksheets */
export const getSheetNamesSchema = z.object({
  includeHidden: z.boolean()
    .optional()
    .default(false)
    .describe('Whether to include hidden sheets'),
});

/** get_context - Get comprehensive Excel context */
export const getContextSchema = z.object({
  includeSelection: z.boolean()
    .optional()
    .default(true)
    .describe('Include current selection data'),
  includeTables: z.boolean()
    .optional()
    .default(true)
    .describe('Include Excel table information'),
  includeProfile: z.boolean()
    .optional()
    .default(false)
    .describe('Include full sheet profile (slower)'),
});
```

#### 2. `apps/backend/src/services/tools/definitions.ts`

Add tool definitions:

```typescript
// Basic Read Tools
{
  type: 'function',
  function: {
    name: 'read_range',
    description: 'Read values from a specific Excel range. Use this when the user asks about specific cells or ranges.',
    parameters: zodToJsonSchema(readRangeSchema),
  },
},
{
  type: 'function',
  function: {
    name: 'get_selection',
    description: 'Get the current user selection in Excel. Use this when the user refers to "my selection" or "selected cells".',
    parameters: zodToJsonSchema(getSelectionSchema),
  },
},
{
  type: 'function',
  function: {
    name: 'get_sheet_names',
    description: 'List all worksheet names in the workbook. Use this when the user asks about available sheets.',
    parameters: zodToJsonSchema(getSheetNamesSchema),
  },
},
{
  type: 'function',
  function: {
    name: 'get_context',
    description: 'Get comprehensive Excel context including selection, sheets, and tables. Use for general understanding of the workbook.',
    parameters: zodToJsonSchema(getContextSchema),
  },
},
```

#### 3. `apps/addin/src/lib/tools/readers.ts`

Add executors for basic read tools:

```typescript
import {
  getSelectedRangeValues,
  getSelectedRangeAddress,
  getActiveSheetName,
  getSheetNames,
  getTableMetadata,
  readRange as readRangeHelper,
} from '../excel/reader';
import { extractSheetProfile } from '../excel/profiler';

/**
 * Execute read_range tool
 */
export async function executeReadRange(
  params: { address: string; includeHeaders?: boolean }
): Promise<ExecutionResult> {
  try {
    const values = await readRangeHelper(params.address);

    const headers = params.includeHeaders && values.length > 0
      ? values[0].map(v => String(v ?? ''))
      : null;

    const data = params.includeHeaders && values.length > 1
      ? values.slice(1)
      : values;

    return {
      success: true,
      resultData: {
        address: params.address,
        headers,
        data,
        rowCount: data.length,
        columnCount: data[0]?.length ?? 0,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to read range',
    };
  }
}

/**
 * Execute get_selection tool
 */
export async function executeGetSelection(
  params: { includeValues?: boolean; maxRows?: number }
): Promise<ExecutionResult> {
  try {
    const address = await getSelectedRangeAddress();

    let values: unknown[][] | null = null;
    if (params.includeValues !== false) {
      const allValues = await getSelectedRangeValues();
      values = params.maxRows
        ? allValues.slice(0, params.maxRows)
        : allValues;
    }

    return {
      success: true,
      resultData: {
        address,
        values,
        rowCount: values?.length ?? 0,
        columnCount: values?.[0]?.length ?? 0,
        truncated: values && params.maxRows
          ? values.length >= params.maxRows
          : false,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get selection',
    };
  }
}

/**
 * Execute get_sheet_names tool
 */
export async function executeGetSheetNames(
  params: { includeHidden?: boolean }
): Promise<ExecutionResult> {
  try {
    const sheets = await getSheetNames();
    const activeSheet = await getActiveSheetName();

    // Note: Office.js doesn't easily expose hidden status
    // Would need to load sheet.visibility property
    // For now, return all sheets

    return {
      success: true,
      resultData: {
        sheets,
        activeSheet,
        count: sheets.length,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get sheet names',
    };
  }
}

/**
 * Execute get_context tool
 */
export async function executeGetContext(
  params: {
    includeSelection?: boolean;
    includeTables?: boolean;
    includeProfile?: boolean;
  }
): Promise<ExecutionResult> {
  try {
    const context: Record<string, unknown> = {
      activeSheet: await getActiveSheetName(),
      allSheets: await getSheetNames(),
    };

    if (params.includeSelection !== false) {
      context.selection = {
        address: await getSelectedRangeAddress(),
        values: await getSelectedRangeValues(),
      };
    }

    if (params.includeTables !== false) {
      context.tables = await getTableMetadata();
    }

    if (params.includeProfile) {
      context.profile = await extractSheetProfile();
    }

    return {
      success: true,
      resultData: context,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get context',
    };
  }
}
```

#### 4. `apps/addin/src/lib/tools/executor.ts`

Add dispatch cases:

```typescript
import {
  executeReadRange,
  executeGetSelection,
  executeGetSheetNames,
  executeGetContext,
  // ... existing imports
} from './readers';

export async function executeToolCall(toolCall: ToolCall): Promise<ExecutionResult> {
  const { name, parameters } = toolCall;

  switch (name) {
    // ... existing write tools ...

    // Basic Read Tools
    case 'read_range':
      return executeReadRange(parameters as { address: string; includeHeaders?: boolean });

    case 'get_selection':
      return executeGetSelection(parameters as { includeValues?: boolean; maxRows?: number });

    case 'get_sheet_names':
      return executeGetSheetNames(parameters as { includeHidden?: boolean });

    case 'get_context':
      return executeGetContext(parameters as {
        includeSelection?: boolean;
        includeTables?: boolean;
        includeProfile?: boolean;
      });

    // ... existing smart read tools ...

    default:
      return {
        success: false,
        error: `Unknown tool: ${name}`,
      };
  }
}
```

### Implementation Steps

1. **Add schemas** to `schemas.ts`
2. **Add tool definitions** to `definitions.ts`
3. **Add executors** to `readers.ts`
4. **Update executor dispatch** in `executor.ts`
5. **Export schemas** from index files
6. **Test each tool** manually

## Validation Gates

### Build
- [ ] `pnpm build` passes
- [ ] `pnpm typecheck` passes

### Lint
- [ ] `pnpm lint` passes

### Manual Testing

| Test | Expected Result |
|------|-----------------|
| "What's in cell A1?" | AI calls read_range, returns value |
| "Read A1:C10" | AI calls read_range, returns 2D array |
| "What did I select?" | AI calls get_selection, returns selection data |
| "What sheets do I have?" | AI calls get_sheet_names, lists sheets |
| "Tell me about this workbook" | AI calls get_context, returns overview |

## Safety Considerations

- Limit read_range to reasonable size (max 1000 cells)
- Truncate large selections in get_selection
- No data modification (read-only tools)

## Success Metrics

| Metric | Target |
|--------|--------|
| Tool execution success rate | >95% |
| Response time | <1 second for small ranges |

## Notes

### Relationship to Smart Retrieval Tools

Basic read tools are for:
- Direct cell/range access
- Simple queries ("What's in A1?")
- Understanding workbook structure

Smart retrieval tools are for:
- Filtered data queries
- Aggregations
- Large dataset analysis

Both tool sets complement each other.

### Future Enhancements

- Add `read_range` support for named ranges
- Add `get_sheet_names` hidden sheet detection
- Add `get_context` with workbook-level info (file name, etc.)

### When to Use Each Tool

| User Says | Tool to Use |
|-----------|-------------|
| "What's in A1?" | read_range |
| "Show my selection" | get_selection |
| "What sheets exist?" | get_sheet_names |
| "Analyze column B" | select_rows (smart) |
| "Total by category" | group_aggregate (smart) |
