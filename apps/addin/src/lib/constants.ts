/**
 * Safety limits and configuration constants for Cellix Excel operations.
 * These limits are non-negotiable per CLAUDE.md safety requirements.
 */

export const SAFETY_LIMITS = {
  /** Maximum cells per write operation (hard limit) */
  MAX_CELLS_PER_WRITE: 500,
  /** Maximum cells for formula AutoFill (set_formula with range). Higher than
   *  MAX_CELLS_PER_WRITE because AutoFill only sends one formula to Excel,
   *  not a full data array. */
  MAX_FORMULA_FILL_CELLS: 10000,
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

/** Chat processing configuration */
export const CHAT_CONFIG = {
  /** Max tool execution iterations before stopping */
  MAX_CONTINUATION_ITERATIONS: 3,
  /** Max messages to include in history */
  MAX_HISTORY_MESSAGES: 20,
} as const;

/** API configuration */
export const API_CONFIG = {
  /** Max characters for tool results sent back to AI */
  MAX_TOOL_RESULT_SIZE: 8000,
  /** Max rows to keep when truncating large results */
  TRUNCATE_ROWS: 20,
} as const;

/** Debounce configuration (milliseconds) */
export const DEBOUNCE_CONFIG = {
  /** Selection change listener */
  SELECTION_CHANGE: 500,
} as const;
