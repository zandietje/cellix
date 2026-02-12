/**
 * Chunked Range Reader for large Excel ranges.
 * Reads in blocks to avoid memory/payload limits with Office.js.
 */

/** Default rows per chunk */
const DEFAULT_CHUNK_SIZE = 5000;

/** Options for chunked reading */
export interface ChunkedReaderOptions {
  /** Rows per chunk (default: 5000) */
  chunkSize?: number;
  /** Specific columns to load (e.g., ['A', 'B', 'C']) */
  columns?: string[];
  /** Progress callback (0-1) */
  onProgress?: (progress: number) => void;
  /** Abort signal for cancellation */
  abortSignal?: AbortSignal;
  /** Yield to event loop between chunks (default: true) */
  yieldBetweenChunks?: boolean;
}

/** Result from chunked reading */
export interface ChunkedReadResult {
  /** 2D array of values */
  values: unknown[][];
  /** Total rows read */
  totalRows: number;
  /** Total columns read */
  totalCols: number;
  /** Whether reading was aborted */
  aborted: boolean;
}

/**
 * Parse column letters to 0-based indices.
 * @param columns - Array of column letters (e.g., ['A', 'B', 'AA'])
 * @returns Array of 0-based column indices
 */
export function parseColumnSpec(columns: string[]): number[] {
  return columns.map((col) => {
    const upper = col.toUpperCase();
    let index = 0;
    for (let i = 0; i < upper.length; i++) {
      index = index * 26 + (upper.charCodeAt(i) - 64);
    }
    return index - 1; // Convert to 0-based
  });
}

/**
 * Filter a row to only include specified column indices.
 */
function filterColumns(row: unknown[], columnIndices: number[]): unknown[] {
  return columnIndices.map((idx) => (idx < row.length ? row[idx] : null));
}

/**
 * Yield to the event loop to keep UI responsive.
 */
function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Read a large range in chunks.
 * Supports column filtering, progress reporting, and cancellation.
 *
 * @param address - Range address (e.g., "A1:Z1000") or undefined for used range
 * @param options - Chunked reader options
 * @returns ChunkedReadResult with values and metadata
 */
export async function readLargeRange(
  address?: string,
  options: ChunkedReaderOptions = {}
): Promise<ChunkedReadResult> {
  const {
    chunkSize = DEFAULT_CHUNK_SIZE,
    columns,
    onProgress,
    abortSignal,
    yieldBetweenChunks = true,
  } = options;

  const columnIndices = columns ? parseColumnSpec(columns) : null;
  const allValues: unknown[][] = [];
  let aborted = false;
  let totalRows = 0;
  let totalCols = 0;

  await Excel.run(async (context) => {
    const sheet = context.workbook.worksheets.getActiveWorksheet();

    // Get the range to read
    const range = address
      ? sheet.getRange(address)
      : sheet.getUsedRangeOrNullObject();

    range.load(['rowCount', 'columnCount']);
    await context.sync();

    // Handle empty/null range
    if (range.isNullObject || range.rowCount === 0) {
      return;
    }

    totalRows = range.rowCount;
    totalCols = range.columnCount;
    const chunks = Math.ceil(totalRows / chunkSize);

    for (let i = 0; i < chunks; i++) {
      // Check for abort
      if (abortSignal?.aborted) {
        aborted = true;
        break;
      }

      const startRow = i * chunkSize;
      const rowsToRead = Math.min(chunkSize, totalRows - startRow);

      // Get chunk range
      const chunk = sheet.getRangeByIndexes(startRow, 0, rowsToRead, totalCols);
      chunk.load('values');
      await context.sync();

      // Process chunk values
      let chunkValues = chunk.values as unknown[][];

      // Filter columns if specified
      if (columnIndices) {
        chunkValues = chunkValues.map((row) => filterColumns(row, columnIndices));
      }

      allValues.push(...chunkValues);

      // Report progress
      onProgress?.((i + 1) / chunks);

      // Yield to event loop to keep UI responsive
      if (yieldBetweenChunks && i < chunks - 1) {
        await yieldToEventLoop();
      }
    }
  });

  return {
    values: allValues,
    totalRows,
    totalCols: columnIndices ? columnIndices.length : totalCols,
    aborted,
  };
}

/**
 * Generator version for streaming - processes rows without storing all in memory.
 * Useful for computing stats without full data load.
 *
 * @param sheetName - Optional sheet name (uses active sheet if not specified)
 * @param address - Range address (e.g., "A1:Z1000") or undefined for used range
 * @param options - Chunked reader options
 * @yields Arrays of rows (chunks) as they are read
 */
export async function* streamLargeRange(
  sheetName?: string,
  address?: string,
  options: ChunkedReaderOptions = {}
): AsyncGenerator<unknown[][], void, undefined> {
  const {
    chunkSize = DEFAULT_CHUNK_SIZE,
    columns,
    onProgress,
    abortSignal,
    yieldBetweenChunks = true,
  } = options;

  const columnIndices = columns ? parseColumnSpec(columns) : null;

  // We need to wrap in Excel.run but also yield values out
  // Since we can't yield inside Excel.run, we collect metadata first
  let totalRows = 0;
  let totalCols = 0;
  let rangeStartRow = 0;
  let rangeStartCol = 0;

  // First pass: get range dimensions
  await Excel.run(async (context) => {
    const sheet = sheetName
      ? context.workbook.worksheets.getItem(sheetName)
      : context.workbook.worksheets.getActiveWorksheet();

    const range = address
      ? sheet.getRange(address)
      : sheet.getUsedRangeOrNullObject();

    range.load(['rowCount', 'columnCount', 'rowIndex', 'columnIndex']);
    await context.sync();

    if (!range.isNullObject && range.rowCount > 0) {
      totalRows = range.rowCount;
      totalCols = range.columnCount;
      rangeStartRow = range.rowIndex;
      rangeStartCol = range.columnIndex;
    }
  });

  // Exit early if no data
  if (totalRows === 0) {
    return;
  }

  const chunks = Math.ceil(totalRows / chunkSize);

  // Second pass: read chunks one by one
  for (let i = 0; i < chunks; i++) {
    // Check for abort
    if (abortSignal?.aborted) {
      return;
    }

    const startRow = i * chunkSize;
    const rowsToRead = Math.min(chunkSize, totalRows - startRow);
    let chunkValues: unknown[][] = [];

    await Excel.run(async (context) => {
      const sheet = sheetName
        ? context.workbook.worksheets.getItem(sheetName)
        : context.workbook.worksheets.getActiveWorksheet();

      // Use absolute indices based on range start
      const chunk = sheet.getRangeByIndexes(
        rangeStartRow + startRow,
        rangeStartCol,
        rowsToRead,
        totalCols
      );
      chunk.load('values');
      await context.sync();

      chunkValues = chunk.values as unknown[][];
    });

    // Filter columns if specified
    if (columnIndices) {
      chunkValues = chunkValues.map((row) => filterColumns(row, columnIndices));
    }

    yield chunkValues;

    // Report progress
    onProgress?.((i + 1) / chunks);

    // Yield to event loop to keep UI responsive
    if (yieldBetweenChunks && i < chunks - 1) {
      await yieldToEventLoop();
    }
  }
}

/**
 * Read a specific sheet's range in chunks.
 * Convenience wrapper that specifies sheet name.
 *
 * @param sheetName - Sheet name to read from
 * @param address - Range address (e.g., "A1:Z1000") or undefined for used range
 * @param options - Chunked reader options
 * @returns ChunkedReadResult with values and metadata
 */
export async function readSheetRange(
  sheetName: string,
  address?: string,
  options: ChunkedReaderOptions = {}
): Promise<ChunkedReadResult> {
  const {
    chunkSize = DEFAULT_CHUNK_SIZE,
    columns,
    onProgress,
    abortSignal,
    yieldBetweenChunks = true,
  } = options;

  const columnIndices = columns ? parseColumnSpec(columns) : null;
  const allValues: unknown[][] = [];
  let aborted = false;
  let totalRows = 0;
  let totalCols = 0;

  await Excel.run(async (context) => {
    const sheet = context.workbook.worksheets.getItem(sheetName);

    // Get the range to read
    const range = address
      ? sheet.getRange(address)
      : sheet.getUsedRangeOrNullObject();

    range.load(['rowCount', 'columnCount']);
    await context.sync();

    // Handle empty/null range
    if (range.isNullObject || range.rowCount === 0) {
      return;
    }

    totalRows = range.rowCount;
    totalCols = range.columnCount;
    const chunks = Math.ceil(totalRows / chunkSize);

    for (let i = 0; i < chunks; i++) {
      // Check for abort
      if (abortSignal?.aborted) {
        aborted = true;
        break;
      }

      const startRow = i * chunkSize;
      const rowsToRead = Math.min(chunkSize, totalRows - startRow);

      // Get chunk range
      const chunk = sheet.getRangeByIndexes(startRow, 0, rowsToRead, totalCols);
      chunk.load('values');
      await context.sync();

      // Process chunk values
      let chunkValues = chunk.values as unknown[][];

      // Filter columns if specified
      if (columnIndices) {
        chunkValues = chunkValues.map((row) => filterColumns(row, columnIndices));
      }

      allValues.push(...chunkValues);

      // Report progress
      onProgress?.((i + 1) / chunks);

      // Yield to event loop to keep UI responsive
      if (yieldBetweenChunks && i < chunks - 1) {
        await yieldToEventLoop();
      }
    }
  });

  return {
    values: allValues,
    totalRows,
    totalCols: columnIndices ? columnIndices.length : totalCols,
    aborted,
  };
}
