/**
 * Sheet Profile System Types for Cellix.
 * Provides metadata about workbook structure for intelligent LLM context.
 */

import type { DataType } from './excel.js';

/** Full profile for one worksheet */
export interface SheetProfile {
  /** Worksheet name */
  sheetName: string;
  /** Used range address (e.g., "A1:Z1000") */
  usedRange: string;
  /** Total row count in used range */
  rowCount: number;
  /** Total column count in used range */
  columnCount: number;
  /** Per-column metadata */
  columns: ColumnProfile[];
  /** Excel tables in this sheet */
  tables: SheetTableInfo[];
  /** Detected header row (0-based absolute index). -1 if no headers detected. */
  headerRow: number;
  /** Row where actual data starts (0-based absolute index) */
  dataStartRow: number;
  /** Section groups detected in the sheet (from multi-level headers) */
  sections?: SheetSection[];
  /** Debug info about header detection (for troubleshooting) */
  headerDetection?: HeaderDetectionDebug;
  /** Unix timestamp when profile was extracted */
  extractedAt: number;
  /** Version number for cache invalidation */
  version: number;
}

/** A section group detected from multi-level headers */
export interface SheetSection {
  /** Section name (e.g., "Shopee", "Brand.com") */
  name: string;
  /** Starting column index (0-based, inclusive) */
  startCol: number;
  /** Ending column index (0-based, inclusive) */
  endCol: number;
  /** Column letters range (e.g., "AI-AN") */
  columnRange: string;
}

/** Debug output from header detection (helps troubleshooting) */
export interface HeaderDetectionDebug {
  /** All candidate rows with their scores */
  candidates: Array<{ row: number; score: number }>;
  /** The chosen header row index */
  chosenRow: number;
  /** Section row index (-1 if none) */
  sectionRow: number;
}

/** Metadata for a single column */
export interface ColumnProfile {
  /** 0-based column index */
  index: number;
  /** Excel column letter (A, B, ..., AA, etc.) */
  letter: string;
  /** Header value (first row) or null if none detected */
  header: string | null;
  /** Semantic name inferred from header/values */
  inferredName: SemanticColumnType;
  /** Detected data type */
  dataType: DataType;
  /** Statistics for numeric columns, null otherwise */
  stats: ProfileColumnStats | null;
  /** Sample values (first 3 non-empty) */
  samples: unknown[];
  /** Count of unique values */
  uniqueCount: number;
  /** Count of null/empty values */
  nullCount: number;
  /** Data quality indicators */
  quality: QualitySignals;
  /** Section this column belongs to (from multi-level headers) */
  section?: string;
  /** Full qualified name including section prefix (e.g., "Shopee > Sum of Quantity") */
  qualifiedName?: string;
}

/** Extended statistics for profile columns */
export interface ProfileColumnStats {
  /** Sum of numeric values */
  sum: number;
  /** Arithmetic mean */
  avg: number;
  /** Minimum value */
  min: number;
  /** Maximum value */
  max: number;
  /** Count of numeric values */
  count: number;
  /** Standard deviation */
  stdev: number;
}

/** Data quality indicators for a column */
export interface QualitySignals {
  /** Whether column has duplicate values */
  hasDuplicates: boolean;
  /** Whether column has mixed data types */
  hasMixedTypes: boolean;
  /** Whether column has statistical outliers (z-score > 2) */
  hasOutliers: boolean;
  /** Ratio of non-null values (0-1) */
  completeness: number;
}

/** Table info within a sheet profile */
export interface SheetTableInfo {
  /** Table name */
  name: string;
  /** Table range address */
  address: string;
  /** Header names */
  headers: string[];
}

/** Lightweight summary of all sheets in workbook */
export interface WorkbookInventory {
  /** Active sheet name */
  activeSheet: string;
  /** Summary of each sheet */
  sheets: SheetSummary[];
  /** Unix timestamp when inventory was extracted */
  extractedAt: number;
}

/** Minimal info about a sheet for inventory */
export interface SheetSummary {
  /** Sheet name */
  name: string;
  /** Used range address or null if empty */
  usedRange: string | null;
  /** Approximate row count */
  rowCount: number;
  /** Approximate column count */
  columnCount: number;
  /** Whether this is the active sheet */
  isActive: boolean;
}

/** Semantic column types for ecommerce data */
export type SemanticColumnType =
  | 'date'
  | 'product_id'
  | 'order_id'
  | 'revenue'
  | 'cost'
  | 'category'
  | 'location'
  | 'quantity'
  | 'rate'
  | 'currency'
  | 'percentage'
  | 'text'
  | 'unknown';

/**
 * Progressive profiling levels.
 * Higher levels include all data from lower levels.
 */
export type ProfilingLevel =
  /** Level 0: Sheet names + used ranges (instant) */
  | 'inventory'
  /** Level 1: + Headers + row counts (on sheet focus) */
  | 'headers'
  /** Level 2: + Column types + basic stats (on first question) */
  | 'types'
  /** Level 3: + Relationships + quality signals (on complex questions) */
  | 'full';

/** Numeric values for profiling level comparison */
export const PROFILING_LEVEL_ORDER: Record<ProfilingLevel, number> = {
  inventory: 0,
  headers: 1,
  types: 2,
  full: 3,
};

/** Cache entry for a sheet profile */
export interface ProfileCacheEntry {
  /** The cached profile */
  profile: SheetProfile;
  /** Sheet name (cache key) */
  sheetName: string;
  /** Version for invalidation */
  version: number;
  /** When cached */
  cachedAt: number;
  /** Profiling level of this cached entry */
  level: ProfilingLevel;
}

/** Profile extraction options */
export interface ProfileExtractionOptions {
  /** Maximum rows per chunk for large sheets */
  chunkSize?: number;
  /** Progress callback (0-1) */
  onProgress?: (progress: number) => void;
  /** Abort signal for cancellation */
  abortSignal?: AbortSignal;
}
