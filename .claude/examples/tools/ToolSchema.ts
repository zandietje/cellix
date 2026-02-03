/**
 * Tool Schema - Example Implementation
 *
 * Defines tool schemas for both OpenAI function calling (JSON Schema)
 * and runtime validation (Zod).
 */

import { z } from 'zod';

// =============================================================================
// Common Schemas
// =============================================================================

/**
 * Excel address validation (A1 notation).
 * Supports: A1, A1:B10, Sheet1!A1, 'Sheet Name'!A1:B10
 */
const addressSchema = z
  .string()
  .regex(
    /^('?[\w\s]+'?!)?[A-Z]+[0-9]+(:[A-Z]+[0-9]+)?$/,
    'Invalid Excel address format. Use A1 notation (e.g., A1, A1:C10, Sheet1!A1)'
  );

/**
 * Single cell address (no range).
 */
const cellAddressSchema = z
  .string()
  .regex(
    /^('?[\w\s]+'?!)?[A-Z]+[0-9]+$/,
    'Invalid cell address. Use single cell notation (e.g., A1, Sheet1!B2)'
  );

/**
 * Cell value types allowed in Excel.
 */
const cellValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);

/**
 * 2D array of cell values.
 */
const valuesArraySchema = z
  .array(z.array(cellValueSchema))
  .min(1, 'Values array cannot be empty')
  .refine((arr) => arr[0].length > 0, 'Values array cannot have empty rows');

/**
 * Reason field (required for write operations).
 */
const reasonSchema = z
  .string()
  .min(1, 'Reason is required for write operations');

/**
 * Hex color validation.
 */
const hexColorSchema = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, 'Color must be hex format (e.g., #FFFF00)');

// =============================================================================
// Write Tool Schemas
// =============================================================================

/**
 * write_range - Write values to a range
 */
export const writeRangeSchema = z.object({
  address: addressSchema,
  values: valuesArraySchema,
  reason: reasonSchema,
});

export type WriteRangeParams = z.infer<typeof writeRangeSchema>;

export const writeRangeJsonSchema = {
  name: 'write_range',
  description:
    'Write a 2D array of values to an Excel range. Use for inserting data, results, or calculations. The values array dimensions must match the range dimensions.',
  parameters: {
    type: 'object',
    properties: {
      address: {
        type: 'string',
        description:
          'Excel range in A1 notation (e.g., "A1:C10", "Sheet1!B2:D5")',
      },
      values: {
        type: 'array',
        items: {
          type: 'array',
          items: { type: ['string', 'number', 'boolean', 'null'] },
        },
        description: '2D array of values matching the range dimensions',
      },
      reason: {
        type: 'string',
        description: 'Explanation of why this data is being written',
      },
    },
    required: ['address', 'values', 'reason'],
  },
};

/**
 * set_formula - Set formula in a cell
 */
export const setFormulaSchema = z
  .object({
    address: cellAddressSchema,
    formula: z
      .string()
      .startsWith('=', 'Formula must start with =')
      .min(2, 'Formula cannot be empty'),
    reason: reasonSchema,
  })
  .refine(
    (data) => !data.formula.toLowerCase().includes('http'),
    { message: 'External links are not allowed in formulas' }
  )
  .refine(
    (data) => !data.formula.toLowerCase().includes('webservice'),
    { message: 'WEBSERVICE function is not allowed' }
  )
  .refine(
    (data) => !/\[.+\]/.test(data.formula),
    { message: 'External workbook references are not allowed' }
  );

export type SetFormulaParams = z.infer<typeof setFormulaSchema>;

export const setFormulaJsonSchema = {
  name: 'set_formula',
  description:
    'Set an Excel formula in a single cell. Use for calculations like SUM, AVERAGE, VLOOKUP, SUMIF, etc.',
  parameters: {
    type: 'object',
    properties: {
      address: {
        type: 'string',
        description: 'Single cell address (e.g., "A1", "Sheet1!B2")',
      },
      formula: {
        type: 'string',
        description:
          'Excel formula starting with = (e.g., "=SUM(A1:A10)", "=VLOOKUP(A1,B:C,2,FALSE)")',
      },
      reason: {
        type: 'string',
        description: 'Explanation of what this formula calculates',
      },
    },
    required: ['address', 'formula', 'reason'],
  },
};

/**
 * format_range - Apply formatting to a range
 */
export const formatRangeSchema = z.object({
  address: addressSchema,
  style: z.object({
    fillColor: hexColorSchema.optional(),
    fontColor: hexColorSchema.optional(),
    bold: z.boolean().optional(),
    italic: z.boolean().optional(),
    numberFormat: z.string().optional(),
    horizontalAlignment: z.enum(['left', 'center', 'right']).optional(),
  }),
  reason: reasonSchema,
});

export type FormatRangeParams = z.infer<typeof formatRangeSchema>;

export const formatRangeJsonSchema = {
  name: 'format_range',
  description:
    'Apply formatting to an Excel range including colors, fonts, and number formats.',
  parameters: {
    type: 'object',
    properties: {
      address: {
        type: 'string',
        description: 'Excel range in A1 notation',
      },
      style: {
        type: 'object',
        properties: {
          fillColor: {
            type: 'string',
            description: 'Background color in hex format (e.g., "#FFFF00")',
          },
          fontColor: {
            type: 'string',
            description: 'Font color in hex format',
          },
          bold: { type: 'boolean', description: 'Make text bold' },
          italic: { type: 'boolean', description: 'Make text italic' },
          numberFormat: {
            type: 'string',
            description:
              'Excel number format (e.g., "#,##0.00", "0%", "yyyy-mm-dd")',
          },
          horizontalAlignment: {
            type: 'string',
            enum: ['left', 'center', 'right'],
            description: 'Horizontal text alignment',
          },
        },
      },
      reason: {
        type: 'string',
        description: 'Why this formatting is being applied',
      },
    },
    required: ['address', 'style', 'reason'],
  },
};

/**
 * create_sheet - Create a new worksheet
 */
export const createSheetSchema = z.object({
  name: z
    .string()
    .min(1, 'Sheet name cannot be empty')
    .max(31, 'Sheet name cannot exceed 31 characters')
    .refine(
      (name) => !/[\[\]:*?\/\\]/.test(name),
      { message: 'Sheet name cannot contain []:*?/\\' }
    ),
  reason: reasonSchema,
});

export type CreateSheetParams = z.infer<typeof createSheetSchema>;

// =============================================================================
// Read Tool Schemas
// =============================================================================

/**
 * read_range - Read values from a range
 */
export const readRangeSchema = z.object({
  address: addressSchema,
});

export type ReadRangeParams = z.infer<typeof readRangeSchema>;

export const readRangeJsonSchema = {
  name: 'read_range',
  description: 'Read values from an Excel range. Returns a 2D array of values.',
  parameters: {
    type: 'object',
    properties: {
      address: {
        type: 'string',
        description: 'Excel range in A1 notation',
      },
    },
    required: ['address'],
  },
};

// =============================================================================
// Analytics Tool Schemas (no Excel modification)
// =============================================================================

/**
 * explain_kpi - Explain a KPI
 */
export const explainKpiSchema = z.object({
  kpi_name: z.string().min(1, 'KPI name is required'),
  context: z.string().optional(),
});

export type ExplainKpiParams = z.infer<typeof explainKpiSchema>;

export const explainKpiJsonSchema = {
  name: 'explain_kpi',
  description:
    'Explain what a KPI means and how to interpret it in ecommerce context.',
  parameters: {
    type: 'object',
    properties: {
      kpi_name: {
        type: 'string',
        description: 'Name of the KPI (e.g., "ROAS", "CTR", "CVR")',
      },
      context: {
        type: 'string',
        description: 'Additional context about where this KPI appears',
      },
    },
    required: ['kpi_name'],
  },
};

// =============================================================================
// Tool Registry
// =============================================================================

export const TOOL_SCHEMAS = {
  write_range: { zod: writeRangeSchema, json: writeRangeJsonSchema },
  set_formula: { zod: setFormulaSchema, json: setFormulaJsonSchema },
  format_range: { zod: formatRangeSchema, json: formatRangeJsonSchema },
  read_range: { zod: readRangeSchema, json: readRangeJsonSchema },
  explain_kpi: { zod: explainKpiSchema, json: explainKpiJsonSchema },
} as const;

export type ToolName = keyof typeof TOOL_SCHEMAS;
