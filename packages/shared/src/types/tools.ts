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
  'get_profile',
  'select_rows',
  'group_aggregate',
  'find_outliers',
  'search_values',
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

// ============================================
// Smart Retrieval Tool Parameters (Phase 5B)
// ============================================

/** Filter specification for queries */
export interface FilterSpec {
  /** Column name or letter */
  column: string;
  /** Comparison operator */
  operator: 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains' | 'startsWith' | 'between' | 'in';
  /** Value to compare against */
  value: unknown;
  /** Second value for 'between' operator */
  value2?: unknown;
}

/** Parameters for get_profile tool */
export interface GetProfileParams {
  /** Sheet name (defaults to active sheet) */
  sheet?: string;
}

/** Parameters for select_rows tool */
export interface SelectRowsParams {
  /** Sheet name (defaults to active sheet) */
  sheet?: string;
  /** Column names or letters to return */
  columns: string[];
  /** Filter conditions */
  filters?: FilterSpec[];
  /** Sort order */
  orderBy?: { column: string; direction: 'asc' | 'desc' };
  /** Max rows to return (default 50, max 500) */
  limit?: number;
  /** Rows to skip (default 0) */
  offset?: number;
}

/** Parameters for group_aggregate tool */
export interface GroupAggregateParams {
  /** Sheet name (defaults to active sheet) */
  sheet?: string;
  /** Columns to group by */
  groupBy: string[];
  /** Aggregations to compute */
  metrics: Array<{
    column: string;
    aggregation: 'sum' | 'avg' | 'min' | 'max' | 'count' | 'countUnique';
  }>;
  /** Pre-aggregation filters */
  filters?: FilterSpec[];
  /** Max groups to return (default 100, max 1000) */
  limit?: number;
}

/** Parameters for find_outliers tool */
export interface FindOutliersParams {
  /** Sheet name (defaults to active sheet) */
  sheet?: string;
  /** Numeric column to analyze */
  column: string;
  /** Detection method */
  method: 'zscore' | 'iqr' | 'percentile';
  /** Threshold (z-score std devs, or percentile) */
  threshold?: number;
  /** Max outliers to return (default 20, max 100) */
  limit?: number;
}

/** Parameters for search_values tool */
export interface SearchValuesParams {
  /** Search query */
  query: string;
  /** Columns to search (all if not specified) */
  columns?: string[];
  /** Enable fuzzy matching */
  fuzzy?: boolean;
  /** Max results (default 20, max 100) */
  limit?: number;
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
  | SuggestActionsParams
  | GetProfileParams
  | SelectRowsParams
  | GroupAggregateParams
  | FindOutliersParams
  | SearchValuesParams;
