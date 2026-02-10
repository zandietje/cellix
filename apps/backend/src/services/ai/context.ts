/**
 * Excel context formatting for AI prompts.
 * Converts ExcelContextFull or ExcelContextWithProfile to a readable string for the AI.
 */

import type {
  ExcelContextFull,
  ExcelContextWithProfile,
  SheetProfile,
  ColumnProfile,
} from '@cellix/shared';

/** Maximum data types to show in context (keep prompt concise) */
const MAX_DATA_TYPES_SHOWN = 15;

/** Maximum numeric columns to show in context */
const MAX_NUMERIC_COLUMNS_SHOWN = 8;

/** Maximum sample data rows to show */
const MAX_SAMPLE_ROWS = 10;

/**
 * Formats Excel context for inclusion in the AI prompt.
 * Provides structured information about the user's current Excel state.
 */
export function formatExcelContext(context: ExcelContextFull | undefined | null): string {
  if (!context) return '';

  const lines: string[] = [];

  lines.push('\n## Current Excel Context\n');

  // Basic selection info
  lines.push(`**Active Sheet:** ${context.activeSheet}`);
  lines.push(`**Selection:** ${context.selection.address}`);
  lines.push(
    `**Size:** ${context.selection.rowCount} rows x ${context.selection.columnCount} columns`
  );

  if (context.selection.sampled) {
    lines.push(
      `*(Note: Data sampled to first ${context.selection.rowCount} rows from ${context.selection.originalRowCount} total)*`
    );
  }

  // Headers
  if (context.selection.headers.length > 0) {
    lines.push('\n**Headers:**');
    lines.push(context.selection.headers.join(' | '));
  }

  // Data types per column
  if (context.dataTypes.length > 0) {
    lines.push('\n**Column Types:**');
    for (const dt of context.dataTypes.slice(0, MAX_DATA_TYPES_SHOWN)) {
      lines.push(`- ${dt.header}: ${dt.type}`);
    }
    if (context.dataTypes.length > MAX_DATA_TYPES_SHOWN) {
      lines.push(`- ... and ${context.dataTypes.length - MAX_DATA_TYPES_SHOWN} more columns`);
    }
  }

  // Numeric stats
  if (context.stats.numericColumns.length > 0) {
    lines.push('\n**Numeric Summary:**');
    for (const col of context.stats.numericColumns.slice(0, MAX_NUMERIC_COLUMNS_SHOWN)) {
      lines.push(
        `- ${col.header}: Sum=${formatNum(col.sum)}, Avg=${formatNum(col.avg)}, Min=${formatNum(col.min)}, Max=${formatNum(col.max)}, Count=${col.count}`
      );
    }
    if (context.stats.numericColumns.length > MAX_NUMERIC_COLUMNS_SHOWN) {
      lines.push(`- ... and ${context.stats.numericColumns.length - MAX_NUMERIC_COLUMNS_SHOWN} more numeric columns`);
    }
  }

  // Sample data (first rows for AI understanding)
  if (context.selection.values.length > 1) {
    lines.push(`\n**Sample Data (first ${MAX_SAMPLE_ROWS} rows):**`);
    lines.push('```');
    const sample = context.selection.values.slice(0, MAX_SAMPLE_ROWS + 1); // Header + data rows
    for (const row of sample) {
      lines.push(row.map((cell) => formatCell(cell)).join('\t'));
    }
    lines.push('```');
  }

  // Tables in workbook
  if (context.tables.length > 0) {
    lines.push('\n**Tables in Workbook:**');
    for (const table of context.tables) {
      lines.push(`- ${table.name}: ${table.address} (${table.rowCount} data rows)`);
    }
  }

  // All sheets
  if (context.allSheets.length > 1) {
    lines.push(`\n**All Sheets:** ${context.allSheets.join(', ')}`);
  }

  return lines.join('\n');
}

/**
 * Format a number for display in context.
 */
function formatNum(n: number): string {
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return Number.isInteger(n) ? n.toString() : n.toFixed(2);
}

/**
 * Format a cell value for display.
 */
function formatCell(cell: unknown): string {
  if (cell === null || cell === undefined || cell === '') {
    return '';
  }
  const str = String(cell);
  // Truncate long strings
  if (str.length > 50) {
    return str.slice(0, 47) + '...';
  }
  return str;
}

// ═══════════════════════════════════════════════════════════════════════════
// PROFILE-FIRST CONTEXT FORMATTING (Phase 5C)
// ═══════════════════════════════════════════════════════════════════════════

/** Maximum columns to show in profile (keep prompt concise) */
const MAX_PROFILE_COLUMNS = 20;

/** Maximum quality warnings to show */
const MAX_QUALITY_WARNINGS = 5;

/**
 * Format profile-first context for AI prompt.
 * Compact representation (~500 tokens for typical sheet).
 */
export function formatProfileContext(
  context: ExcelContextWithProfile | null | undefined
): string {
  if (!context) return '';

  const lines: string[] = [];
  const { profile, inventory, selection } = context;

  lines.push('\n## Excel Context\n');

  // Sheet summary
  lines.push(`**Sheet:** "${profile.sheetName}"`);
  lines.push(
    `**Size:** ${profile.rowCount.toLocaleString()} rows x ${profile.columnCount} columns`
  );
  lines.push(
    `**Selection:** ${selection.address} (${selection.size.rows}x${selection.size.cols})`
  );

  // Tables
  if (profile.tables.length > 0) {
    lines.push(`**Tables:** ${profile.tables.map((t) => t.name).join(', ')}`);
  }

  // Column summary table
  if (profile.columns.length > 0) {
    lines.push('\n### Columns\n');
    lines.push('| Col | Header | Type | Semantic | Info |');
    lines.push('|-----|--------|------|----------|------|');

    for (const col of profile.columns.slice(0, MAX_PROFILE_COLUMNS)) {
      const header = col.header ? escapeMarkdown(col.header) : '-';
      const info = formatColumnInfo(col);
      lines.push(
        `| ${col.letter} | ${header} | ${col.dataType} | ${col.inferredName} | ${info} |`
      );
    }

    if (profile.columns.length > MAX_PROFILE_COLUMNS) {
      lines.push(
        `| ... | *${profile.columns.length - MAX_PROFILE_COLUMNS} more columns* | | | |`
      );
    }
  }

  // Quality warnings
  const warnings = getQualityWarnings(profile);
  if (warnings.length > 0) {
    lines.push('\n### Data Quality Notes');
    for (const warning of warnings) {
      lines.push(`- ${warning}`);
    }
  }

  // Other sheets
  const otherSheets = inventory.sheets.filter((s) => !s.isActive);
  if (otherSheets.length > 0) {
    lines.push(
      `\n**Other Sheets:** ${otherSheets.map((s) => `${s.name} (${s.rowCount.toLocaleString()} rows)`).join(', ')}`
    );
  }

  // Usage hint for AI
  lines.push(
    '\n*Use `get_profile`, `select_rows`, or `group_aggregate` to query specific data.*'
  );

  return lines.join('\n');
}

/**
 * Format column info for the profile table.
 */
function formatColumnInfo(col: ColumnProfile): string {
  const parts: string[] = [];

  if (col.stats) {
    parts.push(`Sum: ${formatNum(col.stats.sum)}, Avg: ${formatNum(col.stats.avg)}`);
  } else if (col.uniqueCount > 0) {
    parts.push(`${col.uniqueCount} unique`);
  }

  if (col.samples.length > 0 && col.dataType === 'text') {
    const sampleText = col.samples
      .slice(0, 2)
      .map((s) => escapeMarkdown(String(s).slice(0, 15)))
      .join(', ');
    parts.push(`e.g. ${sampleText}`);
  }

  return parts.join('; ') || '-';
}

/**
 * Get quality warnings from a profile.
 */
function getQualityWarnings(profile: SheetProfile): string[] {
  const warnings: string[] = [];

  for (const col of profile.columns) {
    const header = col.header || col.letter;

    if (col.quality.completeness < 0.9 && col.quality.completeness > 0) {
      const pct = Math.round((1 - col.quality.completeness) * 100);
      warnings.push(`Column ${col.letter} (${header}) has ${pct}% missing values`);
    }
    if (col.quality.hasMixedTypes) {
      warnings.push(`Column ${col.letter} (${header}) has mixed data types`);
    }
    if (col.quality.hasOutliers) {
      warnings.push(`Column ${col.letter} (${header}) contains outliers`);
    }
  }

  return warnings.slice(0, MAX_QUALITY_WARNINGS);
}

/**
 * Escape markdown special characters in a string.
 */
function escapeMarkdown(str: string): string {
  return str.replace(/[|\\`*_{}[\]()#+\-.!]/g, '\\$&');
}
