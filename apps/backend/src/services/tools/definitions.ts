/**
 * Tool definitions in OpenAI format.
 * Converts Zod schemas to OpenAI function calling format.
 */

import { zodToJsonSchema } from 'zod-to-json-schema';
import type { ToolDefinition } from '../ai/types.js';
import type { ZodObject, ZodRawShape } from 'zod';
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
    'Set an Excel formula in a cell. Useful for calculations that should update automatically. A preview will be shown before execution.',
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
    'Read values from a specific range. Use when you need data from a range other than the current selection.',
    schemas.readRangeSchema
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
];

/**
 * Set of allowed tool names for validation.
 */
export const TOOL_WHITELIST = new Set(TOOL_DEFINITIONS.map((t) => t.function.name));

/**
 * Check if a tool name is allowed.
 */
export function isToolAllowed(name: string): boolean {
  return TOOL_WHITELIST.has(name);
}
