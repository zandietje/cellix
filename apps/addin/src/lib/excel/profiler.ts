/**
 * Sheet Profile Extractor for Cellix.
 * Extracts metadata about worksheet structure for intelligent LLM context.
 * Uses streaming statistics for large sheets to minimize memory usage.
 */

import type {
  SheetProfile,
  ColumnProfile,
  QualitySignals,
  WorkbookInventory,
  SheetSummary,
  ProfileExtractionOptions,
  SemanticColumnType,
  SheetTableInfo,
  DataType,
  ProfileColumnStats,
} from '@cellix/shared';
import { numberToColumn } from '@cellix/shared';
import {
  createTable,
  calculateColumnStats,
  countUnique,
  countNulls,
  hasOutliers,
  hasDuplicates,
  getSamples,
  type ColumnTable,
} from '../data/arquero';
import { streamLargeRange } from './chunkedReader';
import { StreamingColumnStats } from './streamingStats';

/** Default chunk size for large sheet reading */
const DEFAULT_CHUNK_SIZE = 5000;

/** Maximum rows to process for profile (beyond this, sample) */
const MAX_PROFILE_ROWS = 50000;

/** Threshold for using streaming mode (rows) */
const STREAMING_THRESHOLD = 10000;

/** Sheet metadata result types */
type EmptySheetMetadata = { sheetName: string; isEmpty: true };
type PopulatedSheetMetadata = {
  sheetName: string;
  isEmpty: false;
  usedRange: string;
  rowCount: number;
  columnCount: number;
};
type SheetMetadata = EmptySheetMetadata | PopulatedSheetMetadata;

/**
 * Extract a full profile for a worksheet.
 * For large sheets (>10K rows), uses streaming statistics to minimize memory.
 * For smaller sheets, loads all data for full analysis.
 */
export async function extractSheetProfile(
  sheetName?: string,
  options: ProfileExtractionOptions = {}
): Promise<SheetProfile> {
  const { chunkSize = DEFAULT_CHUNK_SIZE, onProgress, abortSignal } = options;

  // First pass: get sheet metadata
  const metadata: SheetMetadata = await Excel.run(async (context) => {
    const sheet = sheetName
      ? context.workbook.worksheets.getItem(sheetName)
      : context.workbook.worksheets.getActiveWorksheet();

    sheet.load('name');
    const usedRange = sheet.getUsedRangeOrNullObject();
    usedRange.load(['address', 'rowCount', 'columnCount']);

    await context.sync();

    if (abortSignal?.aborted) {
      throw new Error('Profile extraction cancelled');
    }

    if (usedRange.isNullObject) {
      return { sheetName: sheet.name, isEmpty: true as const };
    }

    const rangeAddress = usedRange.address.includes('!')
      ? usedRange.address.split('!')[1]
      : usedRange.address;

    return {
      sheetName: sheet.name,
      isEmpty: false as const,
      usedRange: rangeAddress,
      rowCount: usedRange.rowCount,
      columnCount: usedRange.columnCount,
    };
  });

  // Handle empty sheet
  if (metadata.isEmpty) {
    return {
      sheetName: metadata.sheetName,
      usedRange: '',
      rowCount: 0,
      columnCount: 0,
      columns: [],
      tables: [],
      extractedAt: Date.now(),
      version: 1,
    };
  }

  // TypeScript now knows metadata is PopulatedSheetMetadata
  const { rowCount: totalRows, columnCount: totalCols, usedRange: rangeAddress } = metadata;

  // For large sheets, use streaming extraction
  if (totalRows > STREAMING_THRESHOLD) {
    return extractProfileWithStreaming(
      metadata.sheetName,
      totalRows,
      totalCols,
      rangeAddress,
      options
    );
  }

  // For smaller sheets, use the original approach
  return Excel.run(async (context) => {
    const sheet = sheetName
      ? context.workbook.worksheets.getItem(sheetName)
      : context.workbook.worksheets.getActiveWorksheet();

    const usedRange = sheet.getUsedRangeOrNullObject();

    // For small sheets, read all at once
    let values: unknown[][];
    if (totalRows <= chunkSize) {
      usedRange.load('values');
      await context.sync();
      values = usedRange.values;
      onProgress?.(1);
    } else {
      // For medium sheets, read in chunks
      values = await readChunked(sheet, totalRows, totalCols, chunkSize, onProgress, abortSignal);
    }

    // Cap at MAX_PROFILE_ROWS for statistics
    const cappedValues = values.length > MAX_PROFILE_ROWS ? values.slice(0, MAX_PROFILE_ROWS) : values;

    // Extract headers (first row)
    const headers =
      cappedValues.length > 0 ? cappedValues[0].map((cell) => String(cell ?? '')) : [];

    // Get table info
    const tables = await extractTableInfo(sheet, context);

    // Build column profiles
    const columns = buildColumnProfiles(cappedValues, headers);

    return {
      sheetName: metadata.sheetName,
      usedRange: rangeAddress,
      rowCount: totalRows,
      columnCount: totalCols,
      columns,
      tables,
      extractedAt: Date.now(),
      version: 1,
    };
  });
}

/**
 * Extract lightweight inventory of all sheets.
 * Fast operation for initial context.
 */
export async function extractWorkbookInventory(): Promise<WorkbookInventory> {
  return Excel.run(async (context) => {
    const sheets = context.workbook.worksheets;
    const activeSheet = context.workbook.worksheets.getActiveWorksheet();

    sheets.load('items/name');
    activeSheet.load('name');
    await context.sync();

    const sheetSummaries: SheetSummary[] = [];

    for (const sheet of sheets.items) {
      try {
        const usedRange = sheet.getUsedRangeOrNullObject();
        usedRange.load(['address', 'rowCount', 'columnCount']);
        await context.sync();

        const rangeAddress = usedRange.isNullObject
          ? null
          : usedRange.address.includes('!')
            ? usedRange.address.split('!')[1]
            : usedRange.address;

        sheetSummaries.push({
          name: sheet.name,
          usedRange: rangeAddress,
          rowCount: usedRange.isNullObject ? 0 : usedRange.rowCount,
          columnCount: usedRange.isNullObject ? 0 : usedRange.columnCount,
          isActive: sheet.name === activeSheet.name,
        });
      } catch {
        // Sheet might be empty or inaccessible
        sheetSummaries.push({
          name: sheet.name,
          usedRange: null,
          rowCount: 0,
          columnCount: 0,
          isActive: sheet.name === activeSheet.name,
        });
      }
    }

    return {
      activeSheet: activeSheet.name,
      sheets: sheetSummaries,
      extractedAt: Date.now(),
    };
  });
}

/**
 * Read large range in chunks to avoid timeout.
 */
async function readChunked(
  sheet: Excel.Worksheet,
  totalRows: number,
  totalCols: number,
  chunkSize: number,
  onProgress?: (progress: number) => void,
  abortSignal?: AbortSignal
): Promise<unknown[][]> {
  const allValues: unknown[][] = [];
  const chunks = Math.ceil(totalRows / chunkSize);

  for (let i = 0; i < chunks; i++) {
    if (abortSignal?.aborted) {
      throw new Error('Profile extraction cancelled');
    }

    const startRow = i * chunkSize;
    const rowsToRead = Math.min(chunkSize, totalRows - startRow);

    // getRangeByIndexes is 0-based
    const chunk = sheet.getRangeByIndexes(startRow, 0, rowsToRead, totalCols);
    chunk.load('values');

    await sheet.context.sync();

    allValues.push(...chunk.values);
    onProgress?.((i + 1) / chunks);
  }

  return allValues;
}

/**
 * Extract table information from sheet.
 */
async function extractTableInfo(
  sheet: Excel.Worksheet,
  context: Excel.RequestContext
): Promise<SheetTableInfo[]> {
  const tables = sheet.tables;
  tables.load('items/name');

  try {
    await context.sync();

    const tableInfos: SheetTableInfo[] = [];

    for (const table of tables.items) {
      const headerRange = table.getHeaderRowRange();
      headerRange.load(['address', 'values']);
      await context.sync();

      const address = headerRange.address.includes('!')
        ? headerRange.address.split('!')[1]
        : headerRange.address;

      tableInfos.push({
        name: table.name,
        address,
        headers: headerRange.values[0]?.map((h) => String(h ?? '')) ?? [],
      });
    }

    return tableInfos;
  } catch {
    return [];
  }
}

/**
 * Build column profiles from values.
 */
function buildColumnProfiles(values: unknown[][], headers: string[]): ColumnProfile[] {
  if (values.length < 2 || headers.length === 0) {
    return [];
  }

  const dataRows = values.slice(1);
  const table = createTable(values, true);

  return headers.map((header, index) => {
    const columnValues = dataRows.map((row) => row[index]);
    const dataType = detectDataType(columnValues);
    const stats = table ? calculateColumnStats(table, header) : null;
    const quality = detectQualitySignals(table, header, columnValues, dataType);

    return {
      index,
      letter: numberToColumn(index + 1),
      header: header || null,
      inferredName: inferColumnSemantic(header, columnValues),
      dataType,
      stats,
      samples: getSamples(columnValues, 3),
      uniqueCount: table ? countUnique(table, header) : 0,
      nullCount: countNulls(columnValues),
      quality,
    };
  });
}

/**
 * Detect data type from column values.
 */
function detectDataType(values: unknown[]): DataType {
  const nonEmpty = values.filter((v) => v != null && v !== '');

  if (nonEmpty.length === 0) {
    return 'empty';
  }

  const types = nonEmpty.map(classifyValue);
  const typeCounts = types.reduce(
    (acc, type) => {
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    },
    {} as Record<DataType, number>
  );

  const entries = Object.entries(typeCounts);
  entries.sort((a, b) => b[1] - a[1]);

  const [dominantType, count] = entries[0];

  // If >80% are same type, use that
  if (count / nonEmpty.length >= 0.8) {
    return dominantType as DataType;
  }

  return 'mixed';
}

/**
 * Classify a single value's type.
 */
function classifyValue(value: unknown): DataType {
  if (typeof value === 'number') {
    return 'number';
  }

  const str = String(value);

  // Currency patterns (supports $, EUR, GBP, JPY, PHP)
  if (/^[$\u20AC\u00A3\u00A5\u20B1][\d,.]+$/.test(str) || /^[\d,.]+[$\u20AC\u00A3\u00A5\u20B1]$/.test(str)) {
    return 'currency';
  }

  // Percentage
  if (/^[\d.]+%$/.test(str)) {
    return 'percentage';
  }

  // Date patterns
  if (!isNaN(Date.parse(str)) && /\d{1,4}[-/]\d{1,2}[-/]\d{1,4}/.test(str)) {
    return 'date';
  }

  // Numeric string
  const cleaned = str.replace(/,/g, '');
  if (!isNaN(parseFloat(cleaned)) && isFinite(Number(cleaned))) {
    return 'number';
  }

  return 'text';
}

/**
 * Detect quality signals for a column.
 */
function detectQualitySignals(
  table: ColumnTable | null,
  header: string,
  values: unknown[],
  dataType: DataType
): QualitySignals {
  const nonEmpty = values.filter((v) => v != null && v !== '');
  const completeness = values.length > 0 ? nonEmpty.length / values.length : 0;

  // Detect mixed types
  const types = nonEmpty.map(classifyValue);
  const uniqueTypes = new Set(types);
  const hasMixedTypes = uniqueTypes.size > 1 && !uniqueTypes.has('mixed');

  return {
    hasDuplicates: table ? hasDuplicates(table, header) : false,
    hasMixedTypes,
    hasOutliers:
      table && (dataType === 'number' || dataType === 'currency') ? hasOutliers(table, header) : false,
    completeness,
  };
}

/**
 * Infer semantic meaning of column from header and values.
 */
function inferColumnSemantic(header: string | null, samples: unknown[]): SemanticColumnType {
  const h = (header || '').toLowerCase();

  // Header-based detection (ordered by specificity)
  if (/date|time|created|updated|timestamp/i.test(h)) return 'date';
  if (/sku|product.?id|item.?id|asin|barcode/i.test(h)) return 'product_id';
  if (/order.?id|transaction.?id|invoice/i.test(h)) return 'order_id';
  if (/revenue|sales|amount|total|gmv|price/i.test(h)) return 'revenue';
  if (/cost|spend|expense|cogs|fee/i.test(h)) return 'cost';
  if (/category|type|segment|group/i.test(h)) return 'category';
  if (/country|region|city|location|area|province/i.test(h)) return 'location';
  if (/qty|quantity|units|count|stock/i.test(h)) return 'quantity';
  if (/rate|ratio|roas|ctr|cvr|acos/i.test(h)) return 'rate';
  if (/name|title|description|comment/i.test(h)) return 'text';
  if (/%|percent/i.test(h)) return 'percentage';
  if (/\$|\u20AC|\u00A3|currency|amount/i.test(h)) return 'currency';

  // Value-based detection (fallback)
  const sampleStr = samples.map((s) => String(s ?? '')).join(' ');
  if (/^(SKU-|PROD-|[A-Z]{2,}\d{4,})/i.test(sampleStr)) return 'product_id';
  if (/^[$\u20AC\u00A3\u00A5\u20B1]/.test(sampleStr)) return 'currency';
  if (/\d{4}[-/]\d{2}[-/]\d{2}/.test(sampleStr)) return 'date';

  return 'unknown';
}

/**
 * Extract profile using streaming for large sheets.
 * Uses StreamingColumnStats to minimize memory usage.
 * Computes statistics incrementally as data is read.
 */
async function extractProfileWithStreaming(
  sheetName: string,
  totalRows: number,
  totalCols: number,
  usedRange: string,
  options: ProfileExtractionOptions = {}
): Promise<SheetProfile> {
  const { chunkSize = DEFAULT_CHUNK_SIZE, onProgress, abortSignal } = options;

  // First, read just the headers
  let headers: string[] = [];
  let tables: SheetTableInfo[] = [];

  await Excel.run(async (context) => {
    const sheet = context.workbook.worksheets.getItem(sheetName);

    // Get headers (first row)
    const headerRange = sheet.getRangeByIndexes(0, 0, 1, totalCols);
    headerRange.load('values');
    await context.sync();

    headers = headerRange.values[0].map((h) => String(h ?? ''));

    // Get table info
    tables = await extractTableInfo(sheet, context);
  });

  // Check for cancellation
  if (abortSignal?.aborted) {
    throw new Error('Profile extraction cancelled');
  }

  // Create streaming stats for each column
  const columnStreamingStats = headers.map(() => new StreamingColumnStats());
  const columnSamples: unknown[][] = headers.map(() => []);
  const columnTypeCounts: Map<DataType, number>[] = headers.map(() => new Map());

  // Track how many data rows we've processed
  let processedRows = 0;
  let isFirstChunk = true;

  // Stream through the data
  for await (const chunk of streamLargeRange(sheetName, undefined, {
    chunkSize,
    onProgress,
    abortSignal,
  })) {
    // Skip header row in first chunk
    const dataChunk = isFirstChunk ? chunk.slice(1) : chunk;
    isFirstChunk = false;

    // Process each row
    for (const row of dataChunk) {
      processedRows++;

      // Only process up to MAX_PROFILE_ROWS for statistics
      if (processedRows > MAX_PROFILE_ROWS) {
        continue;
      }

      // Update stats for each column
      row.forEach((value, colIndex) => {
        if (colIndex >= columnStreamingStats.length) return;

        // Add to streaming stats
        columnStreamingStats[colIndex].add(value);

        // Collect samples (first 3 non-empty)
        if (value != null && value !== '' && columnSamples[colIndex].length < 3) {
          columnSamples[colIndex].push(value);
        }

        // Track types for data type detection
        if (value != null && value !== '') {
          const type = classifyValue(value);
          const counts = columnTypeCounts[colIndex];
          counts.set(type, (counts.get(type) || 0) + 1);
        }
      });
    }
  }

  // Build column profiles from streaming stats
  const columns: ColumnProfile[] = headers.map((header, index) => {
    const streaming = columnStreamingStats[index];
    const summary = streaming.getSummary();
    const typeCounts = columnTypeCounts[index];
    const samples = columnSamples[index];

    // Determine data type from type counts
    const dataType = determineDataTypeFromCounts(typeCounts);

    // Convert streaming stats to ProfileColumnStats format
    const stats: ProfileColumnStats | null = summary.isNumeric
      ? {
          sum: summary.stats.sum,
          avg: summary.stats.mean,
          min: summary.stats.min,
          max: summary.stats.max,
          count: summary.stats.count,
          stdev: summary.stats.stdev,
        }
      : null;

    // Detect mixed types
    const hasMixedTypes = typeCounts.size > 1;

    const quality: QualitySignals = {
      hasDuplicates: summary.uniqueCount < processedRows,
      hasMixedTypes,
      hasOutliers: summary.hasOutliers,
      completeness: summary.completeness,
    };

    return {
      index,
      letter: numberToColumn(index + 1),
      header: header || null,
      inferredName: inferColumnSemantic(header, samples),
      dataType,
      stats,
      samples,
      uniqueCount: summary.uniqueCount,
      nullCount: summary.nullCount,
      quality,
    };
  });

  return {
    sheetName,
    usedRange,
    rowCount: totalRows,
    columnCount: totalCols,
    columns,
    tables,
    extractedAt: Date.now(),
    version: 1,
  };
}

/**
 * Determine data type from type counts.
 */
function determineDataTypeFromCounts(typeCounts: Map<DataType, number>): DataType {
  if (typeCounts.size === 0) {
    return 'empty';
  }

  // Find dominant type
  let maxType: DataType = 'text';
  let maxCount = 0;
  let totalCount = 0;

  for (const [type, count] of typeCounts) {
    totalCount += count;
    if (count > maxCount) {
      maxCount = count;
      maxType = type;
    }
  }

  // If >80% are same type, use that
  if (maxCount / totalCount >= 0.8) {
    return maxType;
  }

  return 'mixed';
}
