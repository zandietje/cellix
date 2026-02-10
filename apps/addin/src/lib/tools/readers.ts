/**
 * Read tool executors for Phase 5B Smart Retrieval.
 * Uses Arquero for data processing.
 */

import type {
  GetProfileParams,
  SelectRowsParams,
  GroupAggregateParams,
  FindOutliersParams,
  SearchValuesParams,
  FilterSpec,
  SheetProfile,
  DataType,
} from '@cellix/shared';
import { columnToNumber } from '@cellix/shared';
import { extractSheetProfile } from '../excel/profiler';
import { getCachedProfile, setCachedProfile } from '../excel/profileCache';
import { aq, createTable, type ColumnTable } from '../data/arquero';

/** Safety limits */
const LIMITS = {
  SELECT_ROWS: 500,
  GROUP_AGGREGATE: 1000,
  FIND_OUTLIERS: 100,
  SEARCH_VALUES: 100,
};

/** Result types */
export interface SelectRowsResult {
  rows: Record<string, unknown>[];
  total: number;
  columns: string[];
}

export interface GroupAggregateResult {
  groups: Record<string, unknown>[];
  groupBy: string[];
  metrics: string[];
}

export interface FindOutliersResult {
  outliers: Record<string, unknown>[];
  stats: { mean: number; stdev: number } | null;
  method: string;
}

export interface SearchResult {
  matches: Record<string, unknown>[];
  total: number;
}

/**
 * Execute get_profile tool.
 */
export async function executeGetProfile(params: GetProfileParams): Promise<SheetProfile> {
  // Try cache first
  if (params.sheet) {
    const cached = getCachedProfile(params.sheet);
    if (cached) return cached;
  }

  const profile = await extractSheetProfile(params.sheet);

  // Cache for future use
  setCachedProfile(profile);

  return profile;
}

/**
 * Execute select_rows tool.
 */
export async function executeSelectRows(params: SelectRowsParams): Promise<SelectRowsResult> {
  const values = await readSheetData(params.sheet);

  if (values.length === 0) {
    return { rows: [], total: 0, columns: [] };
  }

  const table = createTable(values, true);

  if (!table) {
    return { rows: [], total: 0, columns: [] };
  }

  const profile = await executeGetProfile({ sheet: params.sheet });
  let result = table;

  // Apply filters
  if (params.filters?.length) {
    result = applyFilters(result, params.filters, profile);
  }

  // Get total before pagination
  const total = result.numRows();

  // Resolve columns (letters to names)
  const resolvedColumns = params.columns.map((c) => resolveColumn(c, profile));

  // Order by
  if (params.orderBy) {
    const col = resolveColumn(params.orderBy.column, profile);
    result =
      params.orderBy.direction === 'desc' ? result.orderby(aq.desc(col)) : result.orderby(col);
  }

  // Pagination with safety limit
  const limit = Math.min(params.limit ?? 50, LIMITS.SELECT_ROWS);
  const offset = params.offset ?? 0;
  result = result.slice(offset, offset + limit);

  // Select only requested columns
  if (resolvedColumns.length > 0) {
    const validColumns = resolvedColumns.filter((col) => result.columnNames().includes(col));
    if (validColumns.length > 0) {
      result = result.select(validColumns);
    }
  }

  return {
    rows: result.objects() as Record<string, unknown>[],
    total,
    columns: resolvedColumns,
  };
}

/**
 * Execute group_aggregate tool.
 */
export async function executeGroupAggregate(
  params: GroupAggregateParams
): Promise<GroupAggregateResult> {
  const values = await readSheetData(params.sheet);

  if (values.length === 0) {
    return { groups: [], groupBy: [], metrics: [] };
  }

  const table = createTable(values, true);

  if (!table) {
    return { groups: [], groupBy: [], metrics: [] };
  }

  const profile = await executeGetProfile({ sheet: params.sheet });
  let result = table;

  // Apply filters
  if (params.filters?.length) {
    result = applyFilters(result, params.filters, profile);
  }

  // Resolve column names
  const groupByCols = params.groupBy.map((c) => resolveColumn(c, profile));

  // Build aggregation - use manual approach for type safety
  const metricNames: string[] = [];
  const metricSpecs: Array<{
    name: string;
    column: string;
    aggregation: string;
  }> = [];

  for (const metric of params.metrics) {
    const col = resolveColumn(metric.column, profile);
    const name = `${col}_${metric.aggregation}`;
    metricNames.push(name);
    metricSpecs.push({ name, column: col, aggregation: metric.aggregation });
  }

  // Get all rows and perform manual grouping/aggregation
  const allRows = result.objects() as Record<string, unknown>[];

  // Group rows by groupBy columns
  const groups = new Map<string, Record<string, unknown>[]>();
  for (const row of allRows) {
    const key = groupByCols.map((col) => String(row[col] ?? '')).join('|||');
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(row);
  }

  // Compute aggregations for each group
  const aggregatedRows: Record<string, unknown>[] = [];
  for (const [, groupRows] of groups) {
    const aggregated: Record<string, unknown> = {};

    // Copy group-by values from first row
    for (const col of groupByCols) {
      aggregated[col] = groupRows[0][col];
    }

    // Compute each metric
    for (const spec of metricSpecs) {
      const values = groupRows
        .map((r) => r[spec.column])
        .filter((v): v is number => typeof v === 'number' && !isNaN(v));

      switch (spec.aggregation) {
        case 'sum':
          aggregated[spec.name] = values.reduce((a, b) => a + b, 0);
          break;
        case 'avg':
          aggregated[spec.name] = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
          break;
        case 'min':
          aggregated[spec.name] = values.length > 0 ? Math.min(...values) : null;
          break;
        case 'max':
          aggregated[spec.name] = values.length > 0 ? Math.max(...values) : null;
          break;
        case 'count':
          aggregated[spec.name] = groupRows.length;
          break;
        case 'countUnique':
          aggregated[spec.name] = new Set(groupRows.map((r) => r[spec.column])).size;
          break;
      }
    }

    aggregatedRows.push(aggregated);
  }

  // Limit
  const limit = Math.min(params.limit ?? 100, LIMITS.GROUP_AGGREGATE);
  const limitedGroups = aggregatedRows.slice(0, limit);

  return {
    groups: limitedGroups,
    groupBy: groupByCols,
    metrics: metricNames,
  };
}

/**
 * Execute find_outliers tool.
 */
export async function executeFindOutliers(params: FindOutliersParams): Promise<FindOutliersResult> {
  const values = await readSheetData(params.sheet);

  if (values.length === 0) {
    return { outliers: [], stats: null, method: params.method };
  }

  const table = createTable(values, true);

  if (!table) {
    return { outliers: [], stats: null, method: params.method };
  }

  const profile = await executeGetProfile({ sheet: params.sheet });
  const col = resolveColumn(params.column, profile);
  const threshold = params.threshold ?? 2;
  const limit = Math.min(params.limit ?? 20, LIMITS.FIND_OUTLIERS);

  if (params.method === 'zscore') {
    // Calculate stats
    const colValues = table.array(col) as unknown[];
    const numericValues = colValues.filter(
      (v): v is number => typeof v === 'number' && !isNaN(v)
    );

    if (numericValues.length === 0) {
      return { outliers: [], stats: null, method: 'zscore' };
    }

    const mean = numericValues.reduce((a, b) => a + b, 0) / numericValues.length;
    const variance =
      numericValues.map((v) => Math.pow(v - mean, 2)).reduce((a, b) => a + b, 0) /
      numericValues.length;
    const stdev = Math.sqrt(variance);

    if (stdev === 0) {
      return { outliers: [], stats: { mean, stdev }, method: 'zscore' };
    }

    // Find outliers - use manual filtering for better type safety
    const allRows = table.objects() as Record<string, unknown>[];
    const outlierRowsWithScore: Array<Record<string, unknown> & { _zscore: number }> = [];

    for (const row of allRows) {
      const v = row[col];
      if (typeof v !== 'number' || isNaN(v)) continue;
      const zscore = Math.abs((v - mean) / stdev);
      if (zscore > threshold) {
        outlierRowsWithScore.push({ ...row, _zscore: zscore });
      }
    }

    // Sort by z-score descending and limit
    outlierRowsWithScore.sort((a, b) => b._zscore - a._zscore);
    const outlierRows = outlierRowsWithScore.slice(0, limit) as Record<string, unknown>[];

    return { outliers: outlierRows, stats: { mean, stdev }, method: 'zscore' };
  }

  if (params.method === 'iqr') {
    // IQR method
    const colValues = table.array(col) as unknown[];
    const numericValues = colValues
      .filter((v): v is number => typeof v === 'number' && !isNaN(v))
      .sort((a, b) => a - b);

    if (numericValues.length < 4) {
      return { outliers: [], stats: null, method: 'iqr' };
    }

    const q1Index = Math.floor(numericValues.length * 0.25);
    const q3Index = Math.floor(numericValues.length * 0.75);
    const q1 = numericValues[q1Index];
    const q3 = numericValues[q3Index];
    const iqr = q3 - q1;
    const lowerBound = q1 - 1.5 * iqr;
    const upperBound = q3 + 1.5 * iqr;

    const allRows = table.objects() as Record<string, unknown>[];
    const outlierRows = allRows
      .filter((row) => {
        const v = row[col] as number;
        if (typeof v !== 'number' || isNaN(v)) return false;
        return v < lowerBound || v > upperBound;
      })
      .slice(0, limit);

    return { outliers: outlierRows, stats: null, method: 'iqr' };
  }

  if (params.method === 'percentile') {
    // Percentile method - values outside p5-p95
    const colValues = table.array(col) as unknown[];
    const numericValues = colValues
      .filter((v): v is number => typeof v === 'number' && !isNaN(v))
      .sort((a, b) => a - b);

    if (numericValues.length < 20) {
      return { outliers: [], stats: null, method: 'percentile' };
    }

    const p5Index = Math.floor(numericValues.length * 0.05);
    const p95Index = Math.floor(numericValues.length * 0.95);
    const p5 = numericValues[p5Index];
    const p95 = numericValues[p95Index];

    const allRows = table.objects() as Record<string, unknown>[];
    const outlierRows = allRows
      .filter((row) => {
        const v = row[col] as number;
        if (typeof v !== 'number' || isNaN(v)) return false;
        return v < p5 || v > p95;
      })
      .slice(0, limit);

    return { outliers: outlierRows, stats: null, method: 'percentile' };
  }

  return { outliers: [], stats: null, method: params.method };
}

/**
 * Execute search_values tool.
 */
export async function executeSearchValues(params: SearchValuesParams): Promise<SearchResult> {
  const values = await readSheetData();

  if (values.length === 0) {
    return { matches: [], total: 0 };
  }

  const table = createTable(values, true);

  if (!table) {
    return { matches: [], total: 0 };
  }

  const profile = await executeGetProfile({});
  const searchCols =
    params.columns?.map((c) => resolveColumn(c, profile)) ??
    profile.columns.map((c) => c.header).filter((h): h is string => h !== null);

  const query = params.query.toLowerCase();
  const limit = Math.min(params.limit ?? 20, LIMITS.SEARCH_VALUES);

  // Filter rows that match
  const allRows = table.objects() as Record<string, unknown>[];
  const matches = allRows
    .filter((row) => {
      for (const col of searchCols) {
        const val = String(row[col] ?? '').toLowerCase();
        if (params.fuzzy) {
          // Simple fuzzy: contains
          if (val.includes(query)) return true;
        } else {
          // Exact match (case-insensitive)
          if (val === query) return true;
        }
      }
      return false;
    })
    .slice(0, limit);

  return { matches, total: matches.length };
}

// ============================================
// Helper Functions
// ============================================

/**
 * Read all data from a sheet.
 */
async function readSheetData(sheetName?: string): Promise<unknown[][]> {
  return Excel.run(async (context) => {
    const sheet = sheetName
      ? context.workbook.worksheets.getItem(sheetName)
      : context.workbook.worksheets.getActiveWorksheet();

    const usedRange = sheet.getUsedRangeOrNullObject();
    usedRange.load('values');
    await context.sync();

    if (usedRange.isNullObject) {
      return [];
    }

    return usedRange.values;
  });
}

/**
 * Resolve column reference (letter or name) to column name.
 */
function resolveColumn(ref: string, profile: SheetProfile): string {
  // If it's a letter like "A", "B", "AA", convert to header name
  if (/^[A-Z]+$/i.test(ref)) {
    const idx = columnToNumber(ref.toUpperCase()) - 1;
    const col = profile.columns[idx];
    return col?.header ?? ref;
  }
  return ref;
}

/**
 * Apply filters to an Arquero table.
 */
function applyFilters(
  table: ColumnTable,
  filters: FilterSpec[],
  profile: SheetProfile
): ColumnTable {
  // Apply all filters in sequence
  let result = table;

  for (const filter of filters) {
    const col = resolveColumn(filter.column, profile);
    const colProfile = profile.columns.find(
      (c) => c.header === col || c.letter === filter.column
    );
    const value = coerceValue(filter.value, colProfile?.dataType);
    const value2 = filter.value2 ? coerceValue(filter.value2, colProfile?.dataType) : undefined;

    // Get current rows and filter manually for type safety
    const currentRows = result.objects() as Record<string, unknown>[];
    const filteredRows = currentRows.filter((row) => {
      const cellValue = row[col];

      switch (filter.operator) {
        case 'eq':
          return cellValue === value;
        case 'neq':
          return cellValue !== value;
        case 'gt':
          return (cellValue as number) > (value as number);
        case 'lt':
          return (cellValue as number) < (value as number);
        case 'gte':
          return (cellValue as number) >= (value as number);
        case 'lte':
          return (cellValue as number) <= (value as number);
        case 'contains':
          return String(cellValue ?? '')
            .toLowerCase()
            .includes(String(value).toLowerCase());
        case 'startsWith':
          return String(cellValue ?? '')
            .toLowerCase()
            .startsWith(String(value).toLowerCase());
        case 'between':
          return (
            (cellValue as number) >= (value as number) &&
            (cellValue as number) <= (value2 as number)
          );
        case 'in':
          return Array.isArray(value) && value.includes(cellValue);
        default:
          return true;
      }
    });

    // Rebuild table from filtered rows
    if (filteredRows.length === 0) {
      // Return empty table with same columns
      return aq.table(
        Object.fromEntries(result.columnNames().map((name) => [name, []]))
      ) as ColumnTable;
    }

    // Convert back to column-oriented format
    const columns: Record<string, unknown[]> = {};
    for (const colName of result.columnNames()) {
      columns[colName] = filteredRows.map((row) => row[colName]);
    }
    result = aq.table(columns) as ColumnTable;
  }

  return result;
}

/**
 * Coerce filter value to appropriate type.
 */
function coerceValue(value: unknown, dataType?: DataType): unknown {
  if (value == null) return value;

  if (dataType === 'date' && typeof value === 'string') {
    const parsed = Date.parse(value);
    return isNaN(parsed) ? value : new Date(parsed);
  }

  if ((dataType === 'number' || dataType === 'currency') && typeof value === 'string') {
    const cleaned = value.replace(/[$,\u20AC\u00A3\u00A5\u20B1%]/g, '');
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? value : parsed;
  }

  return value;
}
