# PRP: Cellix Phase 2 - Excel Integration

## Overview

Implement Office.js read/write helpers and context extraction to enable the add-in to interact with Excel data. This phase establishes the core Excel manipulation capabilities that the AI will use in Phase 3 and the safety preview system will wrap in Phase 4.

## Context

- **Phase:** 2 (Excel Integration)
- **Timeline:** Week 2 of MVP
- **Dependencies:** Phase 1 complete (monorepo, add-in shell, basic chat UI, backend)
- **Related Files:**
  - `CLAUDE.md` - Project context and rules
  - `FEATURE_PLAN.md` - Detailed specifications (lines 168-204)
  - `INITIAL.md` - Phase 2 feature brief
  - `.claude/examples/add-in/ExcelReadHelper.ts` - Read patterns
  - `.claude/examples/add-in/ExcelWriteHelper.ts` - Write patterns
  - `.claude/examples/add-in/ContextExtractor.ts` - Context extraction patterns
  - `.claude/reference/office-js-patterns.md` - Office.js best practices
  - `.claude/reference/safety-controls.md` - Safety controls reference

## Documentation References

- [Excel.Range API](https://learn.microsoft.com/en-us/javascript/api/excel/excel.range) - Range object properties and methods
- [Office.js Application-Specific API Model](https://learn.microsoft.com/en-us/office/dev/add-ins/develop/application-specific-api-model) - Best practices for sync/load
- [Excel.Worksheet API](https://learn.microsoft.com/en-us/javascript/api/excel/excel.worksheet) - Worksheet operations
- [Excel.Table API](https://learn.microsoft.com/en-us/javascript/api/excel/excel.table) - Table operations
- [Fluent UI React v9](https://react.fluentui.dev/) - UI components

## Research Findings

### Existing Patterns (from Phase 1 codebase)

1. **Zustand Store Pattern** (`apps/addin/src/store/chatStore.ts`)
   - Simple state with actions
   - Export named hook (`useChatStore`)
   - JSDoc comments for public interface

2. **Component Pattern** (`apps/addin/src/components/chat/ChatPane.tsx`)
   - `makeStyles` from Fluent UI for styling
   - Tokens from `@fluentui/react-components`
   - Props interfaces defined inline

3. **Type Pattern** (`packages/shared/src/types/chat.ts`)
   - JSDoc comments for each type
   - Exported interfaces and type aliases
   - Barrel exports in `index.ts`

4. **Existing ExcelContext** (`packages/shared/src/types/chat.ts:52-63`)
   - Basic `ExcelContext` interface already exists
   - Needs expansion for full context extraction

### External Best Practices (from Office.js documentation)

1. **Proxy Object Pattern** - CRITICAL
   - Excel objects are proxies without data until loaded
   - MUST call `load()` with specific properties
   - MUST call `context.sync()` before reading values

2. **Batching Operations**
   - Minimize `context.sync()` calls (expensive network round-trips)
   - Queue multiple operations before single sync
   - Never put `sync()` inside loops

3. **Load Optimization**
   - Load only required properties: `range.load(['values', 'address'])`
   - Use navigation paths for nested: `range.load('format/font/name')`
   - Never call `load()` without arguments

4. **Error Handling**
   - Use `*OrNullObject` methods to avoid exceptions: `getItemOrNullObject()`
   - Check `isNullObject` property after sync
   - Handle `OfficeExtension.Error` specifically

### Gotchas & Edge Cases

1. **Empty Range Handling**
   - `getUsedRange()` throws `ItemNotFound` if sheet is empty
   - Use `getUsedRangeOrNullObject()` instead
   - Check `isNullObject` after sync

2. **Large Range Sampling**
   - Max 50 rows for AI context (per CLAUDE.md)
   - Max 20 columns to keep payload manageable
   - Always include first row (headers)

3. **Sheet Name Validation**
   - Max 31 characters
   - Cannot contain: `[ ] : * ? / \`
   - Excel auto-renames duplicates

4. **Formula Prefix**
   - Values starting with `=`, `+`, or `-` are interpreted as formulas
   - Use `range.values` for raw values, `range.formulas` for formulas

5. **Address Formats**
   - Full: `Sheet1!A1:B10`
   - Local: `A1:B10` (uses active sheet)
   - Single cell: `A1`

## Implementation Plan

### Files to Create

```
apps/addin/src/
├── lib/
│   ├── constants.ts                # Safety limits, configuration
│   └── excel/
│       ├── index.ts                # Barrel exports
│       ├── reader.ts               # Read operations (8 functions)
│       ├── writer.ts               # Write operations (8 functions)
│       ├── context.ts              # Context extraction
│       └── validation.ts           # Address/formula validation
├── hooks/
│   └── useExcelContext.ts          # React hook for Excel context
├── store/
│   └── excelStore.ts               # Excel state (context, loading)
└── components/
    └── controls/
        ├── index.ts                # Barrel exports
        ├── ControlPanel.tsx        # Main control panel container
        ├── ContextDisplay.tsx      # Shows current context summary
        └── RangeSelector.tsx       # Range selection buttons

packages/shared/src/types/
└── excel.ts                        # Extended Excel types
```

### Files to Modify

1. `packages/shared/src/types/index.ts` - Add excel.ts export
2. `apps/addin/src/store/index.ts` - Add excelStore export
3. `apps/addin/src/App.tsx` - Add ControlPanel to layout (maybe as collapsible)
4. `apps/addin/src/store/uiStore.ts` - Add 'controls' to TabId if needed

### Implementation Steps

#### Step 1: Create Safety Constants

```typescript
// apps/addin/src/lib/constants.ts
export const SAFETY_LIMITS = {
  /** Maximum cells per write operation */
  MAX_CELLS_PER_WRITE: 500,
  /** Cell count threshold requiring confirmation dialog */
  CONFIRM_THRESHOLD_CELLS: 50,
  /** Maximum rows to sample for AI context */
  MAX_CONTEXT_ROWS: 50,
  /** Maximum columns to sample for AI context */
  MAX_CONTEXT_COLS: 20,
  /** Maximum sheet name length (Excel limit) */
  MAX_SHEET_NAME_LENGTH: 31,
  /** Forbidden characters in sheet names */
  FORBIDDEN_SHEET_CHARS: /[\[\]:*?\/\\]/,
  /** Maximum formula length */
  MAX_FORMULA_LENGTH: 1000,
} as const;

export const EXCEL_ERRORS = {
  RANGE_NOT_FOUND: 'The specified range was not found',
  INVALID_ADDRESS: 'Invalid Excel address format',
  CELL_LIMIT_EXCEEDED: 'Operation exceeds maximum cell limit',
  SHEET_NAME_INVALID: 'Invalid sheet name',
  FORMULA_UNSAFE: 'Formula contains restricted elements',
  OFFICE_NOT_READY: 'Excel is not ready. Please try again.',
} as const;
```

#### Step 2: Create Shared Excel Types

```typescript
// packages/shared/src/types/excel.ts

/** Data type detected in a column */
export type DataType = 'number' | 'date' | 'currency' | 'percentage' | 'text' | 'mixed' | 'empty';

/** Information about a column's data type */
export interface DataTypeInfo {
  /** Column index (0-based) */
  column: number;
  /** Header name for this column */
  header: string;
  /** Detected data type */
  type: DataType;
  /** Sample values from the column */
  sampleValues: unknown[];
}

/** Basic statistics for numeric columns */
export interface ColumnStats {
  /** Column index */
  column: number;
  /** Column header */
  header: string;
  /** Sum of all numeric values */
  sum: number;
  /** Average of all numeric values */
  avg: number;
  /** Minimum value */
  min: number;
  /** Maximum value */
  max: number;
  /** Count of numeric values */
  count: number;
}

/** Statistics aggregation */
export interface BasicStats {
  /** Statistics for each numeric column */
  numericColumns: ColumnStats[];
}

/** Metadata about an Excel table */
export interface TableInfo {
  /** Table name */
  name: string;
  /** Sheet containing the table */
  sheetName: string;
  /** Table range address */
  address: string;
  /** Number of data rows (excluding header) */
  rowCount: number;
  /** Number of columns */
  columnCount: number;
}

/** Selection information */
export interface SelectionInfo {
  /** Range address (e.g., "Sheet1!A1:C10") */
  address: string;
  /** 2D array of cell values (sampled if large) */
  values: unknown[][];
  /** Column headers (first row) */
  headers: string[];
  /** Total row count in selection */
  rowCount: number;
  /** Total column count in selection */
  columnCount: number;
  /** Whether values were sampled (original > max rows) */
  sampled: boolean;
  /** Original row count before sampling */
  originalRowCount?: number;
}

/** Full Excel context for AI */
export interface ExcelContextFull {
  /** Current selection information */
  selection: SelectionInfo;
  /** Active worksheet name */
  activeSheet: string;
  /** All worksheet names */
  allSheets: string[];
  /** Tables in the workbook */
  tables: TableInfo[];
  /** Data types detected per column */
  dataTypes: DataTypeInfo[];
  /** Basic statistics for numeric columns */
  stats: BasicStats;
  /** Timestamp when context was extracted */
  extractedAt: number;
}

/** Formatting options for a range */
export interface FormatOptions {
  /** Background fill color (hex) */
  fillColor?: string;
  /** Font color (hex) */
  fontColor?: string;
  /** Bold text */
  bold?: boolean;
  /** Italic text */
  italic?: boolean;
  /** Number format string (e.g., "0.00%", "$#,##0") */
  numberFormat?: string;
  /** Horizontal alignment */
  horizontalAlignment?: 'left' | 'center' | 'right';
}

/** Result of a write operation */
export interface WriteResult {
  /** Whether the operation succeeded */
  success: boolean;
  /** Number of cells affected */
  cellCount: number;
  /** Address that was written to */
  address?: string;
  /** Error message if failed */
  error?: string;
}
```

#### Step 3: Create Address/Formula Validation

```typescript
// apps/addin/src/lib/excel/validation.ts
import { SAFETY_LIMITS } from '../constants';

/**
 * Validates A1 notation address.
 * Valid: A1, B2:C10, Sheet1!A1:B10, 'Sheet Name'!A1
 */
export function isValidAddress(address: string): boolean {
  if (!address || address.trim().length === 0) return false;

  // Pattern: optional sheet reference + cell reference
  // Sheet reference: name! or 'name with spaces'!
  // Cell reference: A1 or A1:B2
  const pattern = /^('?[^'[\]:*?\/\\]+'?!)?[A-Za-z]{1,3}[0-9]{1,7}(:[A-Za-z]{1,3}[0-9]{1,7})?$/;
  return pattern.test(address.trim());
}

/**
 * Validates a sheet name according to Excel rules.
 */
export function isValidSheetName(name: string): { valid: boolean; error?: string } {
  if (!name || name.trim().length === 0) {
    return { valid: false, error: 'Sheet name cannot be empty' };
  }

  if (name.length > SAFETY_LIMITS.MAX_SHEET_NAME_LENGTH) {
    return { valid: false, error: `Sheet name cannot exceed ${SAFETY_LIMITS.MAX_SHEET_NAME_LENGTH} characters` };
  }

  if (SAFETY_LIMITS.FORBIDDEN_SHEET_CHARS.test(name)) {
    return { valid: false, error: 'Sheet name cannot contain [ ] : * ? / \\' };
  }

  return { valid: true };
}

/**
 * Checks if a formula is allowed (no external links, dangerous functions).
 */
export function isFormulaAllowed(formula: string): { allowed: boolean; reason?: string } {
  if (!formula.startsWith('=')) {
    return { allowed: false, reason: 'Formula must start with =' };
  }

  if (formula.length > SAFETY_LIMITS.MAX_FORMULA_LENGTH) {
    return { allowed: false, reason: `Formula exceeds ${SAFETY_LIMITS.MAX_FORMULA_LENGTH} character limit` };
  }

  const upper = formula.toUpperCase();

  // Block external links
  if (/HTTPS?:\/\//i.test(formula)) {
    return { allowed: false, reason: 'External URLs are not allowed in formulas' };
  }

  // Block dangerous functions
  const dangerous = ['WEBSERVICE', 'CALL', 'REGISTER.ID', 'SQL.REQUEST', 'FILTERXML'];
  for (const fn of dangerous) {
    if (upper.includes(fn + '(')) {
      return { allowed: false, reason: `${fn} function is not allowed` };
    }
  }

  // Block external workbook references [workbook.xlsx]
  if (/\[.+\.(xlsx?|xlsm|xlsb)\]/i.test(formula)) {
    return { allowed: false, reason: 'External workbook references are not allowed' };
  }

  return { allowed: true };
}

/**
 * Calculates approximate cell count from address.
 * Returns -1 if unable to parse.
 */
export function calculateCellCount(address: string): number {
  // Remove sheet reference
  const cellRef = address.includes('!') ? address.split('!')[1] : address;

  if (!cellRef.includes(':')) {
    return 1; // Single cell
  }

  const [start, end] = cellRef.split(':');

  const startCol = columnToNumber(start.match(/[A-Za-z]+/)?.[0] || 'A');
  const startRow = parseInt(start.match(/[0-9]+/)?.[0] || '1', 10);
  const endCol = columnToNumber(end.match(/[A-Za-z]+/)?.[0] || 'A');
  const endRow = parseInt(end.match(/[0-9]+/)?.[0] || '1', 10);

  const cols = Math.abs(endCol - startCol) + 1;
  const rows = Math.abs(endRow - startRow) + 1;

  return cols * rows;
}

/**
 * Converts column letter(s) to number (A=1, B=2, AA=27, etc.)
 */
function columnToNumber(col: string): number {
  let result = 0;
  for (let i = 0; i < col.length; i++) {
    result = result * 26 + (col.charCodeAt(i) - 64);
  }
  return result;
}

/**
 * Validates cell count against safety limit.
 */
export function validateCellCount(
  address: string,
  values?: unknown[][]
): { valid: boolean; cellCount: number; error?: string } {
  const cellCount = values
    ? values.length * (values[0]?.length ?? 0)
    : calculateCellCount(address);

  if (cellCount > SAFETY_LIMITS.MAX_CELLS_PER_WRITE) {
    return {
      valid: false,
      cellCount,
      error: `Operation affects ${cellCount} cells. Maximum allowed: ${SAFETY_LIMITS.MAX_CELLS_PER_WRITE}`,
    };
  }

  return { valid: true, cellCount };
}
```

#### Step 4: Create Excel Read Helpers

```typescript
// apps/addin/src/lib/excel/reader.ts
import { SAFETY_LIMITS, EXCEL_ERRORS } from '../constants';
import type { TableInfo } from '@cellix/shared';

/**
 * Gets values from the currently selected range.
 * Returns a 2D array of cell values.
 */
export async function getSelectedRangeValues(): Promise<unknown[][]> {
  return Excel.run(async (context) => {
    const range = context.workbook.getSelectedRange();
    range.load('values');
    await context.sync();
    return range.values;
  });
}

/**
 * Gets the address of the currently selected range.
 * Returns A1 notation (e.g., "Sheet1!A1:C10").
 */
export async function getSelectedRangeAddress(): Promise<string> {
  return Excel.run(async (context) => {
    const range = context.workbook.getSelectedRange();
    range.load('address');
    await context.sync();
    return range.address;
  });
}

/**
 * Gets headers (first row) from the selected range.
 */
export async function getSelectedRangeHeaders(): Promise<string[]> {
  return Excel.run(async (context) => {
    const range = context.workbook.getSelectedRange();
    range.load('values');
    await context.sync();

    if (range.values.length === 0) {
      return [];
    }

    return range.values[0].map((cell) => String(cell ?? ''));
  });
}

/**
 * Gets a sample of the used range (for AI context).
 * Limits to maxRows to avoid sending too much data.
 */
export async function getUsedRangeSample(maxRows: number = SAFETY_LIMITS.MAX_CONTEXT_ROWS): Promise<{
  values: unknown[][];
  address: string;
  totalRows: number;
  totalCols: number;
  sampled: boolean;
}> {
  return Excel.run(async (context) => {
    const sheet = context.workbook.worksheets.getActiveWorksheet();
    const usedRange = sheet.getUsedRangeOrNullObject();
    usedRange.load(['values', 'address', 'rowCount', 'columnCount']);
    await context.sync();

    // Handle empty sheet
    if (usedRange.isNullObject) {
      return {
        values: [],
        address: '',
        totalRows: 0,
        totalCols: 0,
        sampled: false,
      };
    }

    const totalRows = usedRange.rowCount;
    const totalCols = usedRange.columnCount;
    const sampled = totalRows > maxRows;

    let values = usedRange.values;

    // Sample rows if needed
    if (sampled) {
      values = values.slice(0, maxRows);
    }

    // Sample columns if needed
    if (totalCols > SAFETY_LIMITS.MAX_CONTEXT_COLS) {
      values = values.map((row) => row.slice(0, SAFETY_LIMITS.MAX_CONTEXT_COLS));
    }

    return {
      values,
      address: usedRange.address,
      totalRows,
      totalCols,
      sampled,
    };
  });
}

/**
 * Gets all worksheet names in the workbook.
 */
export async function getSheetNames(): Promise<string[]> {
  return Excel.run(async (context) => {
    const sheets = context.workbook.worksheets;
    sheets.load('items/name');
    await context.sync();
    return sheets.items.map((sheet) => sheet.name);
  });
}

/**
 * Gets the active worksheet name.
 */
export async function getActiveSheetName(): Promise<string> {
  return Excel.run(async (context) => {
    const sheet = context.workbook.worksheets.getActiveWorksheet();
    sheet.load('name');
    await context.sync();
    return sheet.name;
  });
}

/**
 * Gets metadata about all tables in the workbook.
 */
export async function getTableMetadata(): Promise<TableInfo[]> {
  return Excel.run(async (context) => {
    const tables = context.workbook.tables;
    tables.load('items');
    await context.sync();

    // Load details for each table
    for (const table of tables.items) {
      table.load('name');
      table.worksheet.load('name');
      const range = table.getRange();
      range.load(['address', 'rowCount', 'columnCount']);
    }

    await context.sync();

    return tables.items.map((table) => ({
      name: table.name,
      sheetName: table.worksheet.name,
      address: table.getRange().address,
      rowCount: table.getRange().rowCount - 1, // Exclude header
      columnCount: table.getRange().columnCount,
    }));
  });
}

/**
 * Gets named ranges in the workbook.
 */
export async function getNamedRanges(): Promise<Array<{ name: string; address: string }>> {
  return Excel.run(async (context) => {
    const names = context.workbook.names;
    names.load('items');
    await context.sync();

    const results: Array<{ name: string; address: string }> = [];

    for (const namedItem of names.items) {
      try {
        const range = namedItem.getRange();
        namedItem.load('name');
        range.load('address');
        await context.sync();

        results.push({
          name: namedItem.name,
          address: range.address,
        });
      } catch {
        // Some named items may not resolve to ranges (e.g., constants)
        // Skip them
      }
    }

    return results;
  });
}

/**
 * Reads values from a specific range address.
 */
export async function readRange(address: string): Promise<unknown[][]> {
  return Excel.run(async (context) => {
    const sheet = context.workbook.worksheets.getActiveWorksheet();
    const range = sheet.getRange(address);
    range.load('values');
    await context.sync();
    return range.values;
  });
}
```

#### Step 5: Create Excel Write Helpers

```typescript
// apps/addin/src/lib/excel/writer.ts
import { SAFETY_LIMITS } from '../constants';
import { validateCellCount, isValidSheetName, isFormulaAllowed } from './validation';
import type { FormatOptions, WriteResult } from '@cellix/shared';

/**
 * Writes a 2D array of values to a range.
 * NOTE: In Phase 4, this will require preview and confirmation.
 */
export async function writeRange(
  address: string,
  values: unknown[][]
): Promise<WriteResult> {
  // Validate cell count
  const validation = validateCellCount(address, values);
  if (!validation.valid) {
    return { success: false, cellCount: validation.cellCount, error: validation.error };
  }

  return Excel.run(async (context) => {
    const sheet = context.workbook.worksheets.getActiveWorksheet();
    const range = sheet.getRange(address);
    range.values = values;
    await context.sync();

    return { success: true, cellCount: validation.cellCount, address };
  });
}

/**
 * Sets a formula in a single cell.
 * NOTE: In Phase 4, this will require preview and confirmation.
 */
export async function setFormula(
  address: string,
  formula: string
): Promise<WriteResult> {
  // Validate formula
  const formulaCheck = isFormulaAllowed(formula);
  if (!formulaCheck.allowed) {
    return { success: false, cellCount: 1, error: formulaCheck.reason };
  }

  return Excel.run(async (context) => {
    const sheet = context.workbook.worksheets.getActiveWorksheet();
    const cell = sheet.getRange(address);
    cell.formulas = [[formula]];
    await context.sync();

    return { success: true, cellCount: 1, address };
  });
}

/**
 * Sets formulas in a range.
 * NOTE: In Phase 4, this will require preview and confirmation.
 */
export async function setFormulas(
  address: string,
  formulas: string[][]
): Promise<WriteResult> {
  // Validate all formulas
  for (const row of formulas) {
    for (const formula of row) {
      if (formula && formula.startsWith('=')) {
        const check = isFormulaAllowed(formula);
        if (!check.allowed) {
          return { success: false, cellCount: 0, error: check.reason };
        }
      }
    }
  }

  // Validate cell count
  const validation = validateCellCount(address, formulas);
  if (!validation.valid) {
    return { success: false, cellCount: validation.cellCount, error: validation.error };
  }

  return Excel.run(async (context) => {
    const sheet = context.workbook.worksheets.getActiveWorksheet();
    const range = sheet.getRange(address);
    range.formulas = formulas;
    await context.sync();

    return { success: true, cellCount: validation.cellCount, address };
  });
}

/**
 * Applies formatting to a range.
 * NOTE: In Phase 4, this will require preview and confirmation.
 */
export async function formatRange(
  address: string,
  format: FormatOptions
): Promise<WriteResult> {
  return Excel.run(async (context) => {
    const sheet = context.workbook.worksheets.getActiveWorksheet();
    const range = sheet.getRange(address);

    if (format.fillColor) {
      range.format.fill.color = format.fillColor;
    }
    if (format.fontColor) {
      range.format.font.color = format.fontColor;
    }
    if (format.bold !== undefined) {
      range.format.font.bold = format.bold;
    }
    if (format.italic !== undefined) {
      range.format.font.italic = format.italic;
    }
    if (format.numberFormat) {
      range.numberFormat = [[format.numberFormat]];
    }
    if (format.horizontalAlignment) {
      range.format.horizontalAlignment = format.horizontalAlignment as Excel.HorizontalAlignment;
    }

    range.load(['rowCount', 'columnCount']);
    await context.sync();

    const cellCount = range.rowCount * range.columnCount;
    return { success: true, cellCount, address };
  });
}

/**
 * Creates a new worksheet.
 * NOTE: In Phase 4, this will require confirmation.
 */
export async function createSheet(name: string): Promise<WriteResult & { sheetName?: string }> {
  // Validate sheet name
  const validation = isValidSheetName(name);
  if (!validation.valid) {
    return { success: false, cellCount: 0, error: validation.error };
  }

  return Excel.run(async (context) => {
    const sheets = context.workbook.worksheets;
    const newSheet = sheets.add(name);
    newSheet.load('name');
    await context.sync();

    return { success: true, cellCount: 0, sheetName: newSheet.name };
  });
}

/**
 * Creates an Excel table from a range.
 * NOTE: In Phase 4, this will require preview and confirmation.
 */
export async function addTable(
  address: string,
  name: string,
  hasHeaders: boolean = true
): Promise<WriteResult & { tableName?: string }> {
  return Excel.run(async (context) => {
    const sheet = context.workbook.worksheets.getActiveWorksheet();
    const table = sheet.tables.add(address, hasHeaders);
    table.name = name;
    table.load('name');

    const range = table.getRange();
    range.load(['rowCount', 'columnCount']);
    await context.sync();

    const cellCount = range.rowCount * range.columnCount;
    return { success: true, cellCount, tableName: table.name, address };
  });
}

/**
 * Highlights cells with a background color.
 * NOTE: In Phase 4, this will require preview and confirmation.
 */
export async function highlightCells(
  address: string,
  color: string
): Promise<WriteResult> {
  return formatRange(address, { fillColor: color });
}

/**
 * Clears contents of a range (not formatting).
 * NOTE: In Phase 4, this will require confirmation.
 */
export async function clearRange(address: string): Promise<WriteResult> {
  return Excel.run(async (context) => {
    const sheet = context.workbook.worksheets.getActiveWorksheet();
    const range = sheet.getRange(address);
    range.clear(Excel.ClearApplyTo.contents);

    range.load(['rowCount', 'columnCount']);
    await context.sync();

    const cellCount = range.rowCount * range.columnCount;
    return { success: true, cellCount, address };
  });
}
```

#### Step 6: Create Context Extraction

```typescript
// apps/addin/src/lib/excel/context.ts
import { SAFETY_LIMITS } from '../constants';
import {
  getSelectedRangeValues,
  getSelectedRangeAddress,
  getActiveSheetName,
  getSheetNames,
  getTableMetadata,
} from './reader';
import type { ExcelContextFull, DataTypeInfo, BasicStats, DataType } from '@cellix/shared';

/**
 * Extracts full context from current Excel state.
 * This is the main function called before sending to AI.
 */
export async function extractContext(): Promise<ExcelContextFull> {
  // Gather all data in parallel where possible
  const [values, address, activeSheet, allSheets, tables] = await Promise.all([
    getSelectedRangeValues(),
    getSelectedRangeAddress(),
    getActiveSheetName(),
    getSheetNames(),
    getTableMetadata(),
  ]);

  // Sample if too large
  const { sampledValues, sampled, originalRowCount } = sampleValues(values);

  // Extract headers (first row)
  const headers =
    sampledValues.length > 0
      ? sampledValues[0].map((cell) => String(cell ?? ''))
      : [];

  // Detect data types per column
  const dataTypes = detectDataTypes(sampledValues);

  // Calculate basic stats for numeric columns
  const stats = calculateStats(sampledValues, headers);

  return {
    selection: {
      address,
      values: sampledValues,
      headers,
      rowCount: sampledValues.length,
      columnCount: sampledValues[0]?.length ?? 0,
      sampled,
      originalRowCount: sampled ? originalRowCount : undefined,
    },
    activeSheet,
    allSheets,
    tables,
    dataTypes,
    stats,
    extractedAt: Date.now(),
  };
}

/**
 * Samples values if they exceed limits.
 */
function sampleValues(values: unknown[][]): {
  sampledValues: unknown[][];
  sampled: boolean;
  originalRowCount: number;
} {
  if (values.length === 0) {
    return { sampledValues: [], sampled: false, originalRowCount: 0 };
  }

  const originalRowCount = values.length;
  let sampledValues = values;
  let sampled = false;

  // Sample rows
  if (values.length > SAFETY_LIMITS.MAX_CONTEXT_ROWS) {
    sampledValues = values.slice(0, SAFETY_LIMITS.MAX_CONTEXT_ROWS);
    sampled = true;
  }

  // Sample columns
  if (sampledValues[0].length > SAFETY_LIMITS.MAX_CONTEXT_COLS) {
    sampledValues = sampledValues.map((row) => row.slice(0, SAFETY_LIMITS.MAX_CONTEXT_COLS));
    sampled = true;
  }

  return { sampledValues, sampled, originalRowCount };
}

/**
 * Detects data types for each column.
 */
function detectDataTypes(values: unknown[][]): DataTypeInfo[] {
  if (values.length < 2) {
    return [];
  }

  const headers = values[0];
  const dataRows = values.slice(1);
  const dataTypes: DataTypeInfo[] = [];

  for (let col = 0; col < headers.length; col++) {
    const columnValues = dataRows
      .map((row) => row[col])
      .filter((v) => v != null && v !== '');

    const type = inferColumnType(columnValues);

    dataTypes.push({
      column: col,
      header: String(headers[col] ?? `Column ${col + 1}`),
      type,
      sampleValues: columnValues.slice(0, 3),
    });
  }

  return dataTypes;
}

/**
 * Infers the data type of a column based on its values.
 */
function inferColumnType(values: unknown[]): DataType {
  if (values.length === 0) {
    return 'empty';
  }

  const types = values.map((v) => {
    if (typeof v === 'number') {
      return 'number';
    }

    const str = String(v);

    // Check for currency (starts with $, €, £, ¥ followed by number)
    if (/^[$€£¥₱][\d,.]+$/.test(str) || /^[\d,.]+[$€£¥₱]$/.test(str)) {
      return 'currency';
    }

    // Check for percentage
    if (/^[\d.]+%$/.test(str)) {
      return 'percentage';
    }

    // Check for date patterns
    if (!isNaN(Date.parse(str)) && /\d{1,4}[-/]\d{1,2}[-/]\d{1,4}/.test(str)) {
      return 'date';
    }

    // Check for numeric string
    if (!isNaN(parseFloat(str)) && isFinite(Number(str.replace(/,/g, '')))) {
      return 'number';
    }

    return 'text';
  });

  // Determine dominant type
  const typeCounts = types.reduce((acc, type) => {
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const entries = Object.entries(typeCounts);
  entries.sort((a, b) => b[1] - a[1]);

  // If >80% are the same type, use that type
  const [dominantType, count] = entries[0];
  if (count / types.length >= 0.8) {
    return dominantType as DataType;
  }

  return 'mixed';
}

/**
 * Calculates basic statistics for numeric columns.
 */
function calculateStats(values: unknown[][], headers: string[]): BasicStats {
  if (values.length < 2) {
    return { numericColumns: [] };
  }

  const dataRows = values.slice(1);
  const numericColumns: BasicStats['numericColumns'] = [];

  for (let col = 0; col < headers.length; col++) {
    const numbers = dataRows
      .map((row) => {
        const val = row[col];
        if (typeof val === 'number') return val;
        const str = String(val).replace(/[$€£¥₱,%]/g, '').replace(/,/g, '');
        const parsed = parseFloat(str);
        return isNaN(parsed) ? null : parsed;
      })
      .filter((n): n is number => n !== null);

    if (numbers.length > 0) {
      numericColumns.push({
        column: col,
        header: headers[col] || `Column ${col + 1}`,
        sum: numbers.reduce((a, b) => a + b, 0),
        avg: numbers.reduce((a, b) => a + b, 0) / numbers.length,
        min: Math.min(...numbers),
        max: Math.max(...numbers),
        count: numbers.length,
      });
    }
  }

  return { numericColumns };
}

/**
 * Formats context for inclusion in AI prompt.
 */
export function formatContextForPrompt(context: ExcelContextFull): string {
  const lines: string[] = [];

  lines.push(`## Current Excel Context`);
  lines.push('');
  lines.push(`**Active Sheet:** ${context.activeSheet}`);
  lines.push(`**All Sheets:** ${context.allSheets.join(', ')}`);
  lines.push(`**Selection:** ${context.selection.address}`);
  lines.push(
    `**Size:** ${context.selection.rowCount} rows x ${context.selection.columnCount} columns`
  );

  if (context.selection.sampled) {
    lines.push(
      `*(Note: Data sampled from ${context.selection.originalRowCount} rows to first ${SAFETY_LIMITS.MAX_CONTEXT_ROWS} rows)*`
    );
  }

  lines.push('');
  lines.push(`### Headers`);
  lines.push(context.selection.headers.join(' | '));

  lines.push('');
  lines.push(`### Data Types`);
  for (const dt of context.dataTypes) {
    lines.push(`- **${dt.header}**: ${dt.type}`);
  }

  if (context.stats.numericColumns.length > 0) {
    lines.push('');
    lines.push(`### Numeric Summary`);
    for (const nc of context.stats.numericColumns) {
      lines.push(
        `- **${nc.header}**: Sum=${formatNumber(nc.sum)}, Avg=${formatNumber(nc.avg)}, Min=${formatNumber(nc.min)}, Max=${formatNumber(nc.max)}`
      );
    }
  }

  if (context.tables.length > 0) {
    lines.push('');
    lines.push(`### Tables`);
    for (const table of context.tables) {
      lines.push(`- **${table.name}**: ${table.address} (${table.rowCount} rows)`);
    }
  }

  return lines.join('\n');
}

function formatNumber(n: number): string {
  if (Number.isInteger(n)) return n.toLocaleString();
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
```

#### Step 7: Create Barrel Export

```typescript
// apps/addin/src/lib/excel/index.ts
export * from './reader';
export * from './writer';
export * from './context';
export * from './validation';
```

#### Step 8: Create Excel Store

```typescript
// apps/addin/src/store/excelStore.ts
import { create } from 'zustand';
import type { ExcelContextFull } from '@cellix/shared';

interface ExcelState {
  /** Current Excel context */
  context: ExcelContextFull | null;
  /** Whether context is being loaded */
  isLoading: boolean;
  /** Error message if context extraction failed */
  error: string | null;
  /** Last time context was refreshed */
  lastRefresh: number | null;

  /** Set the current context */
  setContext: (context: ExcelContextFull | null) => void;
  /** Set loading state */
  setLoading: (isLoading: boolean) => void;
  /** Set error state */
  setError: (error: string | null) => void;
  /** Clear context and error */
  reset: () => void;
}

export const useExcelStore = create<ExcelState>((set) => ({
  context: null,
  isLoading: false,
  error: null,
  lastRefresh: null,

  setContext: (context) =>
    set({
      context,
      error: null,
      lastRefresh: context ? Date.now() : null,
    }),

  setLoading: (isLoading) => set({ isLoading }),

  setError: (error) => set({ error, isLoading: false }),

  reset: () =>
    set({
      context: null,
      error: null,
      isLoading: false,
      lastRefresh: null,
    }),
}));
```

#### Step 9: Create useExcelContext Hook

```typescript
// apps/addin/src/hooks/useExcelContext.ts
import { useCallback } from 'react';
import { useExcelStore } from '@/store/excelStore';
import { extractContext } from '@/lib/excel/context';

/**
 * Hook to access and refresh Excel context.
 */
export function useExcelContext() {
  const { context, isLoading, error, lastRefresh, setContext, setLoading, setError, reset } =
    useExcelStore();

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const ctx = await extractContext();
      setContext(ctx);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to extract Excel context';
      setError(message);
      console.error('Excel context extraction error:', e);
    }
  }, [setContext, setError, setLoading]);

  return {
    context,
    isLoading,
    error,
    lastRefresh,
    refresh,
    reset,
  };
}
```

#### Step 10: Create Control Panel Components

```typescript
// apps/addin/src/components/controls/ControlPanel.tsx
import { makeStyles, tokens, Button, Card, Text, Spinner } from '@fluentui/react-components';
import { ArrowSync24Regular, Table24Regular } from '@fluentui/react-icons';
import { useExcelContext } from '@/hooks/useExcelContext';
import { ContextDisplay } from './ContextDisplay';

const useStyles = makeStyles({
  container: {
    padding: tokens.spacingVerticalM,
    backgroundColor: tokens.colorNeutralBackground2,
    borderBottom: `1px solid ${tokens.colorNeutralStroke1}`,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: tokens.spacingVerticalS,
  },
  title: {
    fontWeight: tokens.fontWeightSemibold,
  },
  actions: {
    display: 'flex',
    gap: tokens.spacingHorizontalS,
  },
  error: {
    color: tokens.colorPaletteRedForeground1,
    marginTop: tokens.spacingVerticalS,
  },
});

export function ControlPanel() {
  const styles = useStyles();
  const { context, isLoading, error, refresh } = useExcelContext();

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <Text className={styles.title}>Excel Context</Text>
        <div className={styles.actions}>
          <Button
            appearance="subtle"
            icon={isLoading ? <Spinner size="tiny" /> : <ArrowSync24Regular />}
            onClick={refresh}
            disabled={isLoading}
          >
            {isLoading ? 'Loading...' : 'Refresh'}
          </Button>
        </div>
      </div>

      {error && (
        <Text className={styles.error} size={200}>
          {error}
        </Text>
      )}

      {context ? (
        <ContextDisplay context={context} />
      ) : !isLoading && !error ? (
        <Text size={200}>
          Click "Refresh" to load the current Excel selection.
        </Text>
      ) : null}
    </div>
  );
}
```

```typescript
// apps/addin/src/components/controls/ContextDisplay.tsx
import { makeStyles, tokens, Text, Badge, Tooltip } from '@fluentui/react-components';
import { Info16Regular, Warning16Regular } from '@fluentui/react-icons';
import type { ExcelContextFull } from '@cellix/shared';
import { SAFETY_LIMITS } from '@/lib/constants';

const useStyles = makeStyles({
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
  },
  label: {
    color: tokens.colorNeutralForeground3,
    minWidth: '70px',
  },
  value: {
    fontFamily: tokens.fontFamilyMonospace,
  },
  warning: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    color: tokens.colorPaletteYellowForeground1,
    marginTop: tokens.spacingVerticalXS,
  },
  stats: {
    marginTop: tokens.spacingVerticalS,
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
  },
});

interface ContextDisplayProps {
  context: ExcelContextFull;
}

export function ContextDisplay({ context }: ContextDisplayProps) {
  const styles = useStyles();
  const totalCells = context.selection.rowCount * context.selection.columnCount;
  const isLarge = totalCells > SAFETY_LIMITS.CONFIRM_THRESHOLD_CELLS;

  return (
    <div className={styles.container}>
      <div className={styles.row}>
        <Text size={200} className={styles.label}>Selection:</Text>
        <Text size={200} className={styles.value}>{context.selection.address}</Text>
      </div>

      <div className={styles.row}>
        <Text size={200} className={styles.label}>Size:</Text>
        <Text size={200}>
          {context.selection.rowCount} rows × {context.selection.columnCount} cols
          ({totalCells.toLocaleString()} cells)
        </Text>
        {isLarge && (
          <Tooltip content="Large selections may require confirmation for write operations" relationship="label">
            <Badge appearance="filled" color="warning" size="small">Large</Badge>
          </Tooltip>
        )}
      </div>

      <div className={styles.row}>
        <Text size={200} className={styles.label}>Sheet:</Text>
        <Text size={200}>{context.activeSheet}</Text>
      </div>

      {context.selection.sampled && (
        <div className={styles.warning}>
          <Warning16Regular />
          <Text size={200}>
            Showing first {SAFETY_LIMITS.MAX_CONTEXT_ROWS} of {context.selection.originalRowCount} rows
          </Text>
        </div>
      )}

      {context.stats.numericColumns.length > 0 && (
        <div className={styles.stats}>
          {context.stats.numericColumns.slice(0, 3).map((col) => (
            <div key={col.column}>
              <Text size={200}>
                {col.header}: Σ={formatCompact(col.sum)}, μ={formatCompact(col.avg)}
              </Text>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatCompact(n: number): string {
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return n.toFixed(Number.isInteger(n) ? 0 : 2);
}
```

```typescript
// apps/addin/src/components/controls/index.ts
export { ControlPanel } from './ControlPanel';
export { ContextDisplay } from './ContextDisplay';
```

#### Step 11: Update Shared Package Exports

```typescript
// packages/shared/src/types/index.ts
export * from './chat.js';
export * from './api.js';
export * from './excel.js';
```

#### Step 12: Update Store Barrel Export

```typescript
// apps/addin/src/store/index.ts
export { useChatStore } from './chatStore';
export { useUIStore, type TabId } from './uiStore';
export { useExcelStore } from './excelStore';
```

#### Step 13: Update App.tsx to Include ControlPanel

```typescript
// apps/addin/src/App.tsx
import { makeStyles, tokens } from '@fluentui/react-components';
import { TabNavigation } from './components/common/TabNavigation';
import { ChatPane } from './components/chat/ChatPane';
import { ControlPanel } from './components/controls/ControlPanel';
import { Loading } from './components/common/Loading';
import { useUIStore } from './store/uiStore';

const useStyles = makeStyles({
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    backgroundColor: tokens.colorNeutralBackground1,
  },
  content: {
    flex: 1,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  chatArea: {
    flex: 1,
    overflow: 'hidden',
  },
  notInitialized: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    padding: tokens.spacingHorizontalXL,
    textAlign: 'center',
    color: tokens.colorNeutralForeground3,
  },
});

interface AppProps {
  isOfficeInitialized: boolean;
}

export default function App({ isOfficeInitialized }: AppProps) {
  const styles = useStyles();
  const { activeTab } = useUIStore();

  if (!isOfficeInitialized) {
    return (
      <div className={styles.container}>
        <Loading message="Connecting to Excel..." />
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <TabNavigation />
      <div className={styles.content}>
        {activeTab === 'chat' && (
          <>
            <ControlPanel />
            <div className={styles.chatArea}>
              <ChatPane />
            </div>
          </>
        )}
        {activeTab === 'settings' && (
          <div className={styles.notInitialized}>
            Settings panel coming in a future release.
          </div>
        )}
      </div>
    </div>
  );
}
```

### Code Snippets

#### Office.js Error Handling Wrapper

```typescript
// Utility for wrapping Excel operations with proper error handling
export async function safeExcelRun<T>(
  operation: (context: Excel.RequestContext) => Promise<T>,
  fallback?: T
): Promise<{ success: boolean; data?: T; error?: string }> {
  try {
    const data = await Excel.run(operation);
    return { success: true, data };
  } catch (error) {
    if (error instanceof OfficeExtension.Error) {
      const message = getOfficeErrorMessage(error.code);
      return { success: false, error: message };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

function getOfficeErrorMessage(code: string): string {
  switch (code) {
    case 'ItemNotFound':
      return 'The specified item was not found';
    case 'InvalidArgument':
      return 'Invalid argument provided';
    case 'AccessDenied':
      return 'Access denied to this resource';
    default:
      return `Excel error: ${code}`;
  }
}
```

## Validation Gates

### Build

- [ ] `pnpm build` passes for all packages
- [ ] `pnpm build:addin` succeeds without TypeScript errors
- [ ] `pnpm build:shared` succeeds and types are exported

### Lint

- [ ] `pnpm lint` passes with no errors
- [ ] `pnpm typecheck` passes (no TypeScript errors)

### Tests

- [ ] Unit test file created for validation functions
- [ ] Unit test file created for context extraction helpers
- [ ] Mock Office.js context for unit tests
- [ ] `pnpm test` passes

### Manual Testing

- [ ] Add-in sideloads successfully in Excel Desktop
- [ ] "Refresh" button loads current selection context
- [ ] Context display shows correct address and size
- [ ] Large range warning appears for >50 cells
- [ ] Sampled indicator appears for >50 rows
- [ ] Data type detection shows correct types
- [ ] Stats display shows sum/avg for numeric columns
- [ ] `writeRange()` successfully writes data
- [ ] `setFormula()` successfully sets formula
- [ ] `formatRange()` applies formatting
- [ ] `createSheet()` creates new sheet
- [ ] Invalid address throws appropriate error
- [ ] Unsafe formula is rejected
- [ ] Cell limit exceeded shows error
- [ ] Empty sheet handled gracefully
- [ ] No console errors during operations

## Safety Considerations

### Phase 2 Safety (Foundation Only)

Phase 2 implements the **low-level helpers** without the full safety UI:

1. **Cell Count Validation** - Write operations check cell limits (500 max)
2. **Formula Validation** - Block external links and dangerous functions
3. **Sheet Name Validation** - Check length and forbidden characters
4. **Address Validation** - Verify A1 notation format

### Deferred to Phase 4

- Preview UI system
- Confirmation dialogs for large operations
- Audit logging to Supabase
- Undo/rollback capability

## Confidence Score

**9/10** - High confidence

### Reasoning

**Strengths:**
- Well-documented Office.js API with clear patterns
- Existing example files provide implementation templates
- Phase 1 establishes clear patterns for stores, components, types
- Office.js types available via `@types/office-js`
- Safety validation is straightforward logic

**Minor Uncertainties:**
- Office.js behavior differences between Excel Desktop/Online/Mac
- Edge cases in data type detection (international formats)
- Performance with very large ranges (even with sampling)
- Named ranges with errors may need additional handling

## Notes

### Decisions Made

1. **Context Extraction vs Individual Reads**: Extract full context in one operation rather than multiple small reads for efficiency
2. **Sampling Strategy**: 50 rows, 20 columns matches AI context limits while providing useful data
3. **Stats Calculation**: Client-side stats calculation to reduce backend load
4. **Type Detection Threshold**: 80% dominance for type inference to handle mixed data gracefully
5. **Control Panel Location**: Above chat pane for easy access, collapsible in future
6. **No Preview in Phase 2**: Write helpers work directly - Phase 4 adds preview wrapper

### Future Considerations

1. **Phase 3 Integration**: `extractContext()` output will be passed to AI chat requests
2. **Phase 4 Wrapping**: Write helpers will be wrapped with preview/confirmation system
3. **Performance**: May need `suspendApiCalculationUntilNextSync()` for bulk writes
4. **Caching**: Consider caching sheet names and table metadata between refreshes

### Testing Strategy

1. **Unit Tests**: Test validation functions with various inputs
2. **Integration Tests**: Mock `Excel.run()` to test read/write helpers
3. **Manual Tests**: Sideload and test all operations in real Excel
4. **Edge Cases**: Empty sheets, single cells, max-size ranges, special characters
