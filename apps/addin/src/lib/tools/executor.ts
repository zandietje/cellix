/**
 * Tool execution engine.
 * Executes approved tool calls and manages the execution lifecycle.
 */

import type { ToolCall } from '@cellix/shared';
import {
  writeRange,
  setFormula,
  formatRange,
  createSheet,
  addTable,
  highlightCells,
} from '../excel/writer';
import { validateToolCall } from './validator';
import { logToolExecution } from './audit';
import type {
  ExecutionResult,
  PreviewData,
  WriteRangeParams,
  SetFormulaParams,
  FormatRangeParams,
  CreateSheetParams,
  AddTableParams,
  HighlightCellsParams,
} from './types';

/**
 * Executes a single tool call.
 * Validates before execution and logs the result.
 */
export async function executeToolCall(toolCall: ToolCall): Promise<ExecutionResult> {
  const startTime = performance.now();

  // Re-validate before execution (safety check)
  const validation = validateToolCall(toolCall);
  if (!validation.valid) {
    const error = validation.errors.map((e) => e.message).join('; ');
    logToolExecution({
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      toolName: toolCall.name,
      parameters: toolCall.parameters,
      result: 'error',
      errorMessage: error,
      cellsAffected: 0,
      executionTimeMs: performance.now() - startTime,
    });

    return {
      success: false,
      toolCallId: toolCall.id,
      cellsAffected: 0,
      executionTimeMs: performance.now() - startTime,
      error,
    };
  }

  try {
    let cellsAffected = 0;
    let resultData: Record<string, unknown> = {};

    // Dispatch to specific executor based on tool name
    switch (toolCall.name) {
      case 'write_range': {
        const params = toolCall.parameters as unknown as WriteRangeParams;
        const result = await writeRange(params.address, params.values);
        if (!result.success) {
          throw new Error(result.error || 'Failed to write range');
        }
        cellsAffected = result.cellCount;
        resultData = { address: result.address };
        break;
      }

      case 'set_formula': {
        const params = toolCall.parameters as unknown as SetFormulaParams;
        const result = await setFormula(params.address, params.formula);
        if (!result.success) {
          throw new Error(result.error || 'Failed to set formula');
        }
        cellsAffected = 1;
        resultData = { address: result.address };
        break;
      }

      case 'format_range': {
        const params = toolCall.parameters as unknown as FormatRangeParams;
        const result = await formatRange(params.address, params.style);
        if (!result.success) {
          throw new Error(result.error || 'Failed to format range');
        }
        cellsAffected = result.cellCount;
        resultData = { address: result.address };
        break;
      }

      case 'create_sheet': {
        const params = toolCall.parameters as unknown as CreateSheetParams;
        const result = await createSheet(params.name);
        if (!result.success) {
          throw new Error(result.error || 'Failed to create sheet');
        }
        cellsAffected = 0;
        resultData = { sheetName: result.sheetName };
        break;
      }

      case 'add_table': {
        const params = toolCall.parameters as unknown as AddTableParams;
        const result = await addTable(params.address, params.name, params.hasHeaders);
        if (!result.success) {
          throw new Error(result.error || 'Failed to create table');
        }
        cellsAffected = result.cellCount;
        resultData = { tableName: result.tableName, address: result.address };
        break;
      }

      case 'highlight_cells': {
        const params = toolCall.parameters as unknown as HighlightCellsParams;
        const result = await highlightCells(params.address, params.color);
        if (!result.success) {
          throw new Error(result.error || 'Failed to highlight cells');
        }
        cellsAffected = result.cellCount;
        resultData = { address: result.address };
        break;
      }

      default:
        throw new Error(`Unknown tool: ${toolCall.name}`);
    }

    const executionTimeMs = performance.now() - startTime;

    // Log successful execution
    logToolExecution({
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      toolName: toolCall.name,
      parameters: toolCall.parameters,
      result: 'success',
      cellsAffected,
      executionTimeMs,
    });

    return {
      success: true,
      toolCallId: toolCall.id,
      cellsAffected,
      executionTimeMs,
      resultData,
    };
  } catch (error) {
    const executionTimeMs = performance.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Execution failed';

    // Log failed execution
    logToolExecution({
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      toolName: toolCall.name,
      parameters: toolCall.parameters,
      result: 'error',
      errorMessage,
      cellsAffected: 0,
      executionTimeMs,
    });

    return {
      success: false,
      toolCallId: toolCall.id,
      cellsAffected: 0,
      executionTimeMs,
      error: errorMessage,
    };
  }
}

/**
 * Executes multiple approved tool calls sequentially.
 * Calls onProgress after each execution for UI updates.
 */
export async function executeApprovedActions(
  previews: PreviewData[],
  onProgress?: (result: ExecutionResult, index: number) => void
): Promise<ExecutionResult[]> {
  const results: ExecutionResult[] = [];

  for (let i = 0; i < previews.length; i++) {
    const preview = previews[i];
    const result = await executeToolCall(preview.toolCall);
    results.push(result);

    if (onProgress) {
      onProgress(result, i);
    }

    // If execution failed, we could optionally stop here
    // But for now, continue with remaining actions
  }

  return results;
}

/**
 * Cancels a tool call (logs it as cancelled without executing).
 */
export function cancelToolCall(toolCall: ToolCall): void {
  logToolExecution({
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    toolName: toolCall.name,
    parameters: toolCall.parameters,
    result: 'cancelled',
    cellsAffected: 0,
    executionTimeMs: 0,
  });
}
