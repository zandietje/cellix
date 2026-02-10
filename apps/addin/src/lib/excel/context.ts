/**
 * Context extraction utilities for gathering Excel state for AI context.
 * Provides structured data about the current selection, sheets, and data types.
 */

import { SAFETY_LIMITS } from '../constants';
import {
  getSelectedRangeValues,
  getSelectedRangeAddress,
  getActiveSheetName,
  getSheetNames,
  getTableMetadata,
} from './reader';
import { extractSheetProfile, extractWorkbookInventory } from './profiler';
import {
  getCachedProfile,
  setCachedProfile,
  getCachedInventory,
  setCachedInventory,
} from './profileCache';
import type {
  ExcelContextFull,
  ExcelContextWithProfile,
  DataTypeInfo,
  BasicStats,
  DataType,
} from '@cellix/shared';

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
  if (sampledValues[0] && sampledValues[0].length > SAFETY_LIMITS.MAX_CONTEXT_COLS) {
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

    // Check for currency (starts with $, €, £, ¥, ₱ followed by number)
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
  const typeCounts = types.reduce(
    (acc, type) => {
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

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
 * Options for profile-first context extraction.
 */
export interface ProfileContextOptions {
  /** Include selection data (default: false) */
  includeData?: boolean;
  /** Max rows if includeData is true (default: 50) */
  dataLimit?: number;
}

/**
 * Extract profile-first context for AI.
 * Returns profile + selection address, no data by default.
 * This is the recommended context extraction for Phase 5C+.
 */
export async function extractContextWithProfile(
  options: ProfileContextOptions = {}
): Promise<ExcelContextWithProfile> {
  const { includeData = false, dataLimit = SAFETY_LIMITS.MAX_CONTEXT_ROWS } = options;

  // Get inventory (cached or fresh)
  let inventory = getCachedInventory();
  if (!inventory) {
    inventory = await extractWorkbookInventory();
    setCachedInventory(inventory);
  }

  // Get active sheet profile (cached or fresh)
  const activeSheetName = inventory.activeSheet;
  let profile = getCachedProfile(activeSheetName);
  if (!profile) {
    profile = await extractSheetProfile(activeSheetName);
    setCachedProfile(profile);
  }

  // Get selection info via Office.js
  const selectionInfo = await Excel.run(async (context) => {
    const range = context.workbook.getSelectedRange();
    range.load(['address', 'rowCount', 'columnCount']);
    if (includeData) {
      range.load('values');
    }
    await context.sync();

    // Parse address to remove sheet name prefix
    const address = range.address.includes('!')
      ? range.address.split('!')[1]
      : range.address;

    return {
      address,
      size: { rows: range.rowCount, cols: range.columnCount },
      data: includeData
        ? (range.values as unknown[][]).slice(0, dataLimit)
        : undefined,
    };
  });

  return {
    profile,
    inventory,
    selection: selectionInfo,
    extractedAt: Date.now(),
  };
}

