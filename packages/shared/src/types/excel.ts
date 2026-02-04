/**
 * Excel-related types for Cellix.
 * These types are shared between the add-in and backend.
 */

/** Data type detected in a column */
export type DataType = 'number' | 'date' | 'currency' | 'percentage' | 'text' | 'mixed' | 'empty';

/** Information about a column's data type */
export interface DataTypeInfo {
  /** Column index (0-based) */
  column: number;
  /** Header name for this column */
  header: string;
  /** Detected data type */
  type: DataType;
  /** Sample values from the column */
  sampleValues: unknown[];
}

/** Basic statistics for a numeric column */
export interface ColumnStats {
  /** Column index */
  column: number;
  /** Column header */
  header: string;
  /** Sum of all numeric values */
  sum: number;
  /** Average of all numeric values */
  avg: number;
  /** Minimum value */
  min: number;
  /** Maximum value */
  max: number;
  /** Count of numeric values */
  count: number;
}

/** Statistics aggregation */
export interface BasicStats {
  /** Statistics for each numeric column */
  numericColumns: ColumnStats[];
}

/** Metadata about an Excel table */
export interface TableInfo {
  /** Table name */
  name: string;
  /** Sheet containing the table */
  sheetName: string;
  /** Table range address */
  address: string;
  /** Number of data rows (excluding header) */
  rowCount: number;
  /** Number of columns */
  columnCount: number;
}

/** Selection information */
export interface SelectionInfo {
  /** Range address (e.g., "Sheet1!A1:C10") */
  address: string;
  /** 2D array of cell values (sampled if large) */
  values: unknown[][];
  /** Column headers (first row) */
  headers: string[];
  /** Total row count in selection */
  rowCount: number;
  /** Total column count in selection */
  columnCount: number;
  /** Whether values were sampled (original > max rows) */
  sampled: boolean;
  /** Original row count before sampling */
  originalRowCount?: number;
}

/** Full Excel context for AI */
export interface ExcelContextFull {
  /** Current selection information */
  selection: SelectionInfo;
  /** Active worksheet name */
  activeSheet: string;
  /** All worksheet names */
  allSheets: string[];
  /** Tables in the workbook */
  tables: TableInfo[];
  /** Data types detected per column */
  dataTypes: DataTypeInfo[];
  /** Basic statistics for numeric columns */
  stats: BasicStats;
  /** Timestamp when context was extracted */
  extractedAt: number;
}

/** Formatting options for a range */
export interface FormatOptions {
  /** Background fill color (hex) */
  fillColor?: string;
  /** Font color (hex) */
  fontColor?: string;
  /** Bold text */
  bold?: boolean;
  /** Italic text */
  italic?: boolean;
  /** Number format string (e.g., "0.00%", "$#,##0") */
  numberFormat?: string;
  /** Horizontal alignment */
  horizontalAlignment?: 'left' | 'center' | 'right';
}

/** Result of a write operation */
export interface WriteResult {
  /** Whether the operation succeeded */
  success: boolean;
  /** Number of cells affected */
  cellCount: number;
  /** Address that was written to */
  address?: string;
  /** Error message if failed */
  error?: string;
}
