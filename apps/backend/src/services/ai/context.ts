/**
 * Excel context formatting for AI prompts.
 * Converts ExcelContextFull to a readable string for the AI.
 */

import type { ExcelContextFull } from '@cellix/shared';

/** Maximum data types to show in context (keep prompt concise) */
const MAX_DATA_TYPES_SHOWN = 15;

/** Maximum numeric columns to show in context */
const MAX_NUMERIC_COLUMNS_SHOWN = 8;

/** Maximum sample data rows to show */
const MAX_SAMPLE_ROWS = 10;

/**
 * Formats Excel context for inclusion in the AI prompt.
 * Provides structured information about the user's current Excel state.
 */
export function formatExcelContext(context: ExcelContextFull | undefined | null): string {
  if (!context) return '';

  const lines: string[] = [];

  lines.push('\n## Current Excel Context\n');

  // Basic selection info
  lines.push(`**Active Sheet:** ${context.activeSheet}`);
  lines.push(`**Selection:** ${context.selection.address}`);
  lines.push(
    `**Size:** ${context.selection.rowCount} rows x ${context.selection.columnCount} columns`
  );

  if (context.selection.sampled) {
    lines.push(
      `*(Note: Data sampled to first ${context.selection.rowCount} rows from ${context.selection.originalRowCount} total)*`
    );
  }

  // Headers
  if (context.selection.headers.length > 0) {
    lines.push('\n**Headers:**');
    lines.push(context.selection.headers.join(' | '));
  }

  // Data types per column
  if (context.dataTypes.length > 0) {
    lines.push('\n**Column Types:**');
    for (const dt of context.dataTypes.slice(0, MAX_DATA_TYPES_SHOWN)) {
      lines.push(`- ${dt.header}: ${dt.type}`);
    }
    if (context.dataTypes.length > MAX_DATA_TYPES_SHOWN) {
      lines.push(`- ... and ${context.dataTypes.length - MAX_DATA_TYPES_SHOWN} more columns`);
    }
  }

  // Numeric stats
  if (context.stats.numericColumns.length > 0) {
    lines.push('\n**Numeric Summary:**');
    for (const col of context.stats.numericColumns.slice(0, MAX_NUMERIC_COLUMNS_SHOWN)) {
      lines.push(
        `- ${col.header}: Sum=${formatNum(col.sum)}, Avg=${formatNum(col.avg)}, Min=${formatNum(col.min)}, Max=${formatNum(col.max)}, Count=${col.count}`
      );
    }
    if (context.stats.numericColumns.length > MAX_NUMERIC_COLUMNS_SHOWN) {
      lines.push(`- ... and ${context.stats.numericColumns.length - MAX_NUMERIC_COLUMNS_SHOWN} more numeric columns`);
    }
  }

  // Sample data (first rows for AI understanding)
  if (context.selection.values.length > 1) {
    lines.push(`\n**Sample Data (first ${MAX_SAMPLE_ROWS} rows):**`);
    lines.push('```');
    const sample = context.selection.values.slice(0, MAX_SAMPLE_ROWS + 1); // Header + data rows
    for (const row of sample) {
      lines.push(row.map((cell) => formatCell(cell)).join('\t'));
    }
    lines.push('```');
  }

  // Tables in workbook
  if (context.tables.length > 0) {
    lines.push('\n**Tables in Workbook:**');
    for (const table of context.tables) {
      lines.push(`- ${table.name}: ${table.address} (${table.rowCount} data rows)`);
    }
  }

  // All sheets
  if (context.allSheets.length > 1) {
    lines.push(`\n**All Sheets:** ${context.allSheets.join(', ')}`);
  }

  return lines.join('\n');
}

/**
 * Format a number for display in context.
 */
function formatNum(n: number): string {
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return Number.isInteger(n) ? n.toString() : n.toFixed(2);
}

/**
 * Format a cell value for display.
 */
function formatCell(cell: unknown): string {
  if (cell === null || cell === undefined || cell === '') {
    return '';
  }
  const str = String(cell);
  // Truncate long strings
  if (str.length > 50) {
    return str.slice(0, 47) + '...';
  }
  return str;
}
