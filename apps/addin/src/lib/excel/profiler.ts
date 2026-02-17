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
  SheetSection,
  HeaderDetectionDebug,
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

/** Maximum rows to scan for header detection */
const HEADER_SCAN_ROWS = 10;

/** Known ecommerce platform names for section detection boosting */
const KNOWN_PLATFORMS = new Set([
  'shopee', 'lazada', 'tiktok', 'tiktok shop', 'brand.com',
  'offline', 'amazon', 'tokopedia', 'bukalapak', 'blibli',
  'zalora', 'jd.id', 'wholesale', 'retail', 'b2b', 'b2c',
]);

/** Date/currency/formatted-number patterns that indicate a data row, not a header */
const DATA_PATTERN = /^\d{1,4}[-/]\d{1,2}[-/]\d{1,4}|^[$€£¥₱][\d,.]+|^[\d,.]+[$€£¥₱%]|^\d{1,3}(,\d{3})+(\.\d+)?$/;

interface HeaderDetectionResult {
  /** 0-based absolute index of the detected header row (-1 if none) */
  headerRow: number;
  /** 0-based absolute index where data starts */
  dataStartRow: number;
  /** Headers extracted from the detected row */
  headers: string[];
  /** Index of the chosen section row (-1 if none) */
  sectionRowIndex: number;
  /** Detected sections with column ranges */
  sections: SheetSection[];
  /** Debug info: all candidate scores */
  debug: HeaderDetectionDebug;
}

/**
 * Detect the actual header row by scoring the first N rows.
 * Uses multiple signals: fill ratio, text ratio, number penalty,
 * uniqueness, average text length, and row position.
 */
function detectHeaderRow(values: unknown[][], totalCols: number): HeaderDetectionResult {
  const scanRows = Math.min(values.length, HEADER_SCAN_ROWS);

  if (scanRows === 0) {
    return {
      headerRow: -1, dataStartRow: 0, headers: [], sectionRowIndex: -1, sections: [],
      debug: { candidates: [], chosenRow: -1, sectionRow: -1 },
    };
  }

  // Score each row as a header candidate
  const candidates: Array<{ row: number; score: number }> = [];

  for (let r = 0; r < scanRows; r++) {
    const row = values[r];
    const nonEmpty = row.filter(cell => cell != null && cell !== '');

    if (nonEmpty.length === 0) {
      candidates.push({ row: r, score: 0 });
      continue;
    }

    // 1. Fill ratio: what fraction of total columns are non-empty
    const fillRatio = nonEmpty.length / totalCols;

    // Minimum fill: at least 20% of columns should be non-empty
    if (fillRatio < 0.2) {
      candidates.push({ row: r, score: 0 });
      continue;
    }

    // 2. Text ratio: fraction of non-empty cells that are actual text strings
    const textCells = nonEmpty.filter(cell => typeof cell === 'string' && String(cell).trim() !== '');
    const textRatio = textCells.length / nonEmpty.length;

    // 3. Number penalty: fraction of non-empty cells that are numbers
    const numericCells = nonEmpty.filter(cell => typeof cell === 'number');
    const numberPenalty = numericCells.length / nonEmpty.length;

    // 4. Data-pattern penalty: fraction of text cells that look like dates, currencies,
    //    or formatted numbers. Catches text-heavy data rows (SKU lists with prices/dates)
    //    that numberPenalty alone would miss.
    const dataPatternCells = textCells.filter(cell => DATA_PATTERN.test(String(cell).trim()));
    const dataPatternPenalty = textCells.length > 0 ? dataPatternCells.length / textCells.length : 0;

    // 5. Uniqueness: ratio of unique values to filled cells
    const uniqueValues = new Set(nonEmpty.map(v => String(v).toLowerCase().trim()));
    const uniqueRatio = uniqueValues.size / nonEmpty.length;
    const uniqueBonus = uniqueRatio > 0.6 ? 1.3 : uniqueRatio > 0.3 ? 1.0 : 0.8;

    // 6. Average text length: headers are short (5-25 chars), titles are long (>40)
    const avgLen = textCells.length > 0
      ? textCells.reduce((s: number, cell) => s + String(cell).length, 0) / textCells.length
      : 0;
    const lengthBonus = avgLen > 0 && avgLen <= 30 ? 1.2 : avgLen > 40 ? 0.6 : 1.0;

    // 7. Position: slight preference for rows closer to top
    const positionFactor = 1.0 - (r * 0.015);

    // Combined score
    const score = fillRatio * textRatio * (1 - numberPenalty) * (1 - dataPatternPenalty)
      * uniqueBonus * lengthBonus * positionFactor;

    candidates.push({ row: r, score });
  }

  // Find the best header row
  let headerRow = -1;
  let bestScore = 0;
  for (const c of candidates) {
    if (c.score > bestScore) {
      bestScore = c.score;
      headerRow = c.row;
    }
  }

  // If best score is 0, no valid header found — use synthetic headers
  // (NOT row 0, which is likely garbage: empty, a title, or data)
  if (bestScore === 0) {
    const syntheticHeaders = Array.from({ length: totalCols }, (_, i) =>
      `Column${numberToColumn(i + 1)}`
    );
    // Find first non-empty row as data start
    let firstDataRow = 0;
    for (let r = 0; r < values.length; r++) {
      if (values[r].some(cell => cell != null && cell !== '')) {
        firstDataRow = r;
        break;
      }
    }
    return {
      headerRow: -1, dataStartRow: firstDataRow, headers: syntheticHeaders,
      sectionRowIndex: -1, sections: [],
      debug: { candidates, chosenRow: -1, sectionRow: -1 },
    };
  }

  // Extract headers from detected row
  const headers = values[headerRow].map(cell => String(cell ?? ''));

  // Find data start row (first non-empty row after header)
  let dataStartRow = headerRow + 1;
  while (dataStartRow < values.length) {
    const row = values[dataStartRow];
    const nonEmpty = row.filter(cell => cell != null && cell !== '');
    if (nonEmpty.length > 0) break;
    dataStartRow++;
  }

  // Section detection: pick the BEST section row above headerRow
  const headerNonEmptyCount = values[headerRow].filter(cell => cell != null && cell !== '').length;

  interface SectionCandidate {
    rowIndex: number;
    labels: string[];
    score: number;
  }

  const sectionCandidates: SectionCandidate[] = [];

  for (let r = 0; r < headerRow; r++) {
    const row = values[r];
    const nonEmpty = row.filter(cell => cell != null && cell !== '');
    const nonEmptyCount = nonEmpty.length;

    // Must have at least 2 labels (single-label rows are titles)
    if (nonEmptyCount < 2) continue;

    // Must be sparser than header row (<50% fill)
    if (nonEmptyCount >= headerNonEmptyCount * 0.5) continue;

    // All non-empty cells must be text strings
    const allText = nonEmpty.every(cell => typeof cell === 'string' && String(cell).trim() !== '');
    if (!allText) continue;

    // Extract labels
    const labels = nonEmpty.map(cell => String(cell).trim());

    // Score this section row
    let sectionScore = labels.length; // more labels = better

    // Big bonus for known platform names
    const platformMatches = labels.filter(l => KNOWN_PLATFORMS.has(l.toLowerCase()));
    sectionScore += platformMatches.length * 5;

    // Slight bonus for short labels (section names are usually short)
    const avgLabelLen = labels.reduce((s, l) => s + l.length, 0) / labels.length;
    if (avgLabelLen <= 15) sectionScore += 2;

    // Proximity bias: section row is typically within 1-2 rows of the header.
    // A title row at row 0 with "Shopee" shouldn't beat a proper section row
    // at row 2 when headers are at row 3.
    const distance = headerRow - r;
    if (distance <= 2) sectionScore += 3;
    else if (distance <= 4) sectionScore += 1;
    // distance > 4: no proximity bonus

    sectionCandidates.push({ rowIndex: r, labels, score: sectionScore });
  }

  // Pick the best section row (highest score)
  let sectionRowIndex = -1;
  let sections: SheetSection[] = [];

  if (sectionCandidates.length > 0) {
    sectionCandidates.sort((a, b) => b.score - a.score);
    const bestSection = sectionCandidates[0];
    sectionRowIndex = bestSection.rowIndex;
    sections = extractSectionsFromRow(values[sectionRowIndex], totalCols);
  }

  console.debug('[Profiler] Header detection:', {
    chosenRow: headerRow,
    score: bestScore,
    runnerUp: candidates.filter(c => c.row !== headerRow).sort((a, b) => b.score - a.score)[0],
    sectionRow: sectionRowIndex,
    sectionLabels: sectionCandidates[0]?.labels,
  });

  return {
    headerRow,
    dataStartRow,
    headers,
    sectionRowIndex,
    sections,
    debug: {
      candidates: candidates.filter(c => c.score > 0),
      chosenRow: headerRow,
      sectionRow: sectionRowIndex,
    },
  };
}

/**
 * Extract section definitions from a sparse row using forward-fill.
 * Each non-empty cell starts a new section label that fills rightward
 * until the next non-empty cell.
 *
 * Special handling for adjacent field-name/value pairs common in pivots:
 * e.g., "Customer group2" | "Shopee" → prefer "Shopee" (known platform)
 */
function extractSectionsFromRow(row: unknown[], totalCols: number): SheetSection[] {
  // Forward-fill: build a prefix label for every column
  const prefixByCol: string[] = new Array(totalCols).fill('');
  let currentLabel = '';

  for (let c = 0; c < row.length && c < totalCols; c++) {
    const cell = row[c];
    if (cell != null && cell !== '') {
      const cellStr = String(cell).trim();

      // Check if next cell is also non-empty (adjacent pair)
      const nextCell = c + 1 < row.length ? row[c + 1] : null;
      if (nextCell != null && nextCell !== '') {
        const nextStr = String(nextCell).trim();
        // Prefer the known platform name, or the second (more specific) label
        if (KNOWN_PLATFORMS.has(nextStr.toLowerCase())) {
          currentLabel = nextStr;
          prefixByCol[c] = currentLabel;
          c++; // skip next cell, we consumed it
          prefixByCol[c] = currentLabel;
          continue;
        } else if (KNOWN_PLATFORMS.has(cellStr.toLowerCase())) {
          currentLabel = cellStr;
        } else {
          // Neither is a known platform — use the second (usually more specific)
          currentLabel = nextStr;
          prefixByCol[c] = currentLabel;
          c++; // skip next cell
          prefixByCol[c] = currentLabel;
          continue;
        }
      } else {
        currentLabel = cellStr;
      }
    }
    prefixByCol[c] = currentLabel;
  }

  // Build sections from contiguous runs of the same label
  const sections: SheetSection[] = [];
  let currentSection: { name: string; startCol: number } | null = null;

  for (let c = 0; c < totalCols; c++) {
    const label = prefixByCol[c];
    if (!label) {
      // No section — close current if any
      if (currentSection) {
        sections.push({
          name: currentSection.name,
          startCol: currentSection.startCol,
          endCol: c - 1,
          columnRange: `${numberToColumn(currentSection.startCol + 1)}-${numberToColumn(c)}`,
        });
        currentSection = null;
      }
      continue;
    }

    if (!currentSection || currentSection.name !== label) {
      // Close previous section
      if (currentSection) {
        sections.push({
          name: currentSection.name,
          startCol: currentSection.startCol,
          endCol: c - 1,
          columnRange: `${numberToColumn(currentSection.startCol + 1)}-${numberToColumn(c)}`,
        });
      }
      // Start new section
      currentSection = { name: label, startCol: c };
    }
  }

  // Close last section
  if (currentSection) {
    sections.push({
      name: currentSection.name,
      startCol: currentSection.startCol,
      endCol: totalCols - 1,
      columnRange: `${numberToColumn(currentSection.startCol + 1)}-${numberToColumn(totalCols)}`,
    });
  }

  return sections;
}

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
      headerRow: -1,
      dataStartRow: 0,
      extractedAt: Date.now(),
      version: 2,
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

    // Smart header detection: scan first N rows to find actual header row
    const detection = detectHeaderRow(cappedValues, totalCols);
    const headers = detection.headers;

    // Build a virtual values array: [header row, data rows...]
    // This lets buildColumnProfiles work correctly regardless of
    // where headers and data are in the original sheet.
    const dataValues = detection.dataStartRow < cappedValues.length
      ? [
          headers.map((h, i) => h || `Column${i + 1}`),
          ...cappedValues.slice(detection.dataStartRow),
        ]
      : [headers.map((h, i) => h || `Column${i + 1}`)];

    // Get table info
    const tables = await extractTableInfo(sheet, context);

    // Build qualified names map from detected sections (needed for Arquero dedup)
    const qualifiedNames = new Map<number, string>();
    for (const section of detection.sections) {
      for (let i = section.startCol; i <= section.endCol && i < headers.length; i++) {
        const h = headers[i] || `Column ${numberToColumn(i + 1)}`;
        qualifiedNames.set(i, `${section.name} > ${h}`);
      }
    }

    // Build column profiles
    const columns = buildColumnProfiles(dataValues, headers, qualifiedNames);

    // Enrich columns with section info and qualified names
    for (const col of columns) {
      const section = detection.sections.find(
        s => col.index >= s.startCol && col.index <= s.endCol
      );
      if (section) {
        col.section = section.name;
        if (col.header) {
          col.qualifiedName = `${section.name} > ${col.header}`;
        } else {
          col.qualifiedName = `${section.name} > Column ${col.letter}`;
        }
      }
    }

    return {
      sheetName: metadata.sheetName,
      usedRange: rangeAddress,
      rowCount: totalRows,
      columnCount: totalCols,
      columns,
      tables,
      headerRow: detection.headerRow,
      dataStartRow: detection.dataStartRow,
      sections: detection.sections.length > 0 ? detection.sections : undefined,
      headerDetection: detection.debug,
      extractedAt: Date.now(),
      version: 2,
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
 * @param qualifiedNames - Optional map of column index → qualified name for dedup
 */
function buildColumnProfiles(
  values: unknown[][],
  headers: string[],
  qualifiedNames?: Map<number, string>
): ColumnProfile[] {
  if (values.length < 2 || headers.length === 0) {
    return [];
  }

  const dataRows = values.slice(1);
  const table = createTable(values, true, 0, undefined, qualifiedNames);

  // Get actual column names from the table (may be deduped or qualified)
  // so stats/quality lookups use the correct name
  const tableColNames = table ? (table.columnNames() as string[]) : [];

  return headers.map((header, index) => {
    const columnValues = dataRows.map((row) => row[index]);
    const dataType = detectDataType(columnValues);
    const lookupName = tableColNames[index] ?? header;
    const stats = table ? calculateColumnStats(table, lookupName) : null;
    const quality = detectQualitySignals(table, lookupName, columnValues, dataType);

    return {
      index,
      letter: numberToColumn(index + 1),
      header: header || null,
      inferredName: inferColumnSemantic(header, columnValues),
      dataType,
      stats,
      samples: getSamples(columnValues, 3),
      uniqueCount: table ? countUnique(table, lookupName) : 0,
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

  // First, read the first N rows for header detection
  let headers: string[] = [];
  let tables: SheetTableInfo[] = [];
  let detectionResult: HeaderDetectionResult = {
    headerRow: -1, dataStartRow: 0, headers: [], sectionRowIndex: -1, sections: [],
    debug: { candidates: [], chosenRow: -1, sectionRow: -1 },
  };

  await Excel.run(async (context) => {
    const sheet = context.workbook.worksheets.getItem(sheetName);

    // Read first HEADER_SCAN_ROWS rows for header detection
    const scanRowCount = Math.min(HEADER_SCAN_ROWS, totalRows);
    const scanRange = sheet.getRangeByIndexes(0, 0, scanRowCount, totalCols);
    scanRange.load('values');
    await context.sync();

    detectionResult = detectHeaderRow(scanRange.values, totalCols);
    headers = detectionResult.headers;

    // Get table info
    tables = await extractTableInfo(sheet, context);
  });

  const detection = detectionResult;

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
  let absoluteRowIndex = 0;
  const dataStart = detection.dataStartRow;

  // Stream through the data
  for await (const chunk of streamLargeRange(sheetName, undefined, {
    chunkSize,
    onProgress,
    abortSignal,
  })) {
    // Process each row
    for (const row of chunk) {
      // Skip all rows before dataStartRow (headers, section rows, empty gaps)
      if (absoluteRowIndex < dataStart) {
        absoluteRowIndex++;
        continue;
      }
      absoluteRowIndex++;
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

  // Enrich columns with section info and qualified names
  for (const col of columns) {
    const section = detection.sections.find(
      (s: SheetSection) => col.index >= s.startCol && col.index <= s.endCol
    );
    if (section) {
      col.section = section.name;
      if (col.header) {
        col.qualifiedName = `${section.name} > ${col.header}`;
      } else {
        col.qualifiedName = `${section.name} > Column ${col.letter}`;
      }
    }
  }

  return {
    sheetName,
    usedRange,
    rowCount: totalRows,
    columnCount: totalCols,
    columns,
    tables,
    headerRow: detection.headerRow,
    dataStartRow: detection.dataStartRow,
    sections: detection.sections.length > 0 ? detection.sections : undefined,
    headerDetection: detection.debug,
    extractedAt: Date.now(),
    version: 2,
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
