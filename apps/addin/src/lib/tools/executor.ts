/**
 * Tool execution engine.
 * Executes approved tool calls and manages the execution lifecycle.
 */

import type { ToolCall } from '@cellix/shared';
import type {
  WriteRangeParams,
  SetFormulaParams,
  FormatRangeParams,
  CreateSheetParams,
  AddTableParams,
  HighlightCellsParams,
  ReadRangeParams,
  GetSelectionParams,
  GetSheetNamesParams,
  GetContextParams,
  GetProfileParams,
  SelectRowsParams,
  GroupAggregateParams,
  FindOutliersParams,
  SearchValuesParams,
} from '@cellix/shared';
import { getParams } from './types';
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
import {
  executeReadRange,
  executeGetSelection,
  executeGetSheetNames,
  executeGetContext,
  executeGetProfile,
  executeSelectRows,
  executeGroupAggregate,
  executeFindOutliers,
  executeSearchValues,
} from './readers';
import type { ExecutionResult, PreviewData } from './types';

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
        const params = getParams<WriteRangeParams>(toolCall);
        const result = await writeRange(params.address, params.values);
        if (!result.success) {
          throw new Error(result.error || 'Failed to write range');
        }
        cellsAffected = result.cellCount;
        resultData = { address: result.address };
        break;
      }

      case 'set_formula': {
        const params = getParams<SetFormulaParams>(toolCall);
        const result = await setFormula(params.address, params.formula);
        if (!result.success) {
          throw new Error(result.error || 'Failed to set formula');
        }
        cellsAffected = result.cellCount;
        resultData = { address: result.address };
        break;
      }

      case 'format_range': {
        const params = getParams<FormatRangeParams>(toolCall);
        const result = await formatRange(params.address, params.style);
        if (!result.success) {
          throw new Error(result.error || 'Failed to format range');
        }
        cellsAffected = result.cellCount;
        resultData = { address: result.address };
        break;
      }

      case 'create_sheet': {
        const params = getParams<CreateSheetParams>(toolCall);
        const result = await createSheet(params.name);
        if (!result.success) {
          throw new Error(result.error || 'Failed to create sheet');
        }
        cellsAffected = 0;
        resultData = { sheetName: result.sheetName };
        break;
      }

      case 'add_table': {
        const params = getParams<AddTableParams>(toolCall);
        const result = await addTable(params.address, params.name, params.hasHeaders);
        if (!result.success) {
          throw new Error(result.error || 'Failed to create table');
        }
        cellsAffected = result.cellCount;
        resultData = { tableName: result.tableName, address: result.address };
        break;
      }

      case 'highlight_cells': {
        const params = getParams<HighlightCellsParams>(toolCall);
        const result = await highlightCells(params.address, params.color);
        if (!result.success) {
          throw new Error(result.error || 'Failed to highlight cells');
        }
        cellsAffected = result.cellCount;
        resultData = { address: result.address };
        break;
      }

      // Basic Read Tools - Read-only operations
      case 'read_range': {
        const params = getParams<ReadRangeParams>(toolCall);
        const readResult = await executeReadRange(params);
        if (!readResult.success) {
          throw new Error(readResult.error || 'Failed to read range');
        }
        resultData = readResult.resultData ?? {};
        break;
      }

      case 'get_selection': {
        const params = getParams<GetSelectionParams>(toolCall);
        const selResult = await executeGetSelection(params);
        if (!selResult.success) {
          throw new Error(selResult.error || 'Failed to get selection');
        }
        resultData = selResult.resultData ?? {};
        break;
      }

      case 'get_sheet_names': {
        const params = getParams<GetSheetNamesParams>(toolCall);
        const sheetResult = await executeGetSheetNames(params);
        if (!sheetResult.success) {
          throw new Error(sheetResult.error || 'Failed to get sheet names');
        }
        resultData = sheetResult.resultData ?? {};
        break;
      }

      case 'get_context': {
        const params = getParams<GetContextParams>(toolCall);
        const ctxResult = await executeGetContext(params);
        if (!ctxResult.success) {
          throw new Error(ctxResult.error || 'Failed to get context');
        }
        resultData = ctxResult.resultData ?? {};
        break;
      }

      // Smart Retrieval Tools (Phase 5B) - Read-only operations
      case 'get_profile': {
        const profile = await executeGetProfile(getParams<GetProfileParams>(toolCall));
        resultData = { ...profile };
        break;
      }

      case 'select_rows': {
        const rows = await executeSelectRows(getParams<SelectRowsParams>(toolCall));
        resultData = { ...rows };
        break;
      }

      case 'group_aggregate': {
        const groups = await executeGroupAggregate(getParams<GroupAggregateParams>(toolCall));
        resultData = { ...groups };
        break;
      }

      case 'find_outliers': {
        const outliers = await executeFindOutliers(getParams<FindOutliersParams>(toolCall));
        resultData = { ...outliers };
        break;
      }

      case 'search_values': {
        const matches = await executeSearchValues(getParams<SearchValuesParams>(toolCall));
        resultData = { ...matches };
        break;
      }

      // Analytics tools are AI-reasoning-only — pass params back as result
      case 'explain_kpi':
      case 'suggest_actions': {
        resultData = {
          tool: toolCall.name,
          parameters: toolCall.parameters,
          note: 'Analytics tool executed — result is AI-generated reasoning',
        };
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
