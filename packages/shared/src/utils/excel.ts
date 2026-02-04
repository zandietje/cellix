/**
 * Excel utility functions.
 * Shared between frontend and backend.
 */

/**
 * Converts column letter(s) to number (A=1, B=2, AA=27, etc.)
 */
export function columnToNumber(col: string): number {
  let result = 0;
  const upper = col.toUpperCase();
  for (let i = 0; i < upper.length; i++) {
    result = result * 26 + (upper.charCodeAt(i) - 64);
  }
  return result;
}

/**
 * Converts column number to letter (1=A, 2=B, 27=AA, etc.)
 */
export function numberToColumn(num: number): string {
  let result = '';
  while (num > 0) {
    const remainder = (num - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    num = Math.floor((num - 1) / 26);
  }
  return result || 'A';
}

/**
 * Parses a cell reference to extract column and row.
 * E.g., "A1" -> { col: "A", row: 1 }, "Sheet1!B2" -> { col: "B", row: 2 }
 */
export function parseCellReference(ref: string): { col: string; row: number } | null {
  // Remove sheet reference if present
  const cellRef = ref.includes('!') ? ref.split('!')[1] : ref;

  // Handle range - just take the start cell
  const startCell = cellRef.includes(':') ? cellRef.split(':')[0] : cellRef;

  const col = startCell.match(/[A-Za-z]+/)?.[0];
  const row = parseInt(startCell.match(/[0-9]+/)?.[0] || '', 10);

  if (!col || isNaN(row)) return null;

  return { col, row };
}
