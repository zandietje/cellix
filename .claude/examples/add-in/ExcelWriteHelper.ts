/**
 * Excel Write Helper - Example Implementation
 *
 * Pattern for writing data to Excel using Office.js.
 * All write operations MUST show preview and require user confirmation.
 */

import { SAFETY_LIMITS } from '@/lib/constants';

/**
 * Write a 2D array of values to a range.
 * REQUIRES: Preview and user confirmation.
 */
export async function writeRange(
  address: string,
  values: unknown[][]
): Promise<{ success: boolean; cellCount: number }> {
  // Validate cell count before executing
  const cellCount = values.length * (values[0]?.length ?? 0);
  if (cellCount > SAFETY_LIMITS.MAX_CELLS_PER_WRITE) {
    throw new Error(
      `Operation affects ${cellCount} cells. Maximum allowed: ${SAFETY_LIMITS.MAX_CELLS_PER_WRITE}`
    );
  }

  return Excel.run(async (context) => {
    const sheet = context.workbook.worksheets.getActiveWorksheet();
    const range = sheet.getRange(address);

    range.values = values;
    await context.sync();

    return { success: true, cellCount };
  });
}

/**
 * Set a formula in a single cell.
 * REQUIRES: Preview and user confirmation.
 */
export async function setFormula(
  address: string,
  formula: string
): Promise<{ success: boolean }> {
  // Validate formula starts with =
  if (!formula.startsWith('=')) {
    throw new Error('Formula must start with =');
  }

  return Excel.run(async (context) => {
    const sheet = context.workbook.worksheets.getActiveWorksheet();
    const cell = sheet.getRange(address);

    cell.formulas = [[formula]];
    await context.sync();

    return { success: true };
  });
}

/**
 * Set formulas in a range.
 * REQUIRES: Preview and user confirmation.
 */
export async function setFormulas(
  address: string,
  formulas: string[][]
): Promise<{ success: boolean; cellCount: number }> {
  const cellCount = formulas.length * (formulas[0]?.length ?? 0);
  if (cellCount > SAFETY_LIMITS.MAX_CELLS_PER_WRITE) {
    throw new Error(
      `Operation affects ${cellCount} cells. Maximum allowed: ${SAFETY_LIMITS.MAX_CELLS_PER_WRITE}`
    );
  }

  return Excel.run(async (context) => {
    const sheet = context.workbook.worksheets.getActiveWorksheet();
    const range = sheet.getRange(address);

    range.formulas = formulas;
    await context.sync();

    return { success: true, cellCount };
  });
}

/**
 * Apply formatting to a range.
 * REQUIRES: Preview and user confirmation.
 */
export async function formatRange(
  address: string,
  format: {
    fillColor?: string;
    fontColor?: string;
    bold?: boolean;
    italic?: boolean;
    numberFormat?: string;
    horizontalAlignment?: 'left' | 'center' | 'right';
  }
): Promise<{ success: boolean }> {
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
      range.format.horizontalAlignment = format.horizontalAlignment;
    }

    await context.sync();

    return { success: true };
  });
}

/**
 * Create a new worksheet.
 * REQUIRES: User confirmation.
 */
export async function createSheet(
  name: string
): Promise<{ success: boolean; sheetName: string }> {
  // Validate sheet name
  if (name.length > 31) {
    throw new Error('Sheet name cannot exceed 31 characters');
  }
  if (/[\[\]:*?\/\\]/.test(name)) {
    throw new Error('Sheet name cannot contain []:*?/\\');
  }

  return Excel.run(async (context) => {
    const sheets = context.workbook.worksheets;
    const newSheet = sheets.add(name);
    newSheet.load('name');
    await context.sync();

    return { success: true, sheetName: newSheet.name };
  });
}

/**
 * Create an Excel table from a range.
 * REQUIRES: Preview and user confirmation.
 */
export async function addTable(
  address: string,
  name: string,
  hasHeaders: boolean = true
): Promise<{ success: boolean; tableName: string }> {
  return Excel.run(async (context) => {
    const sheet = context.workbook.worksheets.getActiveWorksheet();
    const table = sheet.tables.add(address, hasHeaders);
    table.name = name;
    table.load('name');
    await context.sync();

    return { success: true, tableName: table.name };
  });
}

/**
 * Highlight cells with a background color.
 * REQUIRES: Preview and user confirmation.
 */
export async function highlightCells(
  address: string,
  color: string
): Promise<{ success: boolean }> {
  return Excel.run(async (context) => {
    const sheet = context.workbook.worksheets.getActiveWorksheet();
    const range = sheet.getRange(address);

    range.format.fill.color = color;
    await context.sync();

    return { success: true };
  });
}

/**
 * Add a summary row with calculations.
 * REQUIRES: Preview and user confirmation.
 */
export async function addSummaryRow(
  dataAddress: string,
  metrics: Array<'sum' | 'average' | 'count' | 'min' | 'max'>
): Promise<{ success: boolean; summaryAddress: string }> {
  return Excel.run(async (context) => {
    const sheet = context.workbook.worksheets.getActiveWorksheet();
    const dataRange = sheet.getRange(dataAddress);
    dataRange.load(['rowCount', 'columnCount', 'address']);
    await context.sync();

    // Calculate summary row address (row after data)
    const parts = dataAddress.split(':');
    const endCell = parts[1] || parts[0];
    const col = endCell.match(/[A-Z]+/)?.[0] ?? 'A';
    const row = parseInt(endCell.match(/[0-9]+/)?.[0] ?? '1', 10);
    const summaryRow = row + 1;

    // Build formulas based on metrics
    const formulas: string[][] = [[]];
    const startCol = dataAddress.match(/[A-Z]+/)?.[0] ?? 'A';

    for (let i = 0; i < dataRange.columnCount; i++) {
      const colLetter = String.fromCharCode(startCol.charCodeAt(0) + i);
      const metric = metrics[i % metrics.length];
      const rangeRef = `${colLetter}2:${colLetter}${row}`;

      switch (metric) {
        case 'sum':
          formulas[0].push(`=SUM(${rangeRef})`);
          break;
        case 'average':
          formulas[0].push(`=AVERAGE(${rangeRef})`);
          break;
        case 'count':
          formulas[0].push(`=COUNT(${rangeRef})`);
          break;
        case 'min':
          formulas[0].push(`=MIN(${rangeRef})`);
          break;
        case 'max':
          formulas[0].push(`=MAX(${rangeRef})`);
          break;
      }
    }

    const summaryAddress = `${startCol}${summaryRow}:${col}${summaryRow}`;
    const summaryRange = sheet.getRange(summaryAddress);
    summaryRange.formulas = formulas;
    summaryRange.format.font.bold = true;
    summaryRange.format.fill.color = '#E2E8F0';

    await context.sync();

    return { success: true, summaryAddress };
  });
}

/**
 * Clear contents of a range (not formatting).
 * REQUIRES: User confirmation.
 */
export async function clearRange(
  address: string
): Promise<{ success: boolean }> {
  return Excel.run(async (context) => {
    const sheet = context.workbook.worksheets.getActiveWorksheet();
    const range = sheet.getRange(address);

    range.clear(Excel.ClearApplyTo.contents);
    await context.sync();

    return { success: true };
  });
}
