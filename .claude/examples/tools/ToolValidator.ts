/**
 * Tool Validator - Example Implementation
 *
 * Validates tool calls before execution.
 * Enforces whitelist, schemas, and safety limits.
 */

import { TOOL_SCHEMAS, ToolName } from './ToolSchema';

// =============================================================================
// Constants
// =============================================================================

/**
 * Whitelist of allowed tools.
 * Only these tools can be executed.
 */
export const TOOL_WHITELIST: readonly ToolName[] = [
  // Write tools (require preview)
  'write_range',
  'set_formula',
  'format_range',

  // Read tools (no preview)
  'read_range',

  // Analytics tools (no Excel modification)
  'explain_kpi',
] as const;

/**
 * Tools that require preview before execution.
 */
export const TOOLS_REQUIRING_PREVIEW: readonly ToolName[] = [
  'write_range',
  'set_formula',
  'format_range',
] as const;

/**
 * Safety limits.
 */
export const SAFETY_LIMITS = {
  MAX_CELLS_PER_WRITE: 500,
  CONFIRM_THRESHOLD_CELLS: 50,
  MAX_FORMULA_LENGTH: 1000,
} as const;

// =============================================================================
// Types
// =============================================================================

export interface ToolCall {
  name: string;
  parameters: Record<string, unknown>;
}

export interface ValidationSuccess {
  valid: true;
  toolName: ToolName;
  parameters: unknown;
  requiresPreview: boolean;
  cellCount?: number;
}

export interface ValidationFailure {
  valid: false;
  error: string;
  code: 'UNKNOWN_TOOL' | 'INVALID_PARAMS' | 'SAFETY_LIMIT' | 'UNSAFE_FORMULA';
}

export type ValidationResult = ValidationSuccess | ValidationFailure;

// =============================================================================
// Validation Functions
// =============================================================================

/**
 * Validate a tool call.
 * Checks whitelist, schema, and safety limits.
 */
export function validateToolCall(toolCall: ToolCall): ValidationResult {
  const { name, parameters } = toolCall;

  // 1. Check whitelist
  if (!isToolAllowed(name)) {
    return {
      valid: false,
      error: `Unknown or disallowed tool: "${name}". Allowed tools: ${TOOL_WHITELIST.join(', ')}`,
      code: 'UNKNOWN_TOOL',
    };
  }

  const toolName = name as ToolName;

  // 2. Get schema and validate
  const schema = TOOL_SCHEMAS[toolName];
  const parseResult = schema.zod.safeParse(parameters);

  if (!parseResult.success) {
    const issues = parseResult.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');

    return {
      valid: false,
      error: `Invalid parameters for ${name}: ${issues}`,
      code: 'INVALID_PARAMS',
    };
  }

  // 3. Check safety limits for write tools
  if (TOOLS_REQUIRING_PREVIEW.includes(toolName)) {
    const safetyCheck = checkSafetyLimits(toolName, parseResult.data);
    if (!safetyCheck.valid) {
      return safetyCheck;
    }
  }

  // 4. Calculate cell count for preview info
  const cellCount = calculateCellCount(toolName, parseResult.data);

  return {
    valid: true,
    toolName,
    parameters: parseResult.data,
    requiresPreview: TOOLS_REQUIRING_PREVIEW.includes(toolName),
    cellCount,
  };
}

/**
 * Check if a tool is in the whitelist.
 */
function isToolAllowed(name: string): name is ToolName {
  return TOOL_WHITELIST.includes(name as ToolName);
}

/**
 * Check safety limits for write operations.
 */
function checkSafetyLimits(
  toolName: ToolName,
  params: unknown
): ValidationResult {
  const p = params as Record<string, unknown>;

  // Check cell count for write operations
  if (toolName === 'write_range') {
    const values = p.values as unknown[][];
    const cellCount = values.length * (values[0]?.length ?? 0);

    if (cellCount > SAFETY_LIMITS.MAX_CELLS_PER_WRITE) {
      return {
        valid: false,
        error: `Operation would affect ${cellCount} cells. Maximum allowed is ${SAFETY_LIMITS.MAX_CELLS_PER_WRITE} cells per operation.`,
        code: 'SAFETY_LIMIT',
      };
    }
  }

  // Check formula length
  if (toolName === 'set_formula') {
    const formula = p.formula as string;

    if (formula.length > SAFETY_LIMITS.MAX_FORMULA_LENGTH) {
      return {
        valid: false,
        error: `Formula is too long (${formula.length} chars). Maximum allowed is ${SAFETY_LIMITS.MAX_FORMULA_LENGTH} characters.`,
        code: 'SAFETY_LIMIT',
      };
    }
  }

  return { valid: true } as ValidationSuccess;
}

/**
 * Calculate the number of cells affected by an operation.
 */
function calculateCellCount(toolName: ToolName, params: unknown): number {
  const p = params as Record<string, unknown>;

  switch (toolName) {
    case 'write_range': {
      const values = p.values as unknown[][];
      return values.length * (values[0]?.length ?? 0);
    }
    case 'set_formula':
      return 1;
    case 'format_range':
      return calculateCellCountFromAddress(p.address as string);
    default:
      return 0;
  }
}

/**
 * Calculate cell count from an A1 notation address.
 */
function calculateCellCountFromAddress(address: string): number {
  // Remove sheet name if present
  const rangeOnly = address.includes('!') ? address.split('!')[1] : address;

  // If single cell
  if (!rangeOnly.includes(':')) {
    return 1;
  }

  // Parse range
  const [start, end] = rangeOnly.split(':');
  const startCol = start.match(/[A-Z]+/)?.[0] ?? 'A';
  const startRow = parseInt(start.match(/[0-9]+/)?.[0] ?? '1', 10);
  const endCol = end.match(/[A-Z]+/)?.[0] ?? 'A';
  const endRow = parseInt(end.match(/[0-9]+/)?.[0] ?? '1', 10);

  const cols = colToIndex(endCol) - colToIndex(startCol) + 1;
  const rows = endRow - startRow + 1;

  return cols * rows;
}

/**
 * Convert column letter to index (A=1, B=2, ..., Z=26, AA=27, etc.)
 */
function colToIndex(col: string): number {
  let index = 0;
  for (let i = 0; i < col.length; i++) {
    index = index * 26 + (col.charCodeAt(i) - 64);
  }
  return index;
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Check if a tool requires preview.
 */
export function toolRequiresPreview(name: ToolName): boolean {
  return TOOLS_REQUIRING_PREVIEW.includes(name);
}

/**
 * Check if operation needs explicit confirmation (> threshold cells).
 */
export function needsConfirmation(cellCount: number): boolean {
  return cellCount > SAFETY_LIMITS.CONFIRM_THRESHOLD_CELLS;
}

/**
 * Get all JSON schemas for OpenAI function calling.
 */
export function getJsonSchemas(): unknown[] {
  return TOOL_WHITELIST.map((name) => TOOL_SCHEMAS[name].json);
}
