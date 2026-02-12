/**
 * Zod schemas for tool parameters.
 * These define the expected input for each tool the AI can call.
 */

import { z } from 'zod';

// ============================================
// Excel Write Tools (require preview in Phase 4)
// ============================================

/** Write values to a range of cells */
export const writeRangeSchema = z.object({
  address: z.string().describe('Target range in A1 notation (e.g., "A1:C10", "Sheet1!B2:D5")'),
  values: z.array(z.array(z.unknown())).describe('2D array of values to write, matching the range dimensions'),
  reason: z.string().describe('Brief explanation of why this write is needed'),
});

/** Set an Excel formula in a cell */
export const setFormulaSchema = z.object({
  address: z.string().describe('Target cell address (e.g., "D1", "Sheet1!E5")'),
  formula: z.string().describe('Excel formula starting with = (e.g., "=SUM(A1:A10)", "=B2*C2")'),
  reason: z.string().describe('Brief explanation of the formula purpose'),
});

/** Apply formatting to a range */
export const formatRangeSchema = z.object({
  address: z.string().describe('Target range in A1 notation'),
  style: z.object({
    fillColor: z.string().optional().describe('Background color in hex (e.g., "#FFFF00" for yellow)'),
    fontColor: z.string().optional().describe('Font color in hex (e.g., "#FF0000" for red)'),
    bold: z.boolean().optional().describe('Make text bold'),
    italic: z.boolean().optional().describe('Make text italic'),
    numberFormat: z.string().optional().describe('Number format string (e.g., "0.00%", "$#,##0.00", "yyyy-mm-dd")'),
    horizontalAlignment: z.enum(['left', 'center', 'right']).optional().describe('Text alignment'),
  }).describe('Formatting options to apply'),
  reason: z.string().describe('Brief explanation of why this formatting is needed'),
});

/** Create a new worksheet */
export const createSheetSchema = z.object({
  name: z.string().max(31).describe('Name for the new worksheet (max 31 characters)'),
  reason: z.string().describe('Brief explanation of why this sheet is needed'),
});

/** Convert a range to an Excel table */
export const addTableSchema = z.object({
  address: z.string().describe('Range to convert to table (e.g., "A1:D10")'),
  name: z.string().describe('Name for the table (no spaces, letters/numbers only)'),
  hasHeaders: z.boolean().default(true).describe('Whether first row contains headers'),
  reason: z.string().describe('Brief explanation of why creating this table'),
});

/** Highlight cells with a background color */
export const highlightCellsSchema = z.object({
  address: z.string().describe('Range to highlight'),
  color: z.string().describe('Highlight color in hex (e.g., "#FFFF00" for yellow, "#90EE90" for light green)'),
  reason: z.string().describe('Brief explanation of why highlighting these cells'),
});

// ============================================
// Excel Read Tools (no preview needed)
// ============================================

/** Read values from a specific range */
export const readRangeSchema = z.object({
  address: z.string()
    .min(1, 'Address is required')
    .describe('Excel range address (e.g., "A1:C10", "Sheet1!A1:B5")'),
  includeHeaders: z.boolean()
    .optional()
    .default(true)
    .describe('Whether first row contains headers'),
});

/** Get current user selection */
export const getSelectionSchema = z.object({
  includeValues: z.boolean()
    .optional()
    .default(true)
    .describe('Whether to include cell values (false for just address/size)'),
  maxRows: z.number()
    .optional()
    .default(100)
    .describe('Maximum rows to return if includeValues is true'),
});

/** List all worksheets */
export const getSheetNamesSchema = z.object({
  includeHidden: z.boolean()
    .optional()
    .default(false)
    .describe('Whether to include hidden sheets'),
});

/** Get comprehensive Excel context */
export const getContextSchema = z.object({
  includeSelection: z.boolean()
    .optional()
    .default(true)
    .describe('Include current selection data'),
  includeTables: z.boolean()
    .optional()
    .default(true)
    .describe('Include Excel table information'),
  includeProfile: z.boolean()
    .optional()
    .default(false)
    .describe('Include full sheet profile (slower)'),
});

// ============================================
// Analytics Tools (reasoning only, no Excel modification)
// ============================================

/** Explain an ecommerce KPI */
export const explainKpiSchema = z.object({
  kpiName: z.string().describe('Name of the KPI to explain (e.g., "ROAS", "CVR", "AOV")'),
  context: z.string().optional().describe('Additional context about the user\'s specific situation'),
});

/** Suggest actionable next steps */
export const suggestActionsSchema = z.object({
  analysisContext: z.string().describe('Summary of the data analysis performed and key findings'),
});

// ============================================
// Smart Retrieval Tools (Phase 5B)
// ============================================

/** Filter specification schema */
const filterSpecSchema = z.object({
  column: z.string().describe('Column name or letter'),
  operator: z.enum(['eq', 'neq', 'gt', 'lt', 'gte', 'lte', 'contains', 'startsWith', 'between', 'in']),
  value: z.unknown().describe('Value to compare against'),
  value2: z.unknown().optional().describe('Second value for "between" operator'),
});

/** Get sheet profile */
export const getProfileSchema = z.object({
  sheet: z.string().optional().describe('Sheet name (defaults to active sheet)'),
});

/** Select filtered rows */
export const selectRowsSchema = z.object({
  sheet: z.string().optional().describe('Sheet name (defaults to active sheet)'),
  columns: z.array(z.string()).describe('Column names or letters to return'),
  filters: z.array(filterSpecSchema).optional().describe('Filter conditions'),
  orderBy: z.object({
    column: z.string(),
    direction: z.enum(['asc', 'desc']),
  }).optional().describe('Sort order'),
  limit: z.number().max(500).default(50).describe('Max rows to return'),
  offset: z.number().default(0).describe('Rows to skip'),
});

/** Group and aggregate */
export const groupAggregateSchema = z.object({
  sheet: z.string().optional().describe('Sheet name (defaults to active sheet)'),
  groupBy: z.array(z.string()).describe('Columns to group by'),
  metrics: z.array(z.object({
    column: z.string(),
    aggregation: z.enum(['sum', 'avg', 'min', 'max', 'count', 'countUnique']),
  })).describe('Aggregations to compute'),
  filters: z.array(filterSpecSchema).optional().describe('Pre-aggregation filters'),
  limit: z.number().max(1000).default(100).describe('Max groups to return'),
});

/** Find outliers */
export const findOutliersSchema = z.object({
  sheet: z.string().optional().describe('Sheet name (defaults to active sheet)'),
  column: z.string().describe('Numeric column to analyze'),
  method: z.enum(['zscore', 'iqr', 'percentile']).describe('Detection method'),
  threshold: z.number().default(2).describe('Threshold (z-score std devs, or percentile)'),
  limit: z.number().max(100).default(20).describe('Max outliers to return'),
});

/** Search for values */
export const searchValuesSchema = z.object({
  query: z.string().describe('Search query'),
  columns: z.array(z.string()).optional().describe('Columns to search (all if not specified)'),
  fuzzy: z.boolean().default(false).describe('Enable fuzzy matching'),
  limit: z.number().max(100).default(20).describe('Max results'),
});

// ============================================
// Type exports - re-export from shared for consistency
// ============================================

// The Zod schemas here validate incoming data, but the canonical
// type definitions live in @cellix/shared for use across the codebase.
export type {
  WriteRangeParams,
  SetFormulaParams,
  FormatRangeParams,
  CreateSheetParams,
  AddTableParams,
  HighlightCellsParams,
  ReadRangeParams,
  GetSelectionParams,
  GetSheetNamesParams,
  GetContextParams,
  ExplainKpiParams,
  SuggestActionsParams,
  FilterSpec,
  GetProfileParams,
  SelectRowsParams,
  GroupAggregateParams,
  FindOutliersParams,
  SearchValuesParams,
} from '@cellix/shared';
