/**
 * Types for the tool execution engine.
 * Preview-first execution system - all write operations require user approval.
 */

import type { ToolCall, FormatOptions } from '@cellix/shared';

/** Error codes for validation failures */
export type ValidationErrorCode =
  | 'INVALID_ADDRESS'
  | 'SIZE_LIMIT_EXCEEDED'
  | 'INVALID_FORMULA'
  | 'UNSAFE_FORMULA'
  | 'TYPE_ERROR'
  | 'MISSING_PARAMETER'
  | 'INVALID_SHEET_NAME'
  | 'UNKNOWN_TOOL';

/** A validation error with details */
export interface ValidationError {
  /** The field that failed validation */
  field: string;
  /** Human-readable error message */
  message: string;
  /** Error code for programmatic handling */
  code: ValidationErrorCode;
}

/** Result of validating a tool call */
export interface ValidationResult {
  /** Whether the tool call is valid */
  valid: boolean;
  /** List of validation errors */
  errors: ValidationError[];
}

/** A single cell change with before/after values */
export interface CellChange {
  /** Cell address (e.g., "A1") */
  address: string;
  /** Current value in the cell (before change) */
  currentValue: unknown;
  /** New value to be written */
  newValue: unknown;
  /** True if cell has existing content that will be overwritten */
  isOverwrite: boolean;
}

/** Preview data for a pending tool call */
export interface PreviewData {
  /** The tool call being previewed */
  toolCall: ToolCall;
  /** Range that will be affected (A1 notation) */
  affectedRange: string;
  /** Total number of cells affected */
  cellCount: number;
  /** List of individual cell changes */
  changes: CellChange[];
  /** Warning messages for the user */
  warnings: string[];
  /** Whether user must confirm (>50 cells) */
  requiresConfirmation: boolean;
  /** Validation result */
  validation: ValidationResult;
  /** Timestamp when preview was generated */
  generatedAt: number;
}

/** Result of executing a single tool call */
export interface ExecutionResult {
  /** Whether execution succeeded */
  success: boolean;
  /** ID of the tool call that was executed */
  toolCallId: string;
  /** Number of cells affected */
  cellsAffected: number;
  /** Time taken to execute in milliseconds */
  executionTimeMs: number;
  /** Error message if execution failed */
  error?: string;
  /** Additional result data from the operation */
  resultData?: Record<string, unknown>;
}

/** Entry in the audit log */
export interface AuditLogEntry {
  /** Unique ID for this log entry */
  id: string;
  /** Unix timestamp in milliseconds */
  timestamp: number;
  /** Name of the tool that was executed */
  toolName: string;
  /** Parameters passed to the tool */
  parameters: Record<string, unknown>;
  /** Result of the execution */
  result: 'success' | 'error' | 'cancelled';
  /** Error message if result is 'error' */
  errorMessage?: string;
  /** Number of cells affected */
  cellsAffected: number;
  /** Execution time in milliseconds */
  executionTimeMs: number;
}

// ============================================
// Tool Parameter Types
// ============================================

/** Parameters for write_range tool */
export interface WriteRangeParams {
  /** Target address in A1 notation */
  address: string;
  /** 2D array of values to write */
  values: unknown[][];
  /** Reason for the write (shown to user) */
  reason: string;
}

/** Parameters for set_formula tool */
export interface SetFormulaParams {
  /** Target cell address */
  address: string;
  /** Formula to set (must start with =) */
  formula: string;
  /** Reason for setting formula */
  reason: string;
}

/** Parameters for format_range tool */
export interface FormatRangeParams {
  /** Target range address */
  address: string;
  /** Formatting options to apply */
  style: FormatOptions;
  /** Reason for formatting */
  reason: string;
}

/** Parameters for create_sheet tool */
export interface CreateSheetParams {
  /** Name for the new sheet */
  name: string;
  /** Reason for creating sheet */
  reason: string;
}

/** Parameters for add_table tool */
export interface AddTableParams {
  /** Range address for the table */
  address: string;
  /** Name for the table */
  name: string;
  /** Whether first row contains headers */
  hasHeaders: boolean;
  /** Reason for creating table */
  reason: string;
}

/** Parameters for highlight_cells tool */
export interface HighlightCellsParams {
  /** Target range address */
  address: string;
  /** Highlight color (hex or color name) */
  color: string;
  /** Reason for highlighting */
  reason: string;
}

/** Union of all tool parameter types */
export type ToolParams =
  | WriteRangeParams
  | SetFormulaParams
  | FormatRangeParams
  | CreateSheetParams
  | AddTableParams
  | HighlightCellsParams;

/** Names of tools that require preview before execution */
export const WRITE_TOOLS = [
  'write_range',
  'set_formula',
  'format_range',
  'create_sheet',
  'add_table',
  'highlight_cells',
] as const;

export type WriteToolName = (typeof WRITE_TOOLS)[number];

/** Check if a tool name requires preview */
export function isWriteTool(name: string): name is WriteToolName {
  return WRITE_TOOLS.includes(name as WriteToolName);
}
