/**
 * Display formatters shared across components.
 */

/** Convert snake_case tool name to display text */
export function formatToolName(name: string): string {
  return name.replace(/_/g, ' ');
}

/** Truncate string with ellipsis */
export function truncateString(str: string, maxLength: number): string {
  return str.length > maxLength ? str.substring(0, maxLength) + '...' : str;
}

/** Format parameter summary for a tool call */
export function getParamSummary(params: Record<string, unknown>): string {
  const parts: string[] = [];

  if (params.address) parts.push(`${params.address}`);

  if (typeof params.formula === 'string') {
    parts.push(`formula: ${truncateString(params.formula, 30)}`);
  }

  if (Array.isArray(params.values)) {
    const values = params.values as unknown[][];
    parts.push(`${values.length}x${values[0]?.length || 0} values`);
  }

  if (params.name) parts.push(`name: ${params.name}`);
  if (params.color) parts.push(`color: ${params.color}`);

  if (Array.isArray(params.columns)) {
    parts.push(`columns: ${(params.columns as string[]).join(', ')}`);
  }

  if (Array.isArray(params.groupBy)) {
    parts.push(`group by: ${(params.groupBy as string[]).join(', ')}`);
  }

  if (typeof params.column === 'string' && !params.columns) {
    parts.push(`column: ${params.column}`);
  }

  if (typeof params.query === 'string') parts.push(`query: "${params.query}"`);
  if (typeof params.sheet === 'string') parts.push(`sheet: ${params.sheet}`);
  if (typeof params.method === 'string') parts.push(`method: ${params.method}`);

  return parts.join(' | ') || 'No parameters';
}
