/**
 * Arquero wrapper utilities for data processing.
 * Provides typed helpers for table operations, statistics, and aggregation.
 */

import * as aq from 'arquero';
import { op } from 'arquero';
import type { ProfileColumnStats } from '@cellix/shared';

// Re-export for convenience
export { aq, op };

/** Arquero ColumnTable type */
export type ColumnTable = ReturnType<typeof aq.table>;

/**
 * Create an Arquero table from Excel-style 2D array.
 * @param values - 2D array where first row is headers
 * @param hasHeaders - Whether first row contains headers
 */
export function createTable(
  values: unknown[][],
  hasHeaders = true
): ColumnTable | null {
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
    columns[header] = dataRows.map((row) => row[colIndex]);
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
  table: ColumnTable,
  column: string
): ProfileColumnStats | null {
  // Check if column exists and has numeric values
  const values = table.array(column) as unknown[];
  const numericValues = values.filter(
    (v): v is number => typeof v === 'number' && !isNaN(v)
  );

  if (numericValues.length === 0) {
    return null;
  }

  try {
    // Calculate stats manually for better type safety
    const sum = numericValues.reduce((a, b) => a + b, 0);
    const count = numericValues.length;
    const avg = sum / count;
    const min = Math.min(...numericValues);
    const max = Math.max(...numericValues);

    // Calculate standard deviation
    const squareDiffs = numericValues.map((value) => Math.pow(value - avg, 2));
    const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / count;
    const stdev = Math.sqrt(avgSquareDiff);

    return { sum, avg, min, max, count, stdev };
  } catch {
    return null;
  }
}

/**
 * Count unique values in a column.
 */
export function countUnique(table: ColumnTable, column: string): number {
  try {
    const values = table.array(column) as unknown[];
    const uniqueSet = new Set(values.filter((v) => v != null && v !== ''));
    return uniqueSet.size;
  } catch {
    return 0;
  }
}

/**
 * Count null/empty values in a column.
 */
export function countNulls(values: unknown[]): number {
  return values.filter((v) => v == null || v === '').length;
}

/**
 * Check if column has outliers using z-score method.
 * @param table - Arquero table
 * @param column - Column name
 * @param threshold - Z-score threshold (default 2)
 */
export function hasOutliers(
  table: ColumnTable,
  column: string,
  threshold = 2
): boolean {
  const stats = calculateColumnStats(table, column);
  if (!stats || stats.stdev === 0) {
    return false;
  }

  try {
    const values = table.array(column) as unknown[];
    for (const value of values) {
      if (typeof value !== 'number' || isNaN(value)) continue;
      const zscore = Math.abs((value - stats.avg) / stats.stdev);
      if (zscore > threshold) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Check if column has duplicate values.
 */
export function hasDuplicates(table: ColumnTable, column: string): boolean {
  const totalRows = table.numRows();
  const uniqueCount = countUnique(table, column);
  return uniqueCount < totalRows;
}

/**
 * Get sample values from a column (first N non-empty values).
 */
export function getSamples(values: unknown[], count = 3): unknown[] {
  return values.filter((v) => v != null && v !== '').slice(0, count);
}

/**
 * Filter rows using Arquero.
 * @param table - Arquero table
 * @param predicate - Filter predicate function
 */
export function filterRows(
  table: ColumnTable,
  predicate: (row: Record<string, unknown>) => boolean
): ColumnTable {
  return table.filter(aq.escape(predicate));
}

/**
 * Group and aggregate data.
 * @param table - Arquero table
 * @param groupBy - Columns to group by
 * @param aggregations - Aggregation specs
 */
export function groupAggregate(
  table: ColumnTable,
  groupBy: string[],
  aggregations: Record<string, (d: Record<string, unknown>) => unknown>
): ColumnTable {
  const escapedAggs: Record<string, ReturnType<typeof aq.escape>> = {};
  for (const [key, fn] of Object.entries(aggregations)) {
    escapedAggs[key] = aq.escape(fn);
  }
  return table.groupby(groupBy).rollup(escapedAggs);
}
