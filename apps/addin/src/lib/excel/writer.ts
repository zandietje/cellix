/**
 * Excel write helpers using Office.js API.
 * All write operations go through the preview system for user confirmation.
 */

import { validateCellCount, isValidSheetName, isFormulaAllowed } from './validation';
import type { FormatOptions, WriteResult } from '@cellix/shared';

/**
 * Sanitizes values for Excel write operations.
 * Converts null/undefined to empty string since Office.js treats null as "no change".
 */
function sanitizeValues(values: unknown[][]): unknown[][] {
  return values.map(row =>
    row.map(cell => (cell === null || cell === undefined) ? '' : cell)
  );
}

/**
 * Writes a 2D array of values to a range.
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

  // Sanitize values: convert null/undefined to empty string
  // Office.js treats null as "keep existing value", but we want to clear the cell
  const sanitizedValues = sanitizeValues(values);

  try {
    await Excel.run(async (context) => {
      const sheet = context.workbook.worksheets.getActiveWorksheet();
      const range = sheet.getRange(address);
      range.values = sanitizedValues;
      await context.sync();
    });

    return { success: true, cellCount: validation.cellCount, address };
  } catch (error) {
    return {
      success: false,
      cellCount: validation.cellCount,
      error: error instanceof Error ? error.message : 'Failed to write range',
    };
  }
}

/**
 * Sets a formula in a single cell.
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

  try {
    await Excel.run(async (context) => {
      const sheet = context.workbook.worksheets.getActiveWorksheet();
      const cell = sheet.getRange(address);
      cell.formulas = [[formula]];
      await context.sync();
    });

    return { success: true, cellCount: 1, address };
  } catch (error) {
    return {
      success: false,
      cellCount: 1,
      error: error instanceof Error ? error.message : 'Failed to set formula',
    };
  }
}

/**
 * Applies formatting to a range.
 */
export async function formatRange(
  address: string,
  format: FormatOptions
): Promise<WriteResult> {
  try {
    let cellCount = 0;

    await Excel.run(async (context) => {
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
        range.format.horizontalAlignment =
          format.horizontalAlignment as Excel.HorizontalAlignment;
      }

      range.load(['rowCount', 'columnCount']);
      await context.sync();

      cellCount = range.rowCount * range.columnCount;
    });

    return { success: true, cellCount, address };
  } catch (error) {
    return {
      success: false,
      cellCount: 0,
      error: error instanceof Error ? error.message : 'Failed to format range',
    };
  }
}

/**
 * Creates a new worksheet.
 */
export async function createSheet(
  name: string
): Promise<WriteResult & { sheetName?: string }> {
  // Validate sheet name
  const validation = isValidSheetName(name);
  if (!validation.valid) {
    return { success: false, cellCount: 0, error: validation.error };
  }

  try {
    let sheetName = '';

    await Excel.run(async (context) => {
      const sheets = context.workbook.worksheets;
      const newSheet = sheets.add(name);
      newSheet.load('name');
      await context.sync();
      sheetName = newSheet.name;
    });

    return { success: true, cellCount: 0, sheetName };
  } catch (error) {
    return {
      success: false,
      cellCount: 0,
      error: error instanceof Error ? error.message : 'Failed to create sheet',
    };
  }
}

/**
 * Creates an Excel table from a range.
 */
export async function addTable(
  address: string,
  name: string,
  hasHeaders: boolean = true
): Promise<WriteResult & { tableName?: string }> {
  try {
    let tableName = '';
    let cellCount = 0;

    await Excel.run(async (context) => {
      const sheet = context.workbook.worksheets.getActiveWorksheet();
      const table = sheet.tables.add(address, hasHeaders);
      table.name = name;
      table.load('name');

      const range = table.getRange();
      range.load(['rowCount', 'columnCount']);
      await context.sync();

      tableName = table.name;
      cellCount = range.rowCount * range.columnCount;
    });

    return { success: true, cellCount, tableName, address };
  } catch (error) {
    return {
      success: false,
      cellCount: 0,
      error: error instanceof Error ? error.message : 'Failed to create table',
    };
  }
}

/**
 * Highlights cells with a background color.
 */
export async function highlightCells(
  address: string,
  color: string
): Promise<WriteResult> {
  return formatRange(address, { fillColor: color });
}
