/**
 * Excel write helpers using Office.js API.
 * All write operations go through the preview system for user confirmation.
 */

import { validateCellCount, isValidSheetName, isFormulaAllowed, calculateCellCount } from './validation';
import { columnToNumber } from '@cellix/shared';
import type { FormatOptions, WriteResult } from '@cellix/shared';
import { SAFETY_LIMITS } from '../constants';

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
 * Sets a formula in a cell or range.
 * For ranges, sets the formula in the first cell and uses AutoFill to fill the rest,
 * so relative references adjust automatically per row (like dragging the fill handle).
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

  const cellCount = calculateCellCount(address);

  // Validate cell count against safety limit for formula fill
  const maxCells = cellCount === 1 ? SAFETY_LIMITS.MAX_CELLS_PER_WRITE : SAFETY_LIMITS.MAX_FORMULA_FILL_CELLS;
  if (cellCount > maxCells) {
    return {
      success: false,
      cellCount,
      error: `Operation affects ${cellCount} cells. Maximum allowed: ${maxCells}`,
    };
  }

  try {
    await Excel.run(async (context) => {
      const sheet = context.workbook.worksheets.getActiveWorksheet();

      if (cellCount === 1) {
        // Single cell: set formula directly
        const cell = sheet.getRange(address);
        cell.formulas = [[formula]];
        await context.sync();
      } else {
        // Range: set formula in first cell, convert to R1C1, then broadcast to full range.
        // R1C1 notation is inherently relative — the same R1C1 string applied to every cell
        // resolves references relative to that cell's position (like dragging the fill handle).
        // This replaces the previous autoFill approach which didn't reliably adjust references.
        const cellRef = address.includes('!') ? address.split('!')[1]! : address;
        const sheetPrefix = address.includes('!') ? address.substring(0, address.indexOf('!') + 1) : '';
        const [startRef, endRef] = cellRef.split(':');
        const firstCellAddress = sheetPrefix + startRef!;

        // Parse range dimensions
        const startRow = parseInt(startRef!.match(/[0-9]+/)?.[0] || '1', 10);
        const endRow = parseInt(endRef!.match(/[0-9]+/)?.[0] || '1', 10);
        const startCol = columnToNumber(startRef!.match(/[A-Za-z]+/)?.[0] || 'A');
        const endCol = columnToNumber(endRef!.match(/[A-Za-z]+/)?.[0] || 'A');
        const rowCount = Math.abs(endRow - startRow) + 1;
        const colCount = Math.abs(endCol - startCol) + 1;

        // Step 1: Set formula in first cell and load R1C1 in one sync
        const firstCell = sheet.getRange(firstCellAddress);
        firstCell.formulas = [[formula]];
        firstCell.load('formulasR1C1');
        await context.sync();

        // Step 2: Apply R1C1 formula to entire range
        const r1c1Formula = firstCell.formulasR1C1[0][0] as string;
        const fullRange = sheet.getRange(address);
        const formulaArray = Array.from({ length: rowCount }, () =>
          Array.from({ length: colCount }, () => r1c1Formula)
        );
        fullRange.formulasR1C1 = formulaArray;
        await context.sync();
      }
    });

    return { success: true, cellCount, address };
  } catch (error) {
    return {
      success: false,
      cellCount,
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
