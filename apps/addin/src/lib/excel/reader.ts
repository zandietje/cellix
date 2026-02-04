/**
 * Excel read helpers using Office.js API.
 * All operations are read-only and do not require preview/confirmation.
 */

import { SAFETY_LIMITS } from '../constants';
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
export async function getUsedRangeSample(
  maxRows: number = SAFETY_LIMITS.MAX_CONTEXT_ROWS
): Promise<{
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
    const sampled = totalRows > maxRows || totalCols > SAFETY_LIMITS.MAX_CONTEXT_COLS;

    let values = usedRange.values;

    // Sample rows if needed
    if (totalRows > maxRows) {
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

    if (tables.items.length === 0) {
      return [];
    }

    // Load details for each table in batch
    const tableRanges: Excel.Range[] = [];
    for (const table of tables.items) {
      table.load('name');
      table.worksheet.load('name');
      const range = table.getRange();
      range.load(['address', 'rowCount', 'columnCount']);
      tableRanges.push(range);
    }

    await context.sync();

    return tables.items.map((table, i) => ({
      name: table.name,
      sheetName: table.worksheet.name,
      address: tableRanges[i].address,
      rowCount: tableRanges[i].rowCount - 1, // Exclude header
      columnCount: tableRanges[i].columnCount,
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
        // Skip them silently
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

/**
 * Gets the row and column count of the current selection.
 */
export async function getSelectionDimensions(): Promise<{
  rowCount: number;
  columnCount: number;
}> {
  return Excel.run(async (context) => {
    const range = context.workbook.getSelectedRange();
    range.load(['rowCount', 'columnCount']);
    await context.sync();
    return {
      rowCount: range.rowCount,
      columnCount: range.columnCount,
    };
  });
}
