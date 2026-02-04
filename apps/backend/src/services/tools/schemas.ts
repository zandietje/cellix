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
  address: z.string().describe('Range to read in A1 notation'),
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
  ExplainKpiParams,
  SuggestActionsParams,
} from '@cellix/shared';
