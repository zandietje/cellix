/**
 * Tool-related types and constants.
 * Single source of truth for tool definitions across the codebase.
 */

import type { FormatOptions } from './excel.js';

// ============================================
// Tool Categories
// ============================================

/** Names of tools that modify Excel and require preview */
export const WRITE_TOOLS = [
  'write_range',
  'set_formula',
  'format_range',
  'create_sheet',
  'add_table',
  'highlight_cells',
] as const;

/** Names of tools that only read data */
export const READ_TOOLS = [
  'read_range',
  'get_selection',
  'get_sheet_names',
  'get_context',
] as const;

/** Names of analytics/reasoning tools */
export const ANALYTICS_TOOLS = [
  'explain_kpi',
  'compare_periods',
  'suggest_actions',
] as const;

/** All valid tool names */
export const ALL_TOOLS = [...WRITE_TOOLS, ...READ_TOOLS, ...ANALYTICS_TOOLS] as const;

export type WriteToolName = (typeof WRITE_TOOLS)[number];
export type ReadToolName = (typeof READ_TOOLS)[number];
export type AnalyticsToolName = (typeof ANALYTICS_TOOLS)[number];
export type ToolName = (typeof ALL_TOOLS)[number];

/** Check if a tool name requires preview */
export function isWriteTool(name: string): name is WriteToolName {
  return WRITE_TOOLS.includes(name as WriteToolName);
}

/** Check if a tool name is valid */
export function isValidTool(name: string): name is ToolName {
  return ALL_TOOLS.includes(name as ToolName);
}

// ============================================
// Tool Parameter Types
// ============================================

/** Parameters for write_range tool */
export interface WriteRangeParams {
  /** Target address in A1 notation */
  address: string;
  /** 2D array of values to write */
  values: unknown[][];
  /** Reason for the write (shown to user) */
  reason: string;
}

/** Parameters for set_formula tool */
export interface SetFormulaParams {
  /** Target cell address */
  address: string;
  /** Formula to set (must start with =) */
  formula: string;
  /** Reason for setting formula */
  reason: string;
}

/** Parameters for format_range tool */
export interface FormatRangeParams {
  /** Target range address */
  address: string;
  /** Formatting options to apply */
  style: FormatOptions;
  /** Reason for formatting */
  reason: string;
}

/** Parameters for create_sheet tool */
export interface CreateSheetParams {
  /** Name for the new sheet */
  name: string;
  /** Reason for creating sheet */
  reason: string;
}

/** Parameters for add_table tool */
export interface AddTableParams {
  /** Range address for the table */
  address: string;
  /** Name for the table */
  name: string;
  /** Whether first row contains headers */
  hasHeaders: boolean;
  /** Reason for creating table */
  reason: string;
}

/** Parameters for highlight_cells tool */
export interface HighlightCellsParams {
  /** Target range address */
  address: string;
  /** Highlight color (hex or color name) */
  color: string;
  /** Reason for highlighting */
  reason: string;
}

/** Parameters for read_range tool */
export interface ReadRangeParams {
  /** Range to read in A1 notation */
  address: string;
}

/** Parameters for explain_kpi tool */
export interface ExplainKpiParams {
  /** Name of the KPI to explain */
  kpiName: string;
  /** Additional context about the user's situation */
  context?: string;
}

/** Parameters for suggest_actions tool */
export interface SuggestActionsParams {
  /** Summary of the data analysis performed */
  analysisContext: string;
}

/** Union of all tool parameter types */
export type ToolParams =
  | WriteRangeParams
  | SetFormulaParams
  | FormatRangeParams
  | CreateSheetParams
  | AddTableParams
  | HighlightCellsParams
  | ReadRangeParams
  | ExplainKpiParams
  | SuggestActionsParams;
