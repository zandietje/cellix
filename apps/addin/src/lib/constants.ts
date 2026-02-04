/**
 * Safety limits and configuration constants for Cellix Excel operations.
 * These limits are non-negotiable per CLAUDE.md safety requirements.
 */

export const SAFETY_LIMITS = {
  /** Maximum cells per write operation (hard limit) */
  MAX_CELLS_PER_WRITE: 500,
  /** Cell count threshold requiring confirmation dialog */
  CONFIRM_THRESHOLD_CELLS: 50,
  /** Maximum rows to sample for AI context */
  MAX_CONTEXT_ROWS: 50,
  /** Maximum columns to sample for AI context */
  MAX_CONTEXT_COLS: 20,
  /** Maximum sheet name length (Excel limit) */
  MAX_SHEET_NAME_LENGTH: 31,
  /** Forbidden characters in sheet names */
  FORBIDDEN_SHEET_CHARS: /[[\]:*?/\\]/,
  /** Maximum formula length */
  MAX_FORMULA_LENGTH: 1000,
} as const;

export const EXCEL_ERRORS = {
  RANGE_NOT_FOUND: 'The specified range was not found',
  INVALID_ADDRESS: 'Invalid Excel address format',
  CELL_LIMIT_EXCEEDED: 'Operation exceeds maximum cell limit',
  SHEET_NAME_INVALID: 'Invalid sheet name',
  FORMULA_UNSAFE: 'Formula contains restricted elements',
  OFFICE_NOT_READY: 'Excel is not ready. Please try again.',
  EMPTY_SHEET: 'The sheet appears to be empty',
} as const;
