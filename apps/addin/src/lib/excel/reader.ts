/**
 * Excel read helpers using Office.js API.
 * All operations are read-only and do not require preview/confirmation.
 */

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
