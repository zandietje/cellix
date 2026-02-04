/**
 * Preview generator for tool calls.
 * Builds preview data by reading current cell values and computing changes.
 */

import { columnToNumber, numberToColumn, isWriteTool } from '@cellix/shared';
import type { ToolCall } from '@cellix/shared';
import type {
  WriteRangeParams,
  SetFormulaParams,
  FormatRangeParams,
  AddTableParams,
  HighlightCellsParams,
} from '@cellix/shared';
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
  const params = toolCall.parameters as unknown as WriteRangeParams;
  const cellCount = params.values ? params.values.length * (params.values[0]?.length || 0) : 0;

  let changes: CellChange[] = [];

  if (validation.valid && params.address && params.values) {
    try {
      // Try to read current values
      const currentValues = await readRange(params.address);
      changes = buildCellChanges(params.address, currentValues, params.values);
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
  };
}

/**
 * Generates preview for set_formula tool.
 */
async function generateSetFormulaPreview(
  toolCall: ToolCall,
  validation: ReturnType<typeof validateToolCall>,
  warnings: string[]
): Promise<PreviewData> {
  const params = toolCall.parameters as unknown as SetFormulaParams;
  let changes: CellChange[] = [];

  if (validation.valid && params.address) {
    try {
      const currentValues = await readRange(params.address);
      const currentValue = currentValues[0]?.[0];
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
    } catch {
      changes = [
        {
          address: params.address,
          currentValue: null,
          newValue: params.formula,
          isOverwrite: false,
        },
      ];
    }
  }

  return {
    toolCall,
    affectedRange: params.address || '',
    cellCount: 1,
    changes,
    warnings,
    requiresConfirmation: false, // Single cell formula doesn't need confirmation
    validation,
    generatedAt: Date.now(),
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
  const params = toolCall.parameters as unknown as FormatRangeParams;
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
  return {
    toolCall,
    affectedRange: '', // No range for sheet creation
    cellCount: 0,
    changes: [],
    warnings,
    requiresConfirmation: true, // Sheet creation always requires confirmation
    validation,
    generatedAt: Date.now(),
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
  const params = toolCall.parameters as unknown as AddTableParams;
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
  const params = toolCall.parameters as unknown as HighlightCellsParams;
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
