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
/**
 * Normalizes a range address so the start cell is top-left and end cell is bottom-right.
 * Fixes backwards ranges like "Z1140:Z1000" → "Z1000:Z1140".
 * Single-cell addresses and non-range addresses are returned unchanged.
 */
export function normalizeAddress(address: string): string {
  // Extract sheet prefix if present (e.g., "Sheet1!")
  const sheetSep = address.indexOf('!');
  const sheetPrefix = sheetSep >= 0 ? address.substring(0, sheetSep + 1) : '';
  const cellRef = sheetSep >= 0 ? address.substring(sheetSep + 1) : address;

  if (!cellRef.includes(':')) return address; // Single cell, nothing to normalize

  const [start, end] = cellRef.split(':');
  if (!start || !end) return address;

  const startCol = columnToNumber(start.match(/[A-Za-z]+/)?.[0] || 'A');
  const startRow = parseInt(start.match(/[0-9]+/)?.[0] || '1', 10);
  const endCol = columnToNumber(end.match(/[A-Za-z]+/)?.[0] || 'A');
  const endRow = parseInt(end.match(/[0-9]+/)?.[0] || '1', 10);

  const minCol = Math.min(startCol, endCol);
  const maxCol = Math.max(startCol, endCol);
  const minRow = Math.min(startRow, endRow);
  const maxRow = Math.max(startRow, endRow);

  // Only rewrite if something was out of order
  if (startCol === minCol && startRow === minRow && endCol === maxCol && endRow === maxRow) {
    return address;
  }

  return `${sheetPrefix}${numberToColumn(minCol)}${minRow}:${numberToColumn(maxCol)}${maxRow}`;
}

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
