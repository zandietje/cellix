# PRP: Phase 5A - Sheet Profile System

## Overview

Build a cached metadata layer that gives the LLM a "mental model" of Excel workbooks without sending all the data. This enables intelligent data querying by first understanding sheet structure (columns, types, statistics, semantics) before requesting specific data slices.

**Key Value:** Reduce token usage by 50-70% while improving query accuracy for large sheets.

## Context

- **Phase:** 5A (Post-MVP, Sheet Intelligence foundation)
- **Priority:** High - Foundation for accurate analysis of real-world data
- **Prerequisite:** MVP validated (Phases 1-4 complete)
- **Duration:** ~1 week implementation

### Dependencies
- Existing Excel read helpers (`apps/addin/src/lib/excel/reader.ts`)
- Existing context extraction (`apps/addin/src/lib/excel/context.ts`)
- Shared types package (`packages/shared/src/types/`)
- Zustand store patterns (`apps/addin/src/store/`)

### Related Files to Modify
- `packages/shared/src/types/index.ts` - Export new profile types
- `apps/addin/package.json` - Add arquero dependency

## Documentation References

- [Arquero API Reference](https://idl.uw.edu/arquero/api/) - Table operations, filtering, aggregation
- [Office.js Worksheet Events](https://learn.microsoft.com/en-us/javascript/api/excel/excel.worksheet#events) - onChanged event
- [localStorage API](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage) - Cache persistence

## Research Findings

### Existing Patterns in Codebase

**Type Definitions Pattern** (from `packages/shared/src/types/excel.ts`):
```typescript
/** Data type detected in a column */
export type DataType = 'number' | 'date' | 'currency' | 'percentage' | 'text' | 'mixed' | 'empty';

/** Basic statistics for a numeric column */
export interface ColumnStats {
  column: number;
  header: string;
  sum: number;
  avg: number;
  min: number;
  max: number;
  count: number;
}
```

**Context Extraction Pattern** (from `apps/addin/src/lib/excel/context.ts`):
```typescript
// Gather all data in parallel where possible
const [values, address, activeSheet, allSheets, tables] = await Promise.all([
  getSelectedRangeValues(),
  getSelectedRangeAddress(),
  // ...
]);

// Sample if too large
const { sampledValues, sampled } = sampleValues(values);
```

**Zustand Store Pattern** (from `apps/addin/src/store/excelStore.ts`):
```typescript
export const useExcelStore = create<ExcelState>((set) => ({
  context: null,
  isLoading: false,
  error: null,
  setContext: (context) => set({ context, error: null, lastRefresh: Date.now() }),
}));
```

### Arquero API Patterns

```typescript
import * as aq from 'arquero';
import { op } from 'arquero';

// Create table from 2D array
const table = aq.from(values.slice(1), { columns: headers });

// Calculate statistics
const stats = table.rollup({
  sum: d => op.sum(d[column]),
  avg: d => op.mean(d[column]),
  min: d => op.min(d[column]),
  max: d => op.max(d[column]),
  count: () => op.count(),
  stdev: d => op.stdev(d[column]),
}).object();

// Find outliers via z-score
const outliers = table
  .derive({ zscore: d => Math.abs((d[col] - mean) / stdev) })
  .filter(d => d.zscore > threshold)
  .objects();
```

### Office.js Event Pattern

```typescript
// Register change listener
await Excel.run(async (context) => {
  const sheet = context.workbook.worksheets.getActiveWorksheet();
  sheet.onChanged.add(handleChange);
  await context.sync();
});

// Handler receives WorksheetChangedEventArgs
async function handleChange(event: Excel.WorksheetChangedEventArgs) {
  // event.address - changed range
  // event.worksheetId - sheet identifier
}
```

### Gotchas & Edge Cases

1. **Large Sheet Chunking** - Office.js can timeout on sheets > 10K rows. Must read in chunks.
2. **Type Coercion** - Excel may return numbers as strings or dates as serial numbers.
3. **Empty Rows/Columns** - `usedRange` may include empty cells; need to detect actual data bounds.
4. **Mixed Types** - A "number" column may have text headers or error values.
5. **localStorage Limits** - ~5MB limit; profiles should be compact (~500 tokens each).
6. **Event Debouncing** - onChanged fires for every cell; must debounce to avoid thrashing.

---

## Implementation Plan

### Files to Create

| File | Description |
|------|-------------|
| `packages/shared/src/types/profile.ts` | Profile type definitions |
| `apps/addin/src/lib/excel/profiler.ts` | Profile extraction logic |
| `apps/addin/src/lib/excel/profileCache.ts` | In-memory + localStorage cache |
| `apps/addin/src/lib/data/arquero.ts` | Arquero wrapper utilities |
| `apps/addin/src/store/profileStore.ts` | Zustand store for profiles |

### Files to Modify

| File | Changes |
|------|---------|
| `packages/shared/src/types/index.ts` | Export profile types |
| `apps/addin/package.json` | Add `arquero` dependency |

---

### Implementation Steps

#### Step 1: Install Arquero

```bash
cd apps/addin
pnpm add arquero
```

Add to `apps/addin/package.json`:
```json
{
  "dependencies": {
    "arquero": "^6.0.0"
  }
}
```

---

#### Step 2: Define Profile Types

**File:** `packages/shared/src/types/profile.ts`

```typescript
/**
 * Sheet Profile System Types for Cellix.
 * Provides metadata about workbook structure for intelligent LLM context.
 */

import type { DataType } from './excel.js';

/** Full profile for one worksheet */
export interface SheetProfile {
  /** Worksheet name */
  sheetName: string;
  /** Used range address (e.g., "A1:Z1000") */
  usedRange: string;
  /** Total row count in used range */
  rowCount: number;
  /** Total column count in used range */
  columnCount: number;
  /** Per-column metadata */
  columns: ColumnProfile[];
  /** Excel tables in this sheet */
  tables: SheetTableInfo[];
  /** Unix timestamp when profile was extracted */
  extractedAt: number;
  /** Version number for cache invalidation */
  version: number;
}

/** Metadata for a single column */
export interface ColumnProfile {
  /** 0-based column index */
  index: number;
  /** Excel column letter (A, B, ..., AA, etc.) */
  letter: string;
  /** Header value (first row) or null if none detected */
  header: string | null;
  /** Semantic name inferred from header/values */
  inferredName: SemanticColumnType;
  /** Detected data type */
  dataType: DataType;
  /** Statistics for numeric columns, null otherwise */
  stats: ProfileColumnStats | null;
  /** Sample values (first 3 non-empty) */
  samples: unknown[];
  /** Count of unique values */
  uniqueCount: number;
  /** Count of null/empty values */
  nullCount: number;
  /** Data quality indicators */
  quality: QualitySignals;
}

/** Extended statistics for profile columns */
export interface ProfileColumnStats {
  /** Sum of numeric values */
  sum: number;
  /** Arithmetic mean */
  avg: number;
  /** Minimum value */
  min: number;
  /** Maximum value */
  max: number;
  /** Count of numeric values */
  count: number;
  /** Standard deviation */
  stdev: number;
}

/** Data quality indicators for a column */
export interface QualitySignals {
  /** Whether column has duplicate values */
  hasDuplicates: boolean;
  /** Whether column has mixed data types */
  hasMixedTypes: boolean;
  /** Whether column has statistical outliers (z-score > 2) */
  hasOutliers: boolean;
  /** Ratio of non-null values (0-1) */
  completeness: number;
}

/** Table info within a sheet profile */
export interface SheetTableInfo {
  /** Table name */
  name: string;
  /** Table range address */
  address: string;
  /** Header names */
  headers: string[];
}

/** Lightweight summary of all sheets in workbook */
export interface WorkbookInventory {
  /** Active sheet name */
  activeSheet: string;
  /** Summary of each sheet */
  sheets: SheetSummary[];
  /** Unix timestamp when inventory was extracted */
  extractedAt: number;
}

/** Minimal info about a sheet for inventory */
export interface SheetSummary {
  /** Sheet name */
  name: string;
  /** Used range address or null if empty */
  usedRange: string | null;
  /** Approximate row count */
  rowCount: number;
  /** Approximate column count */
  columnCount: number;
  /** Whether this is the active sheet */
  isActive: boolean;
}

/** Semantic column types for ecommerce data */
export type SemanticColumnType =
  | 'date'
  | 'product_id'
  | 'order_id'
  | 'revenue'
  | 'cost'
  | 'category'
  | 'location'
  | 'quantity'
  | 'rate'
  | 'currency'
  | 'percentage'
  | 'text'
  | 'unknown';

/** Cache entry for a sheet profile */
export interface ProfileCacheEntry {
  /** The cached profile */
  profile: SheetProfile;
  /** Sheet name (cache key) */
  sheetName: string;
  /** Version for invalidation */
  version: number;
  /** When cached */
  cachedAt: number;
}

/** Profile extraction options */
export interface ProfileExtractionOptions {
  /** Maximum rows per chunk for large sheets */
  chunkSize?: number;
  /** Progress callback (0-1) */
  onProgress?: (progress: number) => void;
  /** Abort signal for cancellation */
  abortSignal?: AbortSignal;
}
```

---

#### Step 3: Update Shared Package Exports

**File:** `packages/shared/src/types/index.ts`

```typescript
export * from './chat.js';
export * from './api.js';
export * from './excel.js';
export * from './tools.js';
export * from './profile.js';  // Add this line
```

---

#### Step 4: Create Arquero Wrapper

**File:** `apps/addin/src/lib/data/arquero.ts`

```typescript
/**
 * Arquero wrapper utilities for data processing.
 * Provides typed helpers for table operations, statistics, and aggregation.
 */

import * as aq from 'arquero';
import { op } from 'arquero';
import type { ColumnType } from 'arquero/dist/types/table/ColumnType';
import type { ProfileColumnStats } from '@cellix/shared';

// Re-export for convenience
export { aq, op };

/**
 * Create an Arquero table from Excel-style 2D array.
 * @param values - 2D array where first row is headers
 * @param hasHeaders - Whether first row contains headers
 */
export function createTable(
  values: unknown[][],
  hasHeaders = true
): aq.internal.ColumnTable | null {
  if (values.length === 0) {
    return null;
  }

  const headers = hasHeaders
    ? values[0].map((h, i) => String(h ?? `Column${i + 1}`))
    : values[0].map((_, i) => `Column${i + 1}`);

  const dataRows = hasHeaders ? values.slice(1) : values;

  if (dataRows.length === 0) {
    return null;
  }

  // Convert to column-oriented format for Arquero
  const columns: Record<string, unknown[]> = {};
  headers.forEach((header, colIndex) => {
    columns[header] = dataRows.map(row => row[colIndex]);
  });

  return aq.table(columns);
}

/**
 * Calculate statistics for a numeric column.
 * @param table - Arquero table
 * @param column - Column name
 * @returns Statistics or null if column is not numeric
 */
export function calculateColumnStats(
  table: aq.internal.ColumnTable,
  column: string
): ProfileColumnStats | null {
  // Check if column exists and has numeric values
  const values = table.array(column);
  const numericValues = values.filter(
    (v): v is number => typeof v === 'number' && !isNaN(v)
  );

  if (numericValues.length === 0) {
    return null;
  }

  try {
    const result = table
      .filter(aq.escape((d: Record<string, unknown>) =>
        typeof d[column] === 'number' && !isNaN(d[column] as number)
      ))
      .rollup({
        sum: aq.escape((d: Record<string, unknown>) => op.sum(d[column] as number)),
        avg: aq.escape((d: Record<string, unknown>) => op.mean(d[column] as number)),
        min: aq.escape((d: Record<string, unknown>) => op.min(d[column] as number)),
        max: aq.escape((d: Record<string, unknown>) => op.max(d[column] as number)),
        count: () => op.count(),
        stdev: aq.escape((d: Record<string, unknown>) => op.stdev(d[column] as number)),
      })
      .object() as ProfileColumnStats;

    return {
      sum: result.sum ?? 0,
      avg: result.avg ?? 0,
      min: result.min ?? 0,
      max: result.max ?? 0,
      count: result.count ?? 0,
      stdev: result.stdev ?? 0,
    };
  } catch {
    return null;
  }
}

/**
 * Count unique values in a column.
 */
export function countUnique(table: aq.internal.ColumnTable, column: string): number {
  try {
    return table
      .rollup({ count: aq.escape((d: Record<string, unknown>) => op.distinct(d[column])) })
      .object().count as number;
  } catch {
    return 0;
  }
}

/**
 * Count null/empty values in a column.
 */
export function countNulls(values: unknown[]): number {
  return values.filter(v => v == null || v === '').length;
}

/**
 * Check if column has outliers using z-score method.
 * @param table - Arquero table
 * @param column - Column name
 * @param threshold - Z-score threshold (default 2)
 */
export function hasOutliers(
  table: aq.internal.ColumnTable,
  column: string,
  threshold = 2
): boolean {
  const stats = calculateColumnStats(table, column);
  if (!stats || stats.stdev === 0) {
    return false;
  }

  try {
    const outlierCount = table
      .filter(aq.escape((d: Record<string, unknown>) => {
        const value = d[column] as number;
        if (typeof value !== 'number' || isNaN(value)) return false;
        const zscore = Math.abs((value - stats.avg) / stats.stdev);
        return zscore > threshold;
      }))
      .numRows();

    return outlierCount > 0;
  } catch {
    return false;
  }
}

/**
 * Check if column has duplicate values.
 */
export function hasDuplicates(table: aq.internal.ColumnTable, column: string): boolean {
  const totalRows = table.numRows();
  const uniqueCount = countUnique(table, column);
  return uniqueCount < totalRows;
}

/**
 * Get sample values from a column (first N non-empty values).
 */
export function getSamples(values: unknown[], count = 3): unknown[] {
  return values
    .filter(v => v != null && v !== '')
    .slice(0, count);
}
```

---

#### Step 5: Create Profile Extractor

**File:** `apps/addin/src/lib/excel/profiler.ts`

```typescript
/**
 * Sheet Profile Extractor for Cellix.
 * Extracts metadata about worksheet structure for intelligent LLM context.
 */

import type {
  SheetProfile,
  ColumnProfile,
  QualitySignals,
  WorkbookInventory,
  SheetSummary,
  ProfileExtractionOptions,
  SemanticColumnType,
  SheetTableInfo,
} from '@cellix/shared';
import type { DataType } from '@cellix/shared';
import { numberToColumn } from '@cellix/shared';
import {
  createTable,
  calculateColumnStats,
  countUnique,
  countNulls,
  hasOutliers,
  hasDuplicates,
  getSamples,
} from '../data/arquero';

/** Default chunk size for large sheet reading */
const DEFAULT_CHUNK_SIZE = 5000;

/** Maximum rows to process for profile (beyond this, sample) */
const MAX_PROFILE_ROWS = 50000;

/**
 * Extract a full profile for a worksheet.
 * For large sheets, reads in chunks to avoid timeout.
 */
export async function extractSheetProfile(
  sheetName?: string,
  options: ProfileExtractionOptions = {}
): Promise<SheetProfile> {
  const { chunkSize = DEFAULT_CHUNK_SIZE, onProgress, abortSignal } = options;

  return Excel.run(async (context) => {
    // Get sheet
    const sheet = sheetName
      ? context.workbook.worksheets.getItem(sheetName)
      : context.workbook.worksheets.getActiveWorksheet();

    sheet.load('name');
    const usedRange = sheet.getUsedRange();
    usedRange.load(['address', 'rowCount', 'columnCount']);

    await context.sync();

    // Check for cancellation
    if (abortSignal?.aborted) {
      throw new Error('Profile extraction cancelled');
    }

    const totalRows = usedRange.rowCount;
    const totalCols = usedRange.columnCount;

    // For small sheets, read all at once
    let values: unknown[][];
    if (totalRows <= chunkSize) {
      usedRange.load('values');
      await context.sync();
      values = usedRange.values;
      onProgress?.(1);
    } else {
      // For large sheets, read in chunks
      values = await readChunked(
        sheet,
        totalRows,
        totalCols,
        chunkSize,
        onProgress,
        abortSignal
      );
    }

    // Cap at MAX_PROFILE_ROWS for statistics
    const cappedValues = values.length > MAX_PROFILE_ROWS
      ? values.slice(0, MAX_PROFILE_ROWS)
      : values;

    // Extract headers (first row)
    const headers = cappedValues.length > 0
      ? cappedValues[0].map((cell, i) => String(cell ?? ''))
      : [];

    // Get table info
    const tables = await extractTableInfo(sheet, context);

    // Build column profiles
    const columns = buildColumnProfiles(cappedValues, headers);

    return {
      sheetName: sheet.name,
      usedRange: usedRange.address.includes('!')
        ? usedRange.address.split('!')[1]
        : usedRange.address,
      rowCount: totalRows,
      columnCount: totalCols,
      columns,
      tables,
      extractedAt: Date.now(),
      version: 1,
    };
  });
}

/**
 * Extract lightweight inventory of all sheets.
 * Fast operation for initial context.
 */
export async function extractWorkbookInventory(): Promise<WorkbookInventory> {
  return Excel.run(async (context) => {
    const sheets = context.workbook.worksheets;
    const activeSheet = context.workbook.worksheets.getActiveWorksheet();

    sheets.load('items/name');
    activeSheet.load('name');
    await context.sync();

    const sheetSummaries: SheetSummary[] = [];

    for (const sheet of sheets.items) {
      try {
        const usedRange = sheet.getUsedRangeOrNullObject();
        usedRange.load(['address', 'rowCount', 'columnCount']);
        await context.sync();

        sheetSummaries.push({
          name: sheet.name,
          usedRange: usedRange.isNullObject ? null : usedRange.address.split('!')[1] ?? usedRange.address,
          rowCount: usedRange.isNullObject ? 0 : usedRange.rowCount,
          columnCount: usedRange.isNullObject ? 0 : usedRange.columnCount,
          isActive: sheet.name === activeSheet.name,
        });
      } catch {
        // Sheet might be empty or inaccessible
        sheetSummaries.push({
          name: sheet.name,
          usedRange: null,
          rowCount: 0,
          columnCount: 0,
          isActive: sheet.name === activeSheet.name,
        });
      }
    }

    return {
      activeSheet: activeSheet.name,
      sheets: sheetSummaries,
      extractedAt: Date.now(),
    };
  });
}

/**
 * Read large range in chunks to avoid timeout.
 */
async function readChunked(
  sheet: Excel.Worksheet,
  totalRows: number,
  totalCols: number,
  chunkSize: number,
  onProgress?: (progress: number) => void,
  abortSignal?: AbortSignal
): Promise<unknown[][]> {
  const allValues: unknown[][] = [];
  const chunks = Math.ceil(totalRows / chunkSize);

  for (let i = 0; i < chunks; i++) {
    if (abortSignal?.aborted) {
      throw new Error('Profile extraction cancelled');
    }

    const startRow = i * chunkSize;
    const rowsToRead = Math.min(chunkSize, totalRows - startRow);

    // getRangeByIndexes is 0-based
    const chunk = sheet.getRangeByIndexes(startRow, 0, rowsToRead, totalCols);
    chunk.load('values');

    await sheet.context.sync();

    allValues.push(...chunk.values);
    onProgress?.((i + 1) / chunks);
  }

  return allValues;
}

/**
 * Extract table information from sheet.
 */
async function extractTableInfo(
  sheet: Excel.Worksheet,
  context: Excel.RequestContext
): Promise<SheetTableInfo[]> {
  const tables = sheet.tables;
  tables.load('items/name,items/headerRowRange');

  try {
    await context.sync();

    const tableInfos: SheetTableInfo[] = [];

    for (const table of tables.items) {
      const headerRange = table.getHeaderRowRange();
      headerRange.load(['address', 'values']);
      await context.sync();

      tableInfos.push({
        name: table.name,
        address: headerRange.address.split('!')[1] ?? headerRange.address,
        headers: headerRange.values[0]?.map(h => String(h ?? '')) ?? [],
      });
    }

    return tableInfos;
  } catch {
    return [];
  }
}

/**
 * Build column profiles from values.
 */
function buildColumnProfiles(values: unknown[][], headers: string[]): ColumnProfile[] {
  if (values.length < 2 || headers.length === 0) {
    return [];
  }

  const dataRows = values.slice(1);
  const table = createTable(values, true);

  return headers.map((header, index) => {
    const columnValues = dataRows.map(row => row[index]);
    const dataType = detectDataType(columnValues);
    const stats = table ? calculateColumnStats(table, header) : null;
    const quality = detectQualitySignals(table, header, columnValues, dataType);

    return {
      index,
      letter: numberToColumn(index + 1),
      header: header || null,
      inferredName: inferColumnSemantic(header, columnValues),
      dataType,
      stats,
      samples: getSamples(columnValues, 3),
      uniqueCount: table ? countUnique(table, header) : 0,
      nullCount: countNulls(columnValues),
      quality,
    };
  });
}

/**
 * Detect data type from column values.
 */
function detectDataType(values: unknown[]): DataType {
  const nonEmpty = values.filter(v => v != null && v !== '');

  if (nonEmpty.length === 0) {
    return 'empty';
  }

  const types = nonEmpty.map(classifyValue);
  const typeCounts = types.reduce((acc, type) => {
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {} as Record<DataType, number>);

  const entries = Object.entries(typeCounts);
  entries.sort((a, b) => b[1] - a[1]);

  const [dominantType, count] = entries[0];

  // If >80% are same type, use that
  if (count / nonEmpty.length >= 0.8) {
    return dominantType as DataType;
  }

  return 'mixed';
}

/**
 * Classify a single value's type.
 */
function classifyValue(value: unknown): DataType {
  if (typeof value === 'number') {
    return 'number';
  }

  const str = String(value);

  // Currency patterns
  if (/^[$\u20AC\u00A3\u00A5\u20B1][\d,.]+$/.test(str) ||
      /^[\d,.]+[$\u20AC\u00A3\u00A5\u20B1]$/.test(str)) {
    return 'currency';
  }

  // Percentage
  if (/^[\d.]+%$/.test(str)) {
    return 'percentage';
  }

  // Date patterns
  if (!isNaN(Date.parse(str)) && /\d{1,4}[-/]\d{1,2}[-/]\d{1,4}/.test(str)) {
    return 'date';
  }

  // Numeric string
  const cleaned = str.replace(/,/g, '');
  if (!isNaN(parseFloat(cleaned)) && isFinite(Number(cleaned))) {
    return 'number';
  }

  return 'text';
}

/**
 * Detect quality signals for a column.
 */
function detectQualitySignals(
  table: ReturnType<typeof createTable>,
  header: string,
  values: unknown[],
  dataType: DataType
): QualitySignals {
  const nonEmpty = values.filter(v => v != null && v !== '');
  const completeness = values.length > 0 ? nonEmpty.length / values.length : 0;

  // Detect mixed types
  const types = nonEmpty.map(classifyValue);
  const uniqueTypes = new Set(types);
  const hasMixedTypes = uniqueTypes.size > 1 && !uniqueTypes.has('mixed');

  return {
    hasDuplicates: table ? hasDuplicates(table, header) : false,
    hasMixedTypes,
    hasOutliers: table && (dataType === 'number' || dataType === 'currency')
      ? hasOutliers(table, header)
      : false,
    completeness,
  };
}

/**
 * Infer semantic meaning of column from header and values.
 */
function inferColumnSemantic(header: string | null, samples: unknown[]): SemanticColumnType {
  const h = (header || '').toLowerCase();

  // Header-based detection (ordered by specificity)
  if (/date|time|created|updated|timestamp/i.test(h)) return 'date';
  if (/sku|product.?id|item.?id|asin|barcode/i.test(h)) return 'product_id';
  if (/order.?id|transaction.?id|invoice/i.test(h)) return 'order_id';
  if (/revenue|sales|amount|total|gmv|price/i.test(h)) return 'revenue';
  if (/cost|spend|expense|cogs|fee/i.test(h)) return 'cost';
  if (/category|type|segment|group/i.test(h)) return 'category';
  if (/country|region|city|location|area|province/i.test(h)) return 'location';
  if (/qty|quantity|units|count|stock/i.test(h)) return 'quantity';
  if (/rate|ratio|roas|ctr|cvr|acos/i.test(h)) return 'rate';
  if (/name|title|description|comment/i.test(h)) return 'text';
  if (/%|percent/i.test(h)) return 'percentage';
  if (/\$|\u20AC|\u00A3|currency|amount/i.test(h)) return 'currency';

  // Value-based detection (fallback)
  const sampleStr = samples.map(s => String(s ?? '')).join(' ');
  if (/^(SKU-|PROD-|[A-Z]{2,}\d{4,})/i.test(sampleStr)) return 'product_id';
  if (/^[$\u20AC\u00A3\u00A5\u20B1]/.test(sampleStr)) return 'currency';
  if (/\d{4}[-/]\d{2}[-/]\d{2}/.test(sampleStr)) return 'date';

  return 'unknown';
}
```

---

#### Step 6: Create Profile Cache

**File:** `apps/addin/src/lib/excel/profileCache.ts`

```typescript
/**
 * Profile Cache for Cellix.
 * In-memory cache with localStorage persistence for sheet profiles.
 */

import type { SheetProfile, ProfileCacheEntry, WorkbookInventory } from '@cellix/shared';

/** localStorage key for profile cache */
const STORAGE_KEY = 'cellix_profile_cache';

/** Maximum age before profile is considered stale (5 minutes) */
const MAX_CACHE_AGE_MS = 5 * 60 * 1000;

/** Maximum entries in localStorage */
const MAX_CACHE_ENTRIES = 20;

/** In-memory cache */
const memoryCache = new Map<string, ProfileCacheEntry>();

/** Workbook inventory cache */
let inventoryCache: WorkbookInventory | null = null;
let inventoryCachedAt: number | null = null;

/**
 * Get profile from cache, or null if not cached/stale.
 */
export function getCachedProfile(sheetName: string): SheetProfile | null {
  // Check memory cache first
  const entry = memoryCache.get(sheetName);
  if (entry && !isStale(entry.cachedAt)) {
    return entry.profile;
  }

  // Check localStorage
  const stored = loadFromStorage();
  const storedEntry = stored[sheetName];
  if (storedEntry && !isStale(storedEntry.cachedAt)) {
    // Hydrate memory cache
    memoryCache.set(sheetName, storedEntry);
    return storedEntry.profile;
  }

  return null;
}

/**
 * Store profile in cache.
 */
export function setCachedProfile(profile: SheetProfile): void {
  const entry: ProfileCacheEntry = {
    profile,
    sheetName: profile.sheetName,
    version: profile.version,
    cachedAt: Date.now(),
  };

  // Update memory cache
  memoryCache.set(profile.sheetName, entry);

  // Update localStorage
  const stored = loadFromStorage();
  stored[profile.sheetName] = entry;

  // Prune old entries if needed
  const entries = Object.entries(stored);
  if (entries.length > MAX_CACHE_ENTRIES) {
    entries.sort((a, b) => a[1].cachedAt - b[1].cachedAt);
    const toRemove = entries.slice(0, entries.length - MAX_CACHE_ENTRIES);
    toRemove.forEach(([key]) => delete stored[key]);
  }

  saveToStorage(stored);
}

/**
 * Invalidate profile for a sheet.
 */
export function invalidateProfile(sheetName: string): void {
  memoryCache.delete(sheetName);

  const stored = loadFromStorage();
  delete stored[sheetName];
  saveToStorage(stored);
}

/**
 * Invalidate all cached profiles.
 */
export function invalidateAllProfiles(): void {
  memoryCache.clear();
  inventoryCache = null;
  inventoryCachedAt = null;
  saveToStorage({});
}

/**
 * Get cached workbook inventory.
 */
export function getCachedInventory(): WorkbookInventory | null {
  if (inventoryCache && inventoryCachedAt && !isStale(inventoryCachedAt)) {
    return inventoryCache;
  }
  return null;
}

/**
 * Set cached workbook inventory.
 */
export function setCachedInventory(inventory: WorkbookInventory): void {
  inventoryCache = inventory;
  inventoryCachedAt = Date.now();
}

/**
 * Check if timestamp is stale.
 */
function isStale(cachedAt: number): boolean {
  return Date.now() - cachedAt > MAX_CACHE_AGE_MS;
}

/**
 * Load cache from localStorage.
 */
function loadFromStorage(): Record<string, ProfileCacheEntry> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.warn('[ProfileCache] Failed to load from localStorage:', e);
  }
  return {};
}

/**
 * Save cache to localStorage.
 */
function saveToStorage(cache: Record<string, ProfileCacheEntry>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch (e) {
    console.warn('[ProfileCache] Failed to save to localStorage:', e);
  }
}

/**
 * Get cache statistics for debugging.
 */
export function getCacheStats(): {
  memoryEntries: number;
  storageEntries: number;
  hasInventory: boolean;
} {
  const stored = loadFromStorage();
  return {
    memoryEntries: memoryCache.size,
    storageEntries: Object.keys(stored).length,
    hasInventory: inventoryCache !== null,
  };
}
```

---

#### Step 7: Create Profile Store

**File:** `apps/addin/src/store/profileStore.ts`

```typescript
/**
 * Zustand store for sheet profile state.
 * Manages profile extraction, caching, and invalidation.
 */

import { create } from 'zustand';
import type { SheetProfile, WorkbookInventory } from '@cellix/shared';
import { extractSheetProfile, extractWorkbookInventory } from '../lib/excel/profiler';
import {
  getCachedProfile,
  setCachedProfile,
  invalidateProfile,
  invalidateAllProfiles,
  getCachedInventory,
  setCachedInventory,
} from '../lib/excel/profileCache';

interface ProfileState {
  /** Current sheet profile */
  currentProfile: SheetProfile | null;
  /** Workbook inventory */
  inventory: WorkbookInventory | null;
  /** Whether profile is being extracted */
  isLoading: boolean;
  /** Extraction progress (0-1) */
  progress: number;
  /** Error message if extraction failed */
  error: string | null;

  // Actions
  /** Load profile for sheet (uses cache if available) */
  loadProfile: (sheetName?: string) => Promise<SheetProfile | null>;
  /** Force refresh profile (ignores cache) */
  refreshProfile: (sheetName?: string) => Promise<SheetProfile | null>;
  /** Load workbook inventory */
  loadInventory: () => Promise<WorkbookInventory | null>;
  /** Invalidate profile for sheet */
  invalidate: (sheetName: string) => void;
  /** Invalidate all profiles */
  invalidateAll: () => void;
  /** Clear current profile and error */
  reset: () => void;
}

export const useProfileStore = create<ProfileState>((set, get) => ({
  currentProfile: null,
  inventory: null,
  isLoading: false,
  progress: 0,
  error: null,

  loadProfile: async (sheetName?: string) => {
    // Try cache first
    const cached = sheetName ? getCachedProfile(sheetName) : null;
    if (cached) {
      set({ currentProfile: cached, error: null });
      return cached;
    }

    // Extract new profile
    return get().refreshProfile(sheetName);
  },

  refreshProfile: async (sheetName?: string) => {
    set({ isLoading: true, progress: 0, error: null });

    try {
      const profile = await extractSheetProfile(sheetName, {
        onProgress: (progress) => set({ progress }),
      });

      setCachedProfile(profile);
      set({ currentProfile: profile, isLoading: false, progress: 1 });
      return profile;
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Failed to extract profile';
      set({ error, isLoading: false });
      return null;
    }
  },

  loadInventory: async () => {
    // Try cache first
    const cached = getCachedInventory();
    if (cached) {
      set({ inventory: cached });
      return cached;
    }

    set({ isLoading: true, error: null });

    try {
      const inventory = await extractWorkbookInventory();
      setCachedInventory(inventory);
      set({ inventory, isLoading: false });
      return inventory;
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Failed to extract inventory';
      set({ error, isLoading: false });
      return null;
    }
  },

  invalidate: (sheetName: string) => {
    invalidateProfile(sheetName);
    const current = get().currentProfile;
    if (current?.sheetName === sheetName) {
      set({ currentProfile: null });
    }
  },

  invalidateAll: () => {
    invalidateAllProfiles();
    set({ currentProfile: null, inventory: null });
  },

  reset: () => {
    set({
      currentProfile: null,
      inventory: null,
      isLoading: false,
      progress: 0,
      error: null,
    });
  },
}));
```

---

#### Step 8: Add Event Listeners for Cache Invalidation

**File:** `apps/addin/src/lib/excel/profileEvents.ts`

```typescript
/**
 * Event listeners for profile cache invalidation.
 * Listens to worksheet changes and invalidates stale profiles.
 */

import { invalidateProfile } from './profileCache';

/** Debounce timeout handle */
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

/** Debounce delay in ms */
const DEBOUNCE_DELAY = 2000;

/** Track registered sheets to avoid duplicates */
const registeredSheets = new Set<string>();

/**
 * Register change listener for a worksheet.
 * Invalidates profile cache after changes (debounced).
 */
export async function registerSheetChangeListener(sheetName: string): Promise<void> {
  if (registeredSheets.has(sheetName)) {
    return;
  }

  try {
    await Excel.run(async (context) => {
      const sheet = context.workbook.worksheets.getItem(sheetName);

      sheet.onChanged.add((event) => {
        handleSheetChange(sheetName, event);
      });

      await context.sync();
      registeredSheets.add(sheetName);

      console.log(`[ProfileEvents] Registered change listener for sheet: ${sheetName}`);
    });
  } catch (e) {
    console.warn(`[ProfileEvents] Failed to register listener for ${sheetName}:`, e);
  }
}

/**
 * Handle worksheet change event with debouncing.
 */
function handleSheetChange(sheetName: string, _event: Excel.WorksheetChangedEventArgs): void {
  // Clear existing timer
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  // Set new timer
  debounceTimer = setTimeout(() => {
    console.log(`[ProfileEvents] Invalidating profile for sheet: ${sheetName}`);
    invalidateProfile(sheetName);
    debounceTimer = null;
  }, DEBOUNCE_DELAY);
}

/**
 * Unregister all change listeners.
 * Call on add-in shutdown.
 */
export function unregisterAllListeners(): void {
  registeredSheets.clear();
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
}
```

---

## Validation Gates

### Build
- [ ] `pnpm build` passes in root
- [ ] `pnpm build` passes in `apps/addin`
- [ ] `pnpm build` passes in `packages/shared`

### Lint
- [ ] `pnpm lint` passes
- [ ] No TypeScript errors (`pnpm typecheck`)

### Tests (Manual - No Unit Tests in Codebase Yet)
- [ ] Create test Excel file with sample ecommerce data
- [ ] Test `extractSheetProfile()` returns valid profile
- [ ] Test `extractWorkbookInventory()` lists all sheets
- [ ] Test profile cache stores and retrieves correctly
- [ ] Test cache invalidates on worksheet changes
- [ ] Test large sheet (10K+ rows) profiles without timeout

### Manual Testing Checklist
- [ ] Profile extracts correct column count and row count
- [ ] Column types detected correctly (number, date, text, currency)
- [ ] Semantic names inferred for common ecommerce headers (SKU, Revenue, Date)
- [ ] Statistics calculated correctly for numeric columns
- [ ] Quality signals detected (duplicates, mixed types, outliers)
- [ ] Cache persists across add-in restarts
- [ ] Cache invalidates after cell edits (with ~2s delay)
- [ ] Large sheet (50K rows) completes within 10 seconds

## Safety Considerations

1. **Memory Usage** - Large sheets read in chunks to avoid memory issues
2. **Office.js Timeouts** - Chunked reading prevents API timeout on large ranges
3. **localStorage Limits** - Cache pruned to max 20 entries to stay under 5MB limit
4. **Error Handling** - All Excel operations wrapped in try-catch with graceful fallbacks
5. **Type Safety** - Arquero operations typed to prevent runtime errors

## Confidence Score

**8/10** - High confidence for straightforward implementation

**Reasoning:**
- Clear type definitions with existing patterns to follow
- Arquero API is well-documented and stable
- Office.js patterns established in codebase
- Main uncertainty: Arquero type definitions may need adjustment for strict TypeScript

**Risks:**
- Arquero ESM imports may need Vite configuration
- Office.js onChanged event may have cross-platform quirks
- Large sheet performance needs real-world validation

## Notes

### Post-Implementation Steps
1. Add useProfile hook similar to useExcelContext
2. Integrate with AI context flow (Phase 5C)
3. Add profile display in UI (optional enhancement)

### Future Enhancements (Not in Scope)
- Progressive profiling (Level 0/1/2/3 depth)
- Background extraction on sheet activation
- Profile comparison for change detection
- Smart retrieval tools (select_rows, group_aggregate) - Phase 5B

### Test Data for Validation
Create test sheet with this structure:
```
| Date       | SKU        | Category    | Revenue  | Ad Spend | Orders |
|------------|------------|-------------|----------|----------|--------|
| 2024-01-01 | SKU-12345  | Electronics | 1500.00  | 150.00   | 45     |
| 2024-01-02 | SKU-67890  | Fashion     | 800.50   | 80.00    | 23     |
| 2024-01-03 | SKU-11111  | Electronics | 2100.00  | 200.00   | 62     |
```

Expected profile output:
- Date: `dataType: 'date'`, `inferredName: 'date'`
- SKU: `dataType: 'text'`, `inferredName: 'product_id'`
- Category: `dataType: 'text'`, `inferredName: 'category'`
- Revenue: `dataType: 'number'`, `inferredName: 'revenue'`, stats populated
- Ad Spend: `dataType: 'number'`, `inferredName: 'cost'`, stats populated
- Orders: `dataType: 'number'`, `inferredName: 'quantity'`, stats populated
