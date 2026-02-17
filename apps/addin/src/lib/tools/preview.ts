/**
 * Preview generator for tool calls.
 * Builds preview data by reading current cell values and computing changes.
 */

import { columnToNumber, numberToColumn, isWriteTool, normalizeAddress } from '@cellix/shared';
import type { ToolCall } from '@cellix/shared';
import type {
  WriteRangeParams,
  SetFormulaParams,
  FormatRangeParams,
  AddTableParams,
  HighlightCellsParams,
} from '@cellix/shared';
import { getParams } from './types';
import { readRange } from '../excel/reader';
import { calculateCellCount, requiresConfirmation } from '../excel/validation';
import { SAFETY_LIMITS } from '../constants';
import { validateToolCall } from './validator';
import type { PreviewData, CellChange } from './types';

/**
 * Generates preview data for a tool call.
 * Reads current cell values to compute the diff.
 */
export async function generatePreview(toolCall: ToolCall): Promise<PreviewData> {
  const validation = validateToolCall(toolCall);
  const warnings: string[] = validation.errors.map((e) => e.message);

  // If not a write tool, return minimal preview
  if (!isWriteTool(toolCall.name)) {
    return {
      toolCall,
      affectedRange: '',
      cellCount: 0,
      changes: [],
      warnings: ['This tool does not modify Excel data'],
      requiresConfirmation: false,
      validation,
      generatedAt: Date.now(),
    };
  }

  // Normalize backwards ranges (e.g., Z1140:Z1000 → Z1000:Z1140) for all write tools
  if (isWriteTool(toolCall.name)) {
    const params = toolCall.parameters as Record<string, unknown>;
    if (typeof params.address === 'string') {
      const normalized = normalizeAddress(params.address);
      if (normalized !== params.address) {
        toolCall = { ...toolCall, parameters: { ...params, address: normalized } };
      }
    }
  }

  // Dispatch to specific preview generator based on tool name
  switch (toolCall.name) {
    case 'write_range':
      return generateWriteRangePreview(toolCall, validation, warnings);
    case 'set_formula':
      return generateSetFormulaPreview(toolCall, validation, warnings);
    case 'format_range':
      return generateFormatRangePreview(toolCall, validation, warnings);
    case 'create_sheet':
      return generateCreateSheetPreview(toolCall, validation, warnings);
    case 'add_table':
      return generateAddTablePreview(toolCall, validation, warnings);
    case 'highlight_cells':
      return generateHighlightCellsPreview(toolCall, validation, warnings);
    default:
      return {
        toolCall,
        affectedRange: '',
        cellCount: 0,
        changes: [],
        warnings: ['Unknown tool type'],
        requiresConfirmation: false,
        validation,
        generatedAt: Date.now(),
      };
  }
}

/**
 * Generates preview for write_range tool.
 */
async function generateWriteRangePreview(
  toolCall: ToolCall,
  validation: ReturnType<typeof validateToolCall>,
  warnings: string[]
): Promise<PreviewData> {
  const params = getParams<WriteRangeParams>(toolCall);
  const cellCount = params.values ? params.values.length * (params.values[0]?.length || 0) : 0;

  let changes: CellChange[] = [];
  let beforeValues: unknown[][] = [];

  if (validation.valid && params.address && params.values) {
    try {
      // Try to read current values (also stored for undo)
      beforeValues = await readRange(params.address);
      changes = buildCellChanges(params.address, beforeValues, params.values);
    } catch {
      // Range might not exist yet, build changes with empty current values
      changes = buildCellChanges(params.address, [], params.values);
    }

    // Check for overwrites
    const overwriteCount = changes.filter((c) => c.isOverwrite).length;
    if (overwriteCount > 0) {
      warnings.push(`${overwriteCount} cell(s) with existing data will be overwritten`);
    }
  }

  return {
    toolCall,
    affectedRange: params.address || '',
    cellCount,
    changes,
    warnings,
    requiresConfirmation: requiresConfirmation(cellCount),
    validation,
    generatedAt: Date.now(),
    beforeValues: beforeValues.length > 0 ? beforeValues : undefined,
    reason: params.reason,
  };
}

/**
 * Generates preview for set_formula tool.
 * Supports both single-cell and range addresses.
 */
async function generateSetFormulaPreview(
  toolCall: ToolCall,
  validation: ReturnType<typeof validateToolCall>,
  warnings: string[]
): Promise<PreviewData> {
  const params = getParams<SetFormulaParams>(toolCall);
  const cellCount = params.address ? calculateCellCount(params.address) : 1;
  let changes: CellChange[] = [];
  let beforeValues: unknown[][] = [];

  // Validate cell count against formula fill limit
  if (cellCount > 1 && cellCount > SAFETY_LIMITS.MAX_FORMULA_FILL_CELLS) {
    validation = {
      valid: false,
      errors: [
        ...validation.errors,
        {
          field: 'address',
          message: `Formula fill affects ${cellCount} cells. Maximum allowed: ${SAFETY_LIMITS.MAX_FORMULA_FILL_CELLS}`,
          code: 'SIZE_LIMIT_EXCEEDED',
        },
      ],
    };
    warnings.push(`Range too large: ${cellCount} cells exceeds the ${SAFETY_LIMITS.MAX_FORMULA_FILL_CELLS} cell limit`);
  }

  if (validation.valid && params.address) {
    try {
      beforeValues = await readRange(params.address);

      if (cellCount === 1) {
        // Single cell
        const currentValue = beforeValues[0]?.[0];
        changes = [
          {
            address: params.address,
            currentValue,
            newValue: params.formula,
            isOverwrite: currentValue !== null && currentValue !== undefined && currentValue !== '',
          },
        ];

        if (changes[0].isOverwrite) {
          warnings.push('Cell has existing content that will be replaced');
        }
      } else {
        // Range: show first cell + summary for rest
        const cellRef = params.address.includes('!') ? params.address.split('!')[1]! : params.address;
        const firstCellRef = cellRef.split(':')[0]!;
        const sheetPrefix = params.address.includes('!') ? params.address.substring(0, params.address.indexOf('!') + 1) : '';
        const firstCellAddress = sheetPrefix + firstCellRef;

        const firstCurrentValue = beforeValues[0]?.[0];
        changes = [
          {
            address: firstCellAddress,
            currentValue: firstCurrentValue,
            newValue: params.formula,
            isOverwrite: firstCurrentValue !== null && firstCurrentValue !== undefined && firstCurrentValue !== '',
          },
        ];

        // Count overwrites across the range
        let overwriteCount = 0;
        for (const row of beforeValues) {
          for (const cell of row) {
            if (cell !== null && cell !== undefined && cell !== '') {
              overwriteCount++;
            }
          }
        }

        if (overwriteCount > 0) {
          warnings.push(`${overwriteCount} cell(s) with existing data will be overwritten`);
        }

        warnings.push(`Formula will auto-fill across ${cellCount} cells with relative references adjusting per row`);
      }
    } catch {
      // Range might not exist yet
      const cellRef = params.address.includes('!') ? params.address.split('!')[1]! : params.address;
      const firstCellRef = cellRef.split(':')[0]!;
      const firstCellAddress = (params.address.includes('!') ? params.address.substring(0, params.address.indexOf('!') + 1) : '') + firstCellRef;

      changes = [
        {
          address: cellCount === 1 ? params.address : firstCellAddress,
          currentValue: null,
          newValue: params.formula,
          isOverwrite: false,
        },
      ];

      if (cellCount > 1) {
        warnings.push(`Formula will auto-fill across ${cellCount} cells with relative references adjusting per row`);
      }
    }
  }

  return {
    toolCall,
    affectedRange: params.address || '',
    cellCount,
    changes,
    warnings,
    requiresConfirmation: requiresConfirmation(cellCount),
    validation,
    generatedAt: Date.now(),
    beforeValues: beforeValues.length > 0 ? beforeValues : undefined,
    reason: params.reason,
  };
}

/**
 * Generates preview for format_range tool.
 */
async function generateFormatRangePreview(
  toolCall: ToolCall,
  validation: ReturnType<typeof validateToolCall>,
  warnings: string[]
): Promise<PreviewData> {
  const params = getParams<FormatRangeParams>(toolCall);
  const cellCount = params.address ? calculateCellCount(params.address) : 0;

  // Format changes don't modify values, but we can show what formatting will be applied
  const formatDescription = describeFormatOptions(params.style);
  if (formatDescription) {
    warnings.push(`Will apply: ${formatDescription}`);
  }

  return {
    toolCall,
    affectedRange: params.address || '',
    cellCount,
    changes: [], // Format changes don't have value diffs
    warnings,
    requiresConfirmation: requiresConfirmation(cellCount),
    validation,
    generatedAt: Date.now(),
    reason: params.reason,
  };
}

/**
 * Generates preview for create_sheet tool.
 */
async function generateCreateSheetPreview(
  toolCall: ToolCall,
  validation: ReturnType<typeof validateToolCall>,
  warnings: string[]
): Promise<PreviewData> {
  const params = toolCall.parameters as { name?: string; reason?: string };

  return {
    toolCall,
    affectedRange: '', // No range for sheet creation
    cellCount: 0,
    changes: [],
    warnings,
    requiresConfirmation: true, // Sheet creation always requires confirmation
    validation,
    generatedAt: Date.now(),
    reason: params.reason,
  };
}

/**
 * Generates preview for add_table tool.
 */
async function generateAddTablePreview(
  toolCall: ToolCall,
  validation: ReturnType<typeof validateToolCall>,
  warnings: string[]
): Promise<PreviewData> {
  const params = getParams<AddTableParams>(toolCall);
  const cellCount = params.address ? calculateCellCount(params.address) : 0;

  warnings.push(`Will create table "${params.name}" from range ${params.address}`);

  return {
    toolCall,
    affectedRange: params.address || '',
    cellCount,
    changes: [], // Table creation modifies structure, not values
    warnings,
    requiresConfirmation: true, // Table creation always requires confirmation
    validation,
    generatedAt: Date.now(),
    reason: params.reason,
  };
}

/**
 * Generates preview for highlight_cells tool.
 */
async function generateHighlightCellsPreview(
  toolCall: ToolCall,
  validation: ReturnType<typeof validateToolCall>,
  warnings: string[]
): Promise<PreviewData> {
  const params = getParams<HighlightCellsParams>(toolCall);
  const cellCount = params.address ? calculateCellCount(params.address) : 0;

  warnings.push(`Will highlight with color: ${params.color}`);

  return {
    toolCall,
    affectedRange: params.address || '',
    cellCount,
    changes: [], // Highlight changes don't have value diffs
    warnings,
    requiresConfirmation: requiresConfirmation(cellCount),
    validation,
    generatedAt: Date.now(),
    reason: params.reason,
  };
}

/**
 * Builds cell change records by comparing current and new values.
 */
function buildCellChanges(
  address: string,
  currentValues: unknown[][],
  newValues: unknown[][]
): CellChange[] {
  const changes: CellChange[] = [];

  // Parse the start cell from address
  const cellRef = address.includes('!') ? address.split('!')[1] : address;
  const startCell = cellRef.includes(':') ? cellRef.split(':')[0] : cellRef;

  const startCol = startCell.match(/[A-Za-z]+/)?.[0] || 'A';
  const startRow = parseInt(startCell.match(/[0-9]+/)?.[0] || '1', 10);
  const startColNum = columnToNumber(startCol);

  for (let row = 0; row < newValues.length; row++) {
    const rowValues = newValues[row];
    if (!rowValues) continue;

    for (let col = 0; col < rowValues.length; col++) {
      const newValue = rowValues[col];
      const currentValue = currentValues[row]?.[col] ?? null;

      // Calculate cell address
      const cellAddress = `${numberToColumn(startColNum + col)}${startRow + row}`;

      const isOverwrite =
        currentValue !== null &&
        currentValue !== undefined &&
        currentValue !== '' &&
        currentValue !== newValue;

      changes.push({
        address: cellAddress,
        currentValue,
        newValue,
        isOverwrite,
      });
    }
  }

  // Limit changes shown for large operations
  if (changes.length > SAFETY_LIMITS.MAX_CELLS_PER_WRITE) {
    return changes.slice(0, SAFETY_LIMITS.MAX_CELLS_PER_WRITE);
  }

  return changes;
}

/**
 * Describes format options in human-readable form.
 */
function describeFormatOptions(style: FormatRangeParams['style']): string {
  const parts: string[] = [];

  if (style.fillColor) parts.push(`background ${style.fillColor}`);
  if (style.fontColor) parts.push(`text color ${style.fontColor}`);
  if (style.bold) parts.push('bold');
  if (style.italic) parts.push('italic');
  if (style.numberFormat) parts.push(`format "${style.numberFormat}"`);
  if (style.horizontalAlignment) parts.push(`align ${style.horizontalAlignment}`);

  return parts.join(', ');
}
