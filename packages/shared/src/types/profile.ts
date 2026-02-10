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
  /** Unix timestamp when profile was extracted */
  extractedAt: number;
  /** Version number for cache invalidation */
  version: number;
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
