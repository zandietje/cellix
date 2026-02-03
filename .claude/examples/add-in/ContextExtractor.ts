/**
 * Context Extractor - Example Implementation
 *
 * Extracts Excel context for sending to AI.
 * Applies sampling and safety limits to avoid large payloads.
 */

import {
  getSelectedRangeValues,
  getSelectedRangeAddress,
  getActiveSheetName,
  getSheetNames,
  getTableMetadata,
} from './ExcelReadHelper';

const MAX_CONTEXT_ROWS = 50;
const MAX_CONTEXT_COLS = 20;

/**
 * Context object sent to AI for understanding current Excel state.
 */
export interface ExcelContext {
  selection: {
    address: string;
    values: unknown[][];
    headers: string[];
    rowCount: number;
    columnCount: number;
    sampled: boolean;
  };
  activeSheet: string;
  allSheets: string[];
  tables: Array<{
    name: string;
    address: string;
    rowCount: number;
  }>;
  dataTypes: DataTypeInfo[];
  stats: BasicStats;
}

interface DataTypeInfo {
  column: number;
  header: string;
  type: 'number' | 'date' | 'currency' | 'percentage' | 'text' | 'mixed';
  sampleValues: unknown[];
}

interface BasicStats {
  numericColumns: Array<{
    column: number;
    header: string;
    sum: number;
    avg: number;
    min: number;
    max: number;
  }>;
}

/**
 * Extract full context from current Excel state.
 * This is the main function called before sending to AI.
 */
export async function extractContext(): Promise<ExcelContext> {
  // Gather all data in parallel where possible
  const [values, address, activeSheet, allSheets, tables] = await Promise.all([
    getSelectedRangeValues(),
    getSelectedRangeAddress(),
    getActiveSheetName(),
    getSheetNames(),
    getTableMetadata(),
  ]);

  // Sample if too large
  const { sampledValues, sampled } = sampleValues(values);

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
      rowCount: values.length,
      columnCount: values[0]?.length ?? 0,
      sampled,
    },
    activeSheet,
    allSheets,
    tables: tables.map((t) => ({
      name: t.name,
      address: t.address,
      rowCount: t.rowCount,
    })),
    dataTypes,
    stats,
  };
}

/**
 * Sample values if they exceed limits.
 */
function sampleValues(values: unknown[][]): {
  sampledValues: unknown[][];
  sampled: boolean;
} {
  if (values.length === 0) {
    return { sampledValues: [], sampled: false };
  }

  let sampledValues = values;
  let sampled = false;

  // Sample rows
  if (values.length > MAX_CONTEXT_ROWS) {
    sampledValues = values.slice(0, MAX_CONTEXT_ROWS);
    sampled = true;
  }

  // Sample columns
  if (sampledValues[0].length > MAX_CONTEXT_COLS) {
    sampledValues = sampledValues.map((row) => row.slice(0, MAX_CONTEXT_COLS));
    sampled = true;
  }

  return { sampledValues, sampled };
}

/**
 * Detect data types for each column.
 */
function detectDataTypes(values: unknown[][]): DataTypeInfo[] {
  if (values.length < 2) {
    return [];
  }

  const headers = values[0];
  const dataRows = values.slice(1);
  const dataTypes: DataTypeInfo[] = [];

  for (let col = 0; col < headers.length; col++) {
    const columnValues = dataRows.map((row) => row[col]).filter((v) => v != null);
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
 * Infer the data type of a column based on its values.
 */
function inferColumnType(
  values: unknown[]
): 'number' | 'date' | 'currency' | 'percentage' | 'text' | 'mixed' {
  if (values.length === 0) {
    return 'text';
  }

  const types = values.map((v) => {
    if (typeof v === 'number') {
      return 'number';
    }

    const str = String(v);

    // Check for currency
    if (/^[$\u20AC\u00A3\u00A5][\d,.]+$/.test(str)) {
      return 'currency';
    }

    // Check for percentage
    if (/^[\d.]+%$/.test(str)) {
      return 'percentage';
    }

    // Check for date
    if (!isNaN(Date.parse(str)) && /\d{1,4}[-/]\d{1,2}[-/]\d{1,4}/.test(str)) {
      return 'date';
    }

    // Check for numeric string
    if (!isNaN(parseFloat(str)) && isFinite(Number(str))) {
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
  if (count / types.length > 0.8) {
    return dominantType as DataTypeInfo['type'];
  }

  return 'mixed';
}

/**
 * Calculate basic statistics for numeric columns.
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
        const parsed = parseFloat(String(val));
        return isNaN(parsed) ? null : parsed;
      })
      .filter((n): n is number => n !== null);

    if (numbers.length > 0) {
      numericColumns.push({
        column: col,
        header: headers[col],
        sum: numbers.reduce((a, b) => a + b, 0),
        avg: numbers.reduce((a, b) => a + b, 0) / numbers.length,
        min: Math.min(...numbers),
        max: Math.max(...numbers),
      });
    }
  }

  return { numericColumns };
}

/**
 * Format context for inclusion in AI prompt.
 */
export function formatContextForPrompt(context: ExcelContext): string {
  const lines: string[] = [];

  lines.push(`## Current Excel Context`);
  lines.push(``);
  lines.push(`**Active Sheet:** ${context.activeSheet}`);
  lines.push(`**All Sheets:** ${context.allSheets.join(', ')}`);
  lines.push(`**Selection:** ${context.selection.address}`);
  lines.push(
    `**Size:** ${context.selection.rowCount} rows x ${context.selection.columnCount} columns`
  );

  if (context.selection.sampled) {
    lines.push(`*(Note: Data sampled to first ${MAX_CONTEXT_ROWS} rows)*`);
  }

  lines.push(``);
  lines.push(`### Headers`);
  lines.push(context.selection.headers.join(' | '));

  lines.push(``);
  lines.push(`### Data Types`);
  for (const dt of context.dataTypes) {
    lines.push(`- **${dt.header}**: ${dt.type}`);
  }

  if (context.stats.numericColumns.length > 0) {
    lines.push(``);
    lines.push(`### Numeric Summary`);
    for (const nc of context.stats.numericColumns) {
      lines.push(
        `- **${nc.header}**: Sum=${nc.sum.toFixed(2)}, Avg=${nc.avg.toFixed(2)}, Min=${nc.min}, Max=${nc.max}`
      );
    }
  }

  if (context.tables.length > 0) {
    lines.push(``);
    lines.push(`### Tables`);
    for (const table of context.tables) {
      lines.push(`- **${table.name}**: ${table.address} (${table.rowCount} rows)`);
    }
  }

  return lines.join('\n');
}
