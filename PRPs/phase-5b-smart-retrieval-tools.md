# PRP: Phase 5B - Smart Retrieval Tools

## Overview

New AI tools that let the LLM request specific data slices instead of receiving everything upfront. The AI first inspects the sheet profile (from 5A), then queries exactly the data it needs using `get_profile`, `select_rows`, `group_aggregate`, `find_outliers`, and `search_values`.

## Context

- **Phase:** 5B (Post-MVP, Sheet Intelligence)
- **Priority:** High - Enables intelligent data querying
- **Prerequisites:** Phase 5A complete (profile system, Arquero)
- **Duration:** ~1 week

### Dependencies
- Profile extractor (`apps/addin/src/lib/excel/profiler.ts`)
- Profile cache (`apps/addin/src/lib/excel/profileCache.ts`)
- Arquero utilities (`apps/addin/src/lib/data/arquero.ts`)
- Existing tool patterns (`apps/backend/src/services/tools/`)

### Related Files
- `packages/shared/src/types/tools.ts` - Tool type definitions
- `apps/backend/src/services/tools/schemas.ts` - Zod schemas
- `apps/backend/src/services/tools/definitions.ts` - OpenAI tool defs
- `apps/addin/src/lib/tools/executor.ts` - Tool execution engine

## Documentation References

- [Arquero API](https://idl.uw.edu/arquero/api/) - Table operations
- [Arquero Verbs](https://idl.uw.edu/arquero/api/verbs) - filter, select, groupby
- [Zod Documentation](https://zod.dev/) - Schema validation

## Research Findings

### Existing Tool Pattern (from `definitions.ts`)
```typescript
function createToolDef<T extends ZodRawShape>(
  name: string,
  description: string,
  schema: ZodObject<T>
): ToolDefinition {
  const jsonSchema = zodToJsonSchema(schema, { target: 'openAi' });
  return {
    type: 'function',
    function: { name, description, parameters: jsonSchema },
  };
}
```

### Existing Executor Pattern (from `executor.ts`)
```typescript
switch (toolCall.name) {
  case 'write_range': {
    const params = toolCall.parameters as unknown as WriteRangeParams;
    const result = await writeRange(params.address, params.values);
    // ...
  }
}
```

### Existing Tool Categories (from `tools.ts`)
```typescript
export const READ_TOOLS = ['read_range', 'get_selection', 'get_sheet_names', 'get_context'] as const;
```

### Arquero Utilities Available (from 5A)
- `createTable(values, hasHeaders)` - Create table from 2D array
- `calculateColumnStats(table, column)` - Get sum/avg/min/max/count/stdev
- `filterRows(table, predicate)` - Filter with escaped predicate
- `groupAggregate(table, groupBy, aggregations)` - Group and rollup

---

## Implementation Plan

### Files to Create

| File | Description |
|------|-------------|
| `apps/addin/src/lib/tools/readers.ts` | Read tool executors using Arquero |

### Files to Modify

| File | Changes |
|------|---------|
| `packages/shared/src/types/tools.ts` | Add new tool names and param types |
| `apps/backend/src/services/tools/schemas.ts` | Add Zod schemas for new tools |
| `apps/backend/src/services/tools/definitions.ts` | Register tool definitions |
| `apps/addin/src/lib/tools/executor.ts` | Add cases for read tools |
| `apps/addin/src/lib/tools/index.ts` | Export readers |

---

### Step 1: Add Tool Types (`packages/shared/src/types/tools.ts`)

Add to `READ_TOOLS` array:
```typescript
export const READ_TOOLS = [
  'read_range',
  'get_selection',
  'get_sheet_names',
  'get_context',
  'get_profile',      // NEW
  'select_rows',      // NEW
  'group_aggregate',  // NEW
  'find_outliers',    // NEW
  'search_values',    // NEW
] as const;
```

Add new parameter interfaces:
```typescript
/** Filter specification for queries */
export interface FilterSpec {
  column: string;
  operator: 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains' | 'startsWith' | 'between' | 'in';
  value: unknown;
  value2?: unknown; // For 'between'
}

/** Parameters for get_profile tool */
export interface GetProfileParams {
  sheet?: string;
}

/** Parameters for select_rows tool */
export interface SelectRowsParams {
  sheet?: string;
  columns: string[];
  filters?: FilterSpec[];
  orderBy?: { column: string; direction: 'asc' | 'desc' };
  limit?: number;
  offset?: number;
}

/** Parameters for group_aggregate tool */
export interface GroupAggregateParams {
  sheet?: string;
  groupBy: string[];
  metrics: Array<{
    column: string;
    aggregation: 'sum' | 'avg' | 'min' | 'max' | 'count' | 'countUnique';
  }>;
  filters?: FilterSpec[];
  limit?: number;
}

/** Parameters for find_outliers tool */
export interface FindOutliersParams {
  sheet?: string;
  column: string;
  method: 'zscore' | 'iqr' | 'percentile';
  threshold?: number;
  limit?: number;
}

/** Parameters for search_values tool */
export interface SearchValuesParams {
  query: string;
  columns?: string[];
  fuzzy?: boolean;
  limit?: number;
}
```

---

### Step 2: Add Zod Schemas (`apps/backend/src/services/tools/schemas.ts`)

```typescript
// ============================================
// Smart Retrieval Tools (Phase 5B)
// ============================================

/** Filter specification schema */
const filterSpecSchema = z.object({
  column: z.string().describe('Column name or letter'),
  operator: z.enum(['eq', 'neq', 'gt', 'lt', 'gte', 'lte', 'contains', 'startsWith', 'between', 'in']),
  value: z.unknown().describe('Value to compare against'),
  value2: z.unknown().optional().describe('Second value for "between" operator'),
});

/** Get sheet profile */
export const getProfileSchema = z.object({
  sheet: z.string().optional().describe('Sheet name (defaults to active sheet)'),
});

/** Select filtered rows */
export const selectRowsSchema = z.object({
  sheet: z.string().optional().describe('Sheet name (defaults to active sheet)'),
  columns: z.array(z.string()).describe('Column names or letters to return'),
  filters: z.array(filterSpecSchema).optional().describe('Filter conditions'),
  orderBy: z.object({
    column: z.string(),
    direction: z.enum(['asc', 'desc']),
  }).optional().describe('Sort order'),
  limit: z.number().max(500).default(50).describe('Max rows to return'),
  offset: z.number().default(0).describe('Rows to skip'),
});

/** Group and aggregate */
export const groupAggregateSchema = z.object({
  sheet: z.string().optional().describe('Sheet name (defaults to active sheet)'),
  groupBy: z.array(z.string()).describe('Columns to group by'),
  metrics: z.array(z.object({
    column: z.string(),
    aggregation: z.enum(['sum', 'avg', 'min', 'max', 'count', 'countUnique']),
  })).describe('Aggregations to compute'),
  filters: z.array(filterSpecSchema).optional().describe('Pre-aggregation filters'),
  limit: z.number().max(1000).default(100).describe('Max groups to return'),
});

/** Find outliers */
export const findOutliersSchema = z.object({
  sheet: z.string().optional().describe('Sheet name (defaults to active sheet)'),
  column: z.string().describe('Numeric column to analyze'),
  method: z.enum(['zscore', 'iqr', 'percentile']).describe('Detection method'),
  threshold: z.number().default(2).describe('Threshold (z-score std devs, or percentile)'),
  limit: z.number().max(100).default(20).describe('Max outliers to return'),
});

/** Search for values */
export const searchValuesSchema = z.object({
  query: z.string().describe('Search query'),
  columns: z.array(z.string()).optional().describe('Columns to search (all if not specified)'),
  fuzzy: z.boolean().default(false).describe('Enable fuzzy matching'),
  limit: z.number().max(100).default(20).describe('Max results'),
});
```

---

### Step 3: Register Tool Definitions (`apps/backend/src/services/tools/definitions.ts`)

Add to `TOOL_DEFINITIONS` array:
```typescript
// Smart Retrieval Tools (Phase 5B)
createToolDef(
  'get_profile',
  'Get metadata about a sheet including column names, types, statistics, and quality signals. Always call this first to understand the data structure before querying.',
  schemas.getProfileSchema
),
createToolDef(
  'select_rows',
  'Fetch filtered rows from a sheet. Supports filtering by column values, sorting, and pagination. Returns actual data rows.',
  schemas.selectRowsSchema
),
createToolDef(
  'group_aggregate',
  'Group data by columns and compute aggregations (sum, avg, min, max, count). Useful for summaries and totals.',
  schemas.groupAggregateSchema
),
createToolDef(
  'find_outliers',
  'Detect anomalies in a numeric column using statistical methods (z-score, IQR, or percentile).',
  schemas.findOutliersSchema
),
createToolDef(
  'search_values',
  'Search for specific values across columns. Supports exact and fuzzy matching.',
  schemas.searchValuesSchema
),
```

---

### Step 4: Create Read Tool Executors (`apps/addin/src/lib/tools/readers.ts`)

```typescript
/**
 * Read tool executors for Phase 5B Smart Retrieval.
 * Uses Arquero for data processing.
 */

import type {
  GetProfileParams,
  SelectRowsParams,
  GroupAggregateParams,
  FindOutliersParams,
  SearchValuesParams,
  FilterSpec,
  SheetProfile,
} from '@cellix/shared';
import { columnToNumber, numberToColumn } from '@cellix/shared';
import { extractSheetProfile } from '../excel/profiler';
import { getCachedProfile } from '../excel/profileCache';
import { aq, op, createTable, type ColumnTable } from '../data/arquero';

/** Safety limits */
const LIMITS = {
  SELECT_ROWS: 500,
  GROUP_AGGREGATE: 1000,
  FIND_OUTLIERS: 100,
  SEARCH_VALUES: 100,
};

/** Result types */
export interface SelectRowsResult {
  rows: Record<string, unknown>[];
  total: number;
  columns: string[];
}

export interface GroupAggregateResult {
  groups: Record<string, unknown>[];
  groupBy: string[];
  metrics: string[];
}

export interface FindOutliersResult {
  outliers: Record<string, unknown>[];
  stats: { mean: number; stdev: number } | null;
  method: string;
}

export interface SearchResult {
  matches: Record<string, unknown>[];
  total: number;
}

/**
 * Execute get_profile tool.
 */
export async function executeGetProfile(params: GetProfileParams): Promise<SheetProfile> {
  // Try cache first
  if (params.sheet) {
    const cached = getCachedProfile(params.sheet);
    if (cached) return cached;
  }
  return extractSheetProfile(params.sheet);
}

/**
 * Execute select_rows tool.
 */
export async function executeSelectRows(params: SelectRowsParams): Promise<SelectRowsResult> {
  const values = await readSheetData(params.sheet);
  const table = createTable(values, true);

  if (!table) {
    return { rows: [], total: 0, columns: [] };
  }

  const profile = await executeGetProfile({ sheet: params.sheet });
  let result = table;

  // Apply filters
  if (params.filters?.length) {
    result = applyFilters(result, params.filters, profile);
  }

  // Get total before pagination
  const total = result.numRows();

  // Select columns (resolve letters to names)
  const resolvedColumns = params.columns.map(c => resolveColumn(c, profile));

  // Order by
  if (params.orderBy) {
    const col = resolveColumn(params.orderBy.column, profile);
    result = params.orderBy.direction === 'desc'
      ? result.orderby(aq.desc(col))
      : result.orderby(col);
  }

  // Pagination with safety limit
  const limit = Math.min(params.limit ?? 50, LIMITS.SELECT_ROWS);
  const offset = params.offset ?? 0;
  result = result.slice(offset, offset + limit);

  // Select only requested columns
  if (resolvedColumns.length > 0) {
    result = result.select(resolvedColumns);
  }

  return {
    rows: result.objects() as Record<string, unknown>[],
    total,
    columns: resolvedColumns,
  };
}

/**
 * Execute group_aggregate tool.
 */
export async function executeGroupAggregate(params: GroupAggregateParams): Promise<GroupAggregateResult> {
  const values = await readSheetData(params.sheet);
  const table = createTable(values, true);

  if (!table) {
    return { groups: [], groupBy: [], metrics: [] };
  }

  const profile = await executeGetProfile({ sheet: params.sheet });
  let result = table;

  // Apply filters
  if (params.filters?.length) {
    result = applyFilters(result, params.filters, profile);
  }

  // Resolve column names
  const groupByCols = params.groupBy.map(c => resolveColumn(c, profile));

  // Build aggregation spec
  const aggSpec: Record<string, ReturnType<typeof aq.escape>> = {};
  const metricNames: string[] = [];

  for (const metric of params.metrics) {
    const col = resolveColumn(metric.column, profile);
    const name = `${col}_${metric.aggregation}`;
    metricNames.push(name);

    switch (metric.aggregation) {
      case 'sum':
        aggSpec[name] = aq.escape((d: Record<string, unknown>) => op.sum(d[col] as number));
        break;
      case 'avg':
        aggSpec[name] = aq.escape((d: Record<string, unknown>) => op.mean(d[col] as number));
        break;
      case 'min':
        aggSpec[name] = aq.escape((d: Record<string, unknown>) => op.min(d[col] as number));
        break;
      case 'max':
        aggSpec[name] = aq.escape((d: Record<string, unknown>) => op.max(d[col] as number));
        break;
      case 'count':
        aggSpec[name] = () => op.count();
        break;
      case 'countUnique':
        aggSpec[name] = aq.escape((d: Record<string, unknown>) => op.distinct(d[col]));
        break;
    }
  }

  // Group and aggregate
  result = result.groupby(groupByCols).rollup(aggSpec);

  // Limit
  const limit = Math.min(params.limit ?? 100, LIMITS.GROUP_AGGREGATE);
  result = result.slice(0, limit);

  return {
    groups: result.objects() as Record<string, unknown>[],
    groupBy: groupByCols,
    metrics: metricNames,
  };
}

/**
 * Execute find_outliers tool.
 */
export async function executeFindOutliers(params: FindOutliersParams): Promise<FindOutliersResult> {
  const values = await readSheetData(params.sheet);
  const table = createTable(values, true);

  if (!table) {
    return { outliers: [], stats: null, method: params.method };
  }

  const profile = await executeGetProfile({ sheet: params.sheet });
  const col = resolveColumn(params.column, profile);
  const threshold = params.threshold ?? 2;
  const limit = Math.min(params.limit ?? 20, LIMITS.FIND_OUTLIERS);

  if (params.method === 'zscore') {
    // Calculate stats
    const colValues = table.array(col) as unknown[];
    const numericValues = colValues.filter((v): v is number => typeof v === 'number' && !isNaN(v));

    if (numericValues.length === 0) {
      return { outliers: [], stats: null, method: 'zscore' };
    }

    const mean = numericValues.reduce((a, b) => a + b, 0) / numericValues.length;
    const stdev = Math.sqrt(
      numericValues.map(v => Math.pow(v - mean, 2)).reduce((a, b) => a + b, 0) / numericValues.length
    );

    if (stdev === 0) {
      return { outliers: [], stats: { mean, stdev }, method: 'zscore' };
    }

    // Find outliers
    const outliers = table
      .derive({ _zscore: aq.escape((d: Record<string, unknown>) => {
        const v = d[col] as number;
        return typeof v === 'number' ? Math.abs((v - mean) / stdev) : 0;
      })})
      .filter(aq.escape((d: Record<string, unknown>) => (d._zscore as number) > threshold))
      .orderby(aq.desc('_zscore'))
      .slice(0, limit)
      .objects() as Record<string, unknown>[];

    return { outliers, stats: { mean, stdev }, method: 'zscore' };
  }

  // TODO: IQR and percentile methods
  return { outliers: [], stats: null, method: params.method };
}

/**
 * Execute search_values tool.
 */
export async function executeSearchValues(params: SearchValuesParams): Promise<SearchResult> {
  const values = await readSheetData(params.sheet);
  const table = createTable(values, true);

  if (!table) {
    return { matches: [], total: 0 };
  }

  const profile = await executeGetProfile({ sheet: params.sheet });
  const searchCols = params.columns?.map(c => resolveColumn(c, profile))
    ?? profile.columns.map(c => c.header).filter((h): h is string => h !== null);

  const query = params.query.toLowerCase();
  const limit = Math.min(params.limit ?? 20, LIMITS.SEARCH_VALUES);

  // Filter rows that match
  const matches = table
    .filter(aq.escape((d: Record<string, unknown>) => {
      for (const col of searchCols) {
        const val = String(d[col] ?? '').toLowerCase();
        if (params.fuzzy) {
          // Simple fuzzy: contains
          if (val.includes(query)) return true;
        } else {
          // Exact match (case-insensitive)
          if (val === query) return true;
        }
      }
      return false;
    }))
    .slice(0, limit)
    .objects() as Record<string, unknown>[];

  return { matches, total: matches.length };
}

// ============================================
// Helper Functions
// ============================================

/**
 * Read all data from a sheet.
 */
async function readSheetData(sheetName?: string): Promise<unknown[][]> {
  return Excel.run(async (context) => {
    const sheet = sheetName
      ? context.workbook.worksheets.getItem(sheetName)
      : context.workbook.worksheets.getActiveWorksheet();

    const usedRange = sheet.getUsedRangeOrNullObject();
    usedRange.load('values');
    await context.sync();

    if (usedRange.isNullObject) {
      return [];
    }

    return usedRange.values;
  });
}

/**
 * Resolve column reference (letter or name) to column name.
 */
function resolveColumn(ref: string, profile: SheetProfile): string {
  // If it's a letter like "A", "B", "AA", convert to header name
  if (/^[A-Z]+$/i.test(ref)) {
    const idx = columnToNumber(ref.toUpperCase()) - 1;
    const col = profile.columns[idx];
    return col?.header ?? ref;
  }
  return ref;
}

/**
 * Apply filters to an Arquero table.
 */
function applyFilters(table: ColumnTable, filters: FilterSpec[], profile: SheetProfile): ColumnTable {
  for (const filter of filters) {
    const col = resolveColumn(filter.column, profile);
    const colProfile = profile.columns.find(c => c.header === col || c.letter === filter.column);
    const value = coerceValue(filter.value, colProfile?.dataType);
    const value2 = filter.value2 ? coerceValue(filter.value2, colProfile?.dataType) : undefined;

    table = table.filter(aq.escape((d: Record<string, unknown>) => {
      const cellValue = d[col];

      switch (filter.operator) {
        case 'eq': return cellValue === value;
        case 'neq': return cellValue !== value;
        case 'gt': return (cellValue as number) > (value as number);
        case 'lt': return (cellValue as number) < (value as number);
        case 'gte': return (cellValue as number) >= (value as number);
        case 'lte': return (cellValue as number) <= (value as number);
        case 'contains': return String(cellValue ?? '').toLowerCase().includes(String(value).toLowerCase());
        case 'startsWith': return String(cellValue ?? '').toLowerCase().startsWith(String(value).toLowerCase());
        case 'between': return (cellValue as number) >= (value as number) && (cellValue as number) <= (value2 as number);
        case 'in': return Array.isArray(value) && value.includes(cellValue);
        default: return true;
      }
    }));
  }
  return table;
}

/**
 * Coerce filter value to appropriate type.
 */
function coerceValue(value: unknown, dataType?: string): unknown {
  if (value == null) return value;

  if (dataType === 'date' && typeof value === 'string') {
    const parsed = Date.parse(value);
    return isNaN(parsed) ? value : new Date(parsed);
  }

  if ((dataType === 'number' || dataType === 'currency') && typeof value === 'string') {
    const cleaned = value.replace(/[$,€£¥₱%]/g, '');
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? value : parsed;
  }

  return value;
}
```

---

### Step 5: Update Executor (`apps/addin/src/lib/tools/executor.ts`)

Add import and cases for read tools:
```typescript
import {
  executeGetProfile,
  executeSelectRows,
  executeGroupAggregate,
  executeFindOutliers,
  executeSearchValues,
} from './readers';
import type {
  GetProfileParams,
  SelectRowsParams,
  GroupAggregateParams,
  FindOutliersParams,
  SearchValuesParams,
} from '@cellix/shared';

// In the switch statement, add:
case 'get_profile': {
  const params = toolCall.parameters as unknown as GetProfileParams;
  resultData = await executeGetProfile(params);
  break;
}

case 'select_rows': {
  const params = toolCall.parameters as unknown as SelectRowsParams;
  resultData = await executeSelectRows(params);
  break;
}

case 'group_aggregate': {
  const params = toolCall.parameters as unknown as GroupAggregateParams;
  resultData = await executeGroupAggregate(params);
  break;
}

case 'find_outliers': {
  const params = toolCall.parameters as unknown as FindOutliersParams;
  resultData = await executeFindOutliers(params);
  break;
}

case 'search_values': {
  const params = toolCall.parameters as unknown as SearchValuesParams;
  resultData = await executeSearchValues(params);
  break;
}
```

---

## Validation Gates

### Build
- [ ] `pnpm build` passes in root
- [ ] `pnpm build` passes in `packages/shared`
- [ ] `pnpm build` passes in `apps/backend`
- [ ] `pnpm build` passes in `apps/addin`

### Lint & Types
- [ ] `pnpm lint` passes
- [ ] `pnpm typecheck` passes

### Manual Testing
- [ ] `get_profile` returns cached profile or extracts new one
- [ ] `select_rows` filters by column value correctly
- [ ] `select_rows` pagination works (limit/offset)
- [ ] `group_aggregate` computes correct sum/avg/count
- [ ] `find_outliers` detects outliers with z-score
- [ ] `search_values` finds exact matches
- [ ] Column resolution works for both letters ("A") and names ("Revenue")
- [ ] Safety limits enforced (max 500 rows, etc.)

---

## Safety Considerations

1. **Read-Only** - These tools only read data, no preview required
2. **Limits Enforced** - Max 500 rows, 1000 groups, 100 outliers
3. **No External Access** - All operations local to workbook
4. **Type Coercion** - Safely handle string dates/numbers from AI

---

## Confidence Score

**8/10** - High confidence

**Reasoning:**
- Clear patterns to follow from existing tool infrastructure
- Arquero utilities already built in 5A
- Profile system provides column resolution
- Main uncertainty: Filter edge cases and type coercion

**Risks:**
- Arquero escape syntax for complex filters may need tuning
- Large sheet performance (mitigated by limits)
- AI may not always use profile-first approach (prompt guidance needed)

---

## Notes

### Post-Implementation
- Phase 5C will wire profile into the chat context automatically
- Consider adding system prompt guidance for query planning

### Future Enhancements
- IQR and percentile outlier methods
- Fuzzy search with Levenshtein distance
- Caching of query results
