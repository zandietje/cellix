/**
 * Tool call validation layer.
 * Validates parameters before preview generation and execution.
 */

import {
  READ_TOOLS,
  ANALYTICS_TOOLS,
  isWriteTool,
} from '@cellix/shared';
import type { ToolCall } from '@cellix/shared';
import type {
  WriteRangeParams,
  SetFormulaParams,
  FormatRangeParams,
  CreateSheetParams,
  AddTableParams,
  HighlightCellsParams,
} from '@cellix/shared';
import {
  isValidAddress,
  isValidSheetName,
  isFormulaAllowed,
  validateCellCount,
} from '../excel/validation';
import type { ValidationResult, ValidationError } from './types';

/**
 * Validates a tool call and returns validation result.
 */
export function validateToolCall(toolCall: ToolCall): ValidationResult {
  const errors: ValidationError[] = [];

  // Check if tool is in whitelist
  if (!isWriteTool(toolCall.name)) {
    // If not a write tool, it might be a read or analytics tool which doesn't need validation
    // But unknown tools should error
    const isReadTool = READ_TOOLS.includes(toolCall.name as (typeof READ_TOOLS)[number]);
    const isAnalyticsTool = ANALYTICS_TOOLS.includes(toolCall.name as (typeof ANALYTICS_TOOLS)[number]);

    if (!isReadTool && !isAnalyticsTool) {
      errors.push({
        field: 'name',
        message: `Unknown tool: ${toolCall.name}`,
        code: 'UNKNOWN_TOOL',
      });
    }
    return { valid: errors.length === 0, errors };
  }

  // Dispatch to specific validator based on tool name
  switch (toolCall.name) {
    case 'write_range':
      return validateWriteRange(toolCall.parameters as unknown as WriteRangeParams);
    case 'set_formula':
      return validateSetFormula(toolCall.parameters as unknown as SetFormulaParams);
    case 'format_range':
      return validateFormatRange(toolCall.parameters as unknown as FormatRangeParams);
    case 'create_sheet':
      return validateCreateSheet(toolCall.parameters as unknown as CreateSheetParams);
    case 'add_table':
      return validateAddTable(toolCall.parameters as unknown as AddTableParams);
    case 'highlight_cells':
      return validateHighlightCells(toolCall.parameters as unknown as HighlightCellsParams);
    default:
      return { valid: true, errors: [] };
  }
}

/**
 * Validates write_range parameters.
 */
export function validateWriteRange(params: WriteRangeParams): ValidationResult {
  const errors: ValidationError[] = [];

  // Check required fields
  if (!params.address) {
    errors.push({
      field: 'address',
      message: 'Address is required',
      code: 'MISSING_PARAMETER',
    });
  } else if (!isValidAddress(params.address)) {
    errors.push({
      field: 'address',
      message: `Invalid Excel address: ${params.address}`,
      code: 'INVALID_ADDRESS',
    });
  }

  if (!params.values || !Array.isArray(params.values)) {
    errors.push({
      field: 'values',
      message: 'Values must be a 2D array',
      code: 'TYPE_ERROR',
    });
  } else if (params.values.length === 0) {
    errors.push({
      field: 'values',
      message: 'Values array cannot be empty',
      code: 'TYPE_ERROR',
    });
  } else {
    // Validate cell count
    const countResult = validateCellCount(params.address, params.values);
    if (!countResult.valid) {
      errors.push({
        field: 'values',
        message: countResult.error || 'Cell count exceeds limit',
        code: 'SIZE_LIMIT_EXCEEDED',
      });
    }
  }

  if (!params.reason) {
    errors.push({
      field: 'reason',
      message: 'Reason is required for write operations',
      code: 'MISSING_PARAMETER',
    });
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates set_formula parameters.
 */
export function validateSetFormula(params: SetFormulaParams): ValidationResult {
  const errors: ValidationError[] = [];

  // Check required fields
  if (!params.address) {
    errors.push({
      field: 'address',
      message: 'Address is required',
      code: 'MISSING_PARAMETER',
    });
  } else if (!isValidAddress(params.address)) {
    errors.push({
      field: 'address',
      message: `Invalid Excel address: ${params.address}`,
      code: 'INVALID_ADDRESS',
    });
  }

  if (!params.formula) {
    errors.push({
      field: 'formula',
      message: 'Formula is required',
      code: 'MISSING_PARAMETER',
    });
  } else {
    // Validate formula safety
    const formulaCheck = isFormulaAllowed(params.formula);
    if (!formulaCheck.allowed) {
      errors.push({
        field: 'formula',
        message: formulaCheck.reason || 'Formula is not allowed',
        code: params.formula.startsWith('=') ? 'UNSAFE_FORMULA' : 'INVALID_FORMULA',
      });
    }
  }

  if (!params.reason) {
    errors.push({
      field: 'reason',
      message: 'Reason is required for write operations',
      code: 'MISSING_PARAMETER',
    });
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates format_range parameters.
 */
export function validateFormatRange(params: FormatRangeParams): ValidationResult {
  const errors: ValidationError[] = [];

  if (!params.address) {
    errors.push({
      field: 'address',
      message: 'Address is required',
      code: 'MISSING_PARAMETER',
    });
  } else if (!isValidAddress(params.address)) {
    errors.push({
      field: 'address',
      message: `Invalid Excel address: ${params.address}`,
      code: 'INVALID_ADDRESS',
    });
  }

  if (!params.style || typeof params.style !== 'object') {
    errors.push({
      field: 'style',
      message: 'Style object is required',
      code: 'MISSING_PARAMETER',
    });
  }

  if (!params.reason) {
    errors.push({
      field: 'reason',
      message: 'Reason is required for write operations',
      code: 'MISSING_PARAMETER',
    });
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates create_sheet parameters.
 */
export function validateCreateSheet(params: CreateSheetParams): ValidationResult {
  const errors: ValidationError[] = [];

  if (!params.name) {
    errors.push({
      field: 'name',
      message: 'Sheet name is required',
      code: 'MISSING_PARAMETER',
    });
  } else {
    const nameCheck = isValidSheetName(params.name);
    if (!nameCheck.valid) {
      errors.push({
        field: 'name',
        message: nameCheck.error || 'Invalid sheet name',
        code: 'INVALID_SHEET_NAME',
      });
    }
  }

  if (!params.reason) {
    errors.push({
      field: 'reason',
      message: 'Reason is required for write operations',
      code: 'MISSING_PARAMETER',
    });
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates add_table parameters.
 */
export function validateAddTable(params: AddTableParams): ValidationResult {
  const errors: ValidationError[] = [];

  if (!params.address) {
    errors.push({
      field: 'address',
      message: 'Address is required',
      code: 'MISSING_PARAMETER',
    });
  } else if (!isValidAddress(params.address)) {
    errors.push({
      field: 'address',
      message: `Invalid Excel address: ${params.address}`,
      code: 'INVALID_ADDRESS',
    });
  }

  if (!params.name) {
    errors.push({
      field: 'name',
      message: 'Table name is required',
      code: 'MISSING_PARAMETER',
    });
  }

  if (!params.reason) {
    errors.push({
      field: 'reason',
      message: 'Reason is required for write operations',
      code: 'MISSING_PARAMETER',
    });
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates highlight_cells parameters.
 */
export function validateHighlightCells(params: HighlightCellsParams): ValidationResult {
  const errors: ValidationError[] = [];

  if (!params.address) {
    errors.push({
      field: 'address',
      message: 'Address is required',
      code: 'MISSING_PARAMETER',
    });
  } else if (!isValidAddress(params.address)) {
    errors.push({
      field: 'address',
      message: `Invalid Excel address: ${params.address}`,
      code: 'INVALID_ADDRESS',
    });
  }

  if (!params.color) {
    errors.push({
      field: 'color',
      message: 'Color is required',
      code: 'MISSING_PARAMETER',
    });
  }

  if (!params.reason) {
    errors.push({
      field: 'reason',
      message: 'Reason is required for write operations',
      code: 'MISSING_PARAMETER',
    });
  }

  return { valid: errors.length === 0, errors };
}
