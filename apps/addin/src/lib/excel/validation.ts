/**
 * Validation utilities for Excel addresses, formulas, and operations.
 * Enforces safety constraints per CLAUDE.md requirements.
 */

import { columnToNumber } from '@cellix/shared';
import { SAFETY_LIMITS } from '../constants';

/**
 * Validates A1 notation address.
 * Valid formats: A1, B2:C10, Sheet1!A1:B10, 'Sheet Name'!A1
 */
export function isValidAddress(address: string): boolean {
  if (!address || address.trim().length === 0) return false;

  // Pattern: optional sheet reference + cell reference
  // Sheet reference: name! or 'name with spaces'!
  // Cell reference: A1 or A1:B2
  const pattern = /^('?[^'[\]:*?/\\]+'?!)?[A-Za-z]{1,3}[0-9]{1,7}(:[A-Za-z]{1,3}[0-9]{1,7})?$/;
  return pattern.test(address.trim());
}

/**
 * Validates a sheet name according to Excel rules.
 */
export function isValidSheetName(name: string): { valid: boolean; error?: string } {
  if (!name || name.trim().length === 0) {
    return { valid: false, error: 'Sheet name cannot be empty' };
  }

  if (name.length > SAFETY_LIMITS.MAX_SHEET_NAME_LENGTH) {
    return {
      valid: false,
      error: `Sheet name cannot exceed ${SAFETY_LIMITS.MAX_SHEET_NAME_LENGTH} characters`,
    };
  }

  if (SAFETY_LIMITS.FORBIDDEN_SHEET_CHARS.test(name)) {
    return { valid: false, error: 'Sheet name cannot contain [ ] : * ? / \\' };
  }

  return { valid: true };
}

/**
 * Checks if a formula is allowed (no external links, dangerous functions).
 */
export function isFormulaAllowed(formula: string): { allowed: boolean; reason?: string } {
  if (!formula.startsWith('=')) {
    return { allowed: false, reason: 'Formula must start with =' };
  }

  if (formula.length > SAFETY_LIMITS.MAX_FORMULA_LENGTH) {
    return {
      allowed: false,
      reason: `Formula exceeds ${SAFETY_LIMITS.MAX_FORMULA_LENGTH} character limit`,
    };
  }

  const upper = formula.toUpperCase();

  // Block external links
  if (/HTTPS?:\/\//i.test(formula)) {
    return { allowed: false, reason: 'External URLs are not allowed in formulas' };
  }

  // Block dangerous functions
  const dangerous = ['WEBSERVICE', 'CALL', 'REGISTER.ID', 'SQL.REQUEST', 'FILTERXML'];
  for (const fn of dangerous) {
    if (upper.includes(fn + '(')) {
      return { allowed: false, reason: `${fn} function is not allowed` };
    }
  }

  // Block external workbook references [workbook.xlsx]
  if (/\[.+\.(xlsx?|xlsm|xlsb)\]/i.test(formula)) {
    return { allowed: false, reason: 'External workbook references are not allowed' };
  }

  return { allowed: true };
}

/**
 * Calculates approximate cell count from address.
 * Returns -1 if unable to parse.
 */
export function calculateCellCount(address: string): number {
  // Remove sheet reference
  const cellRef = address.includes('!') ? address.split('!')[1] : address;

  if (!cellRef.includes(':')) {
    return 1; // Single cell
  }

  const [start, end] = cellRef.split(':');

  const startCol = columnToNumber(start.match(/[A-Za-z]+/)?.[0] || 'A');
  const startRow = parseInt(start.match(/[0-9]+/)?.[0] || '1', 10);
  const endCol = columnToNumber(end.match(/[A-Za-z]+/)?.[0] || 'A');
  const endRow = parseInt(end.match(/[0-9]+/)?.[0] || '1', 10);

  const cols = Math.abs(endCol - startCol) + 1;
  const rows = Math.abs(endRow - startRow) + 1;

  return cols * rows;
}

/**
 * Validates cell count against safety limit.
 */
export function validateCellCount(
  address: string,
  values?: unknown[][]
): { valid: boolean; cellCount: number; error?: string } {
  const cellCount = values
    ? values.length * (values[0]?.length ?? 0)
    : calculateCellCount(address);

  if (cellCount > SAFETY_LIMITS.MAX_CELLS_PER_WRITE) {
    return {
      valid: false,
      cellCount,
      error: `Operation affects ${cellCount} cells. Maximum allowed: ${SAFETY_LIMITS.MAX_CELLS_PER_WRITE}`,
    };
  }

  return { valid: true, cellCount };
}

/**
 * Checks if operation requires user confirmation (>50 cells).
 */
export function requiresConfirmation(cellCount: number): boolean {
  return cellCount > SAFETY_LIMITS.CONFIRM_THRESHOLD_CELLS;
}
