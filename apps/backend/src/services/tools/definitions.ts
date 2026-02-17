/**
 * Tool definitions in OpenAI format.
 * Converts Zod schemas to OpenAI function calling format.
 */

import { zodToJsonSchema } from 'zod-to-json-schema';
import type { ToolDefinition } from '../ai/types.js';
import type { ZodObject, ZodRawShape } from 'zod';
import { WRITE_TOOLS } from '@cellix/shared';
import * as schemas from './schemas.js';

/**
 * Create an OpenAI tool definition from a Zod schema.
 */
function createToolDef<T extends ZodRawShape>(
  name: string,
  description: string,
  schema: ZodObject<T>
): ToolDefinition {
  const jsonSchema = zodToJsonSchema(schema, { target: 'openAi' });

  return {
    type: 'function',
    function: {
      name,
      description,
      parameters: jsonSchema as Record<string, unknown>,
    },
  };
}

/**
 * All available tool definitions for the AI.
 */
export const TOOL_DEFINITIONS: ToolDefinition[] = [
  // Excel Write Tools (will show preview in Phase 4)
  createToolDef(
    'write_range',
    'Write values to a range of cells in Excel. A preview will be shown to the user before execution.',
    schemas.writeRangeSchema
  ),
  createToolDef(
    'set_formula',
    'Set an Excel formula in a cell or range. Use a range address (e.g., "Z2:Z1000") to fill the formula across multiple rows — relative references adjust automatically per row. A preview will be shown before execution.',
    schemas.setFormulaSchema
  ),
  createToolDef(
    'format_range',
    'Apply formatting (colors, bold, number format) to a range of cells. A preview will be shown before execution.',
    schemas.formatRangeSchema
  ),
  createToolDef(
    'create_sheet',
    'Create a new worksheet in the workbook.',
    schemas.createSheetSchema
  ),
  createToolDef(
    'add_table',
    'Convert a range to an Excel table with headers, enabling sorting and filtering.',
    schemas.addTableSchema
  ),
  createToolDef(
    'highlight_cells',
    'Highlight cells with a background color to draw attention to important data.',
    schemas.highlightCellsSchema
  ),

  // Excel Read Tools
  createToolDef(
    'read_range',
    'Read values from a specific Excel range. Use this when the user asks about specific cells or ranges.',
    schemas.readRangeSchema
  ),
  createToolDef(
    'get_selection',
    'Get the current user selection in Excel. Use this when the user refers to "my selection" or "selected cells".',
    schemas.getSelectionSchema
  ),
  createToolDef(
    'get_sheet_names',
    'List all worksheet names in the workbook. Use this when the user asks about available sheets.',
    schemas.getSheetNamesSchema
  ),
  createToolDef(
    'get_context',
    'Get comprehensive Excel context including selection, sheets, and tables. Use for general understanding of the workbook.',
    schemas.getContextSchema
  ),

  // Analytics Tools (no Excel modification)
  createToolDef(
    'explain_kpi',
    'Explain an ecommerce KPI or metric in detail, including calculation method, benchmarks, and interpretation guidelines.',
    schemas.explainKpiSchema
  ),
  createToolDef(
    'suggest_actions',
    'Provide actionable recommendations based on the data analysis performed.',
    schemas.suggestActionsSchema
  ),

  // Smart Retrieval Tools (Phase 5B)
  createToolDef(
    'get_profile',
    'Get metadata about a sheet including column names, types, statistics, and quality signals. Always call this first to understand the data structure before querying.',
    schemas.getProfileSchema
  ),
  createToolDef(
    'select_rows',
    'Fetch filtered rows from a sheet. Supports filtering by column values, sorting, and pagination. Returns actual data rows.',
    schemas.selectRowsSchema
  ),
  createToolDef(
    'group_aggregate',
    'Group data by columns and compute aggregations (sum, avg, min, max, count). Useful for summaries and totals.',
    schemas.groupAggregateSchema
  ),
  createToolDef(
    'find_outliers',
    'Detect anomalies in a numeric column using statistical methods (z-score, IQR, or percentile).',
    schemas.findOutliersSchema
  ),
  createToolDef(
    'search_values',
    'Search for specific values across columns. Supports exact and fuzzy matching.',
    schemas.searchValuesSchema
  ),
];

/**
 * Read-only tool definitions (no write tools).
 * Used when the AI needs to query data but should not modify Excel.
 */
export const READ_TOOL_DEFINITIONS: ToolDefinition[] = TOOL_DEFINITIONS.filter(
  (t) => !(WRITE_TOOLS as readonly string[]).includes(t.function.name)
);

