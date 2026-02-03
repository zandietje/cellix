/**
 * Excel Read Helper - Example Implementation
 *
 * Pattern for reading data from Excel using Office.js.
 * All read operations are safe (no preview required).
 */

/**
 * Get values from the currently selected range.
 * Returns a 2D array of cell values.
 */
export async function getSelectedRangeValues(): Promise<unknown[][]> {
  return Excel.run(async (context) => {
    const range = context.workbook.getSelectedRange();
    range.load(['values', 'address', 'rowCount', 'columnCount']);
    await context.sync();

    return range.values;
  });
}

/**
 * Get the address of the currently selected range.
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
 * Get headers (first row) from the selected range.
 * Useful for understanding data structure.
 */
export async function getSelectedRangeHeaders(): Promise<string[]> {
  return Excel.run(async (context) => {
    const range = context.workbook.getSelectedRange();
    range.load('values');
    await context.sync();

    if (range.values.length === 0) {
      return [];
    }

    // First row as headers
    return range.values[0].map((cell) => String(cell ?? ''));
  });
}

/**
 * Get a sample of the used range (for AI context).
 * Limits to maxRows to avoid sending too much data.
 */
export async function getUsedRangeSample(maxRows: number = 50): Promise<{
  values: unknown[][];
  address: string;
  totalRows: number;
  sampled: boolean;
}> {
  return Excel.run(async (context) => {
    const sheet = context.workbook.worksheets.getActiveWorksheet();
    const usedRange = sheet.getUsedRange();
    usedRange.load(['values', 'address', 'rowCount', 'columnCount']);
    await context.sync();

    const totalRows = usedRange.rowCount;
    const sampled = totalRows > maxRows;

    // If too many rows, get only first maxRows
    let values = usedRange.values;
    if (sampled) {
      values = values.slice(0, maxRows);
    }

    return {
      values,
      address: usedRange.address,
      totalRows,
      sampled,
    };
  });
}

/**
 * Get all worksheet names in the workbook.
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
 * Get the active worksheet name.
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
 * Get metadata about all tables in the workbook.
 */
export async function getTableMetadata(): Promise<
  Array<{
    name: string;
    sheetName: string;
    address: string;
    rowCount: number;
    columnCount: number;
  }>
> {
  return Excel.run(async (context) => {
    const tables = context.workbook.tables;
    tables.load('items');
    await context.sync();

    const metadata: Array<{
      name: string;
      sheetName: string;
      address: string;
      rowCount: number;
      columnCount: number;
    }> = [];

    for (const table of tables.items) {
      const worksheet = table.worksheet;
      const range = table.getRange();

      table.load('name');
      worksheet.load('name');
      range.load(['address', 'rowCount', 'columnCount']);
    }

    await context.sync();

    for (const table of tables.items) {
      const range = table.getRange();
      metadata.push({
        name: table.name,
        sheetName: table.worksheet.name,
        address: range.address,
        rowCount: range.rowCount,
        columnCount: range.columnCount,
      });
    }

    return metadata;
  });
}

/**
 * Get named ranges in the workbook.
 */
export async function getNamedRanges(): Promise<
  Array<{ name: string; address: string }>
> {
  return Excel.run(async (context) => {
    const names = context.workbook.names;
    names.load('items');
    await context.sync();

    return names.items.map((namedItem) => ({
      name: namedItem.name,
      address: namedItem.getRange().address,
    }));
  });
}
