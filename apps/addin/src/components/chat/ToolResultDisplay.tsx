/**
 * ToolResultDisplay component for rendering read tool results in the chat.
 * Shows data tables, profile summaries, and search results.
 */

import { useState } from 'react';
import {
  makeStyles,
  tokens,
  Text,
  Button,
} from '@fluentui/react-components';
import {
  ChevronDown24Regular,
  ChevronUp24Regular,
} from '@fluentui/react-icons';

const useStyles = makeStyles({
  container: {
    marginTop: tokens.spacingVerticalXS,
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
    paddingTop: tokens.spacingVerticalXS,
  },
  toggleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
  },
  summary: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
  },
  tableWrapper: {
    overflowX: 'auto',
    marginTop: tokens.spacingVerticalXS,
    maxHeight: '200px',
    overflowY: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: tokens.fontSizeBase200,
  },
  th: {
    textAlign: 'left',
    padding: `${tokens.spacingVerticalXXS} ${tokens.spacingHorizontalS}`,
    backgroundColor: tokens.colorNeutralBackground4,
    fontWeight: tokens.fontWeightSemibold,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    whiteSpace: 'nowrap',
  },
  td: {
    padding: `${tokens.spacingVerticalXXS} ${tokens.spacingHorizontalS}`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke3}`,
    maxWidth: '150px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  profileSection: {
    fontSize: tokens.fontSizeBase200,
    lineHeight: tokens.lineHeightBase200,
  },
  profileItem: {
    marginBottom: tokens.spacingVerticalXXS,
  },
  errorText: {
    color: tokens.colorPaletteRedForeground1,
    fontSize: tokens.fontSizeBase200,
  },
});

interface ToolResultDisplayProps {
  toolName: string;
  result: unknown;
}

export function ToolResultDisplay({ toolName, result }: ToolResultDisplayProps) {
  const styles = useStyles();
  const [expanded, setExpanded] = useState(false);

  if (!result) return null;

  const data = result as Record<string, unknown>;
  const summaryText = getSummaryText(toolName, data);

  return (
    <div className={styles.container}>
      <div className={styles.toggleRow}>
        <Button
          appearance="subtle"
          size="small"
          icon={expanded ? <ChevronUp24Regular /> : <ChevronDown24Regular />}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? 'Hide' : 'Show'} results
        </Button>
        <Text className={styles.summary}>{summaryText}</Text>
      </div>
      {expanded && renderResult(toolName, data, styles)}
    </div>
  );
}

/** Get a short summary string for the result. */
function getSummaryText(toolName: string, data: Record<string, unknown>): string {
  switch (toolName) {
    case 'select_rows': {
      const rows = (data.rows as unknown[])?.length ?? 0;
      const total = (data.total as number) ?? rows;
      return `${rows} rows returned (${total} total)`;
    }
    case 'group_aggregate': {
      const groups = (data.groups as unknown[])?.length ?? 0;
      return `${groups} groups`;
    }
    case 'find_outliers': {
      const outliers = (data.outliers as unknown[])?.length ?? 0;
      return `${outliers} outliers found (${data.method})`;
    }
    case 'search_values': {
      const matches = (data.matches as unknown[])?.length ?? 0;
      return `${matches} matches`;
    }
    case 'get_profile': {
      const colCount = (data.columns as unknown[])?.length ?? 0;
      return `${data.rowCount ?? '?'} rows, ${colCount} columns`;
    }
    case 'read_range': {
      const rows = (data.data as unknown[][])?.length ?? 0;
      return `${rows} rows, ${data.columnCount ?? '?'} columns`;
    }
    default:
      return 'Results available';
  }
}

/** Render the full result based on tool type. */
function renderResult(
  toolName: string,
  data: Record<string, unknown>,
  styles: ReturnType<typeof useStyles>
) {
  switch (toolName) {
    case 'select_rows':
      return renderTable(data.rows as Record<string, unknown>[], styles);
    case 'group_aggregate':
      return renderTable(data.groups as Record<string, unknown>[], styles);
    case 'find_outliers':
      return renderOutliers(data, styles);
    case 'search_values':
      return renderTable(data.matches as Record<string, unknown>[], styles);
    case 'get_profile':
      return renderProfile(data, styles);
    case 'read_range':
      return renderRawData(data, styles);
    default:
      return renderJson(data, styles);
  }
}

/** Render array of objects as a table. */
function renderTable(
  rows: Record<string, unknown>[] | undefined,
  styles: ReturnType<typeof useStyles>
) {
  if (!rows || rows.length === 0) {
    return <Text className={styles.summary}>No data</Text>;
  }

  // Get columns from first row, exclude internal fields
  const columns = Object.keys(rows[0]).filter((k) => !k.startsWith('_'));

  return (
    <div className={styles.tableWrapper}>
      <table className={styles.table}>
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col} className={styles.th}>
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {columns.map((col) => (
                <td key={col} className={styles.td} title={String(row[col] ?? '')}>
                  {formatCellValue(row[col])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Render outlier results with stats. */
function renderOutliers(
  data: Record<string, unknown>,
  styles: ReturnType<typeof useStyles>
) {
  const stats = data.stats as { mean: number; stdev: number } | null;

  return (
    <div>
      {stats && (
        <Text className={styles.profileItem} block>
          Mean: {formatNumber(stats.mean)} | Stdev: {formatNumber(stats.stdev)}
        </Text>
      )}
      {renderTable(data.outliers as Record<string, unknown>[], styles)}
    </div>
  );
}

/** Render sheet profile summary. */
function renderProfile(
  data: Record<string, unknown>,
  styles: ReturnType<typeof useStyles>
) {
  const columns = data.columns as Array<{
    header: string;
    dataType: string;
    letter: string;
    stats?: { count: number; min?: number; max?: number };
    uniqueCount?: number;
  }> | undefined;

  return (
    <div className={styles.profileSection}>
      <Text className={styles.profileItem} block>
        Sheet: {String(data.sheetName ?? 'Unknown')} | Rows: {String(data.rowCount ?? '?')} | Used Range: {String(data.usedRange ?? '?')}
      </Text>
      {columns && columns.length > 0 && (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>Col</th>
                <th className={styles.th}>Header</th>
                <th className={styles.th}>Type</th>
                <th className={styles.th}>Unique</th>
              </tr>
            </thead>
            <tbody>
              {columns.map((col, i) => (
                <tr key={i}>
                  <td className={styles.td}>{col.letter}</td>
                  <td className={styles.td}>{col.header ?? '(empty)'}</td>
                  <td className={styles.td}>{col.dataType}</td>
                  <td className={styles.td}>{col.uniqueCount ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Render raw 2D data (for read_range). */
function renderRawData(
  data: Record<string, unknown>,
  styles: ReturnType<typeof useStyles>
) {
  const headers = data.headers as string[] | null;
  const rows = data.data as unknown[][] | undefined;

  if (!rows || rows.length === 0) {
    return <Text className={styles.summary}>No data</Text>;
  }

  return (
    <div className={styles.tableWrapper}>
      <table className={styles.table}>
        {headers && (
          <thead>
            <tr>
              {headers.map((h, i) => (
                <th key={i} className={styles.th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {(row as unknown[]).map((cell, j) => (
                <td key={j} className={styles.td} title={String(cell ?? '')}>
                  {formatCellValue(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Render unknown data as JSON. */
function renderJson(
  data: Record<string, unknown>,
  styles: ReturnType<typeof useStyles>
) {
  return (
    <div className={styles.tableWrapper}>
      <pre style={{ fontSize: tokens.fontSizeBase200, margin: 0 }}>
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}

/** Format a cell value for display. */
function formatCellValue(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'number') return formatNumber(value);
  return String(value);
}

/** Format a number (round to 2 decimals if needed). */
function formatNumber(n: number): string {
  if (Number.isInteger(n)) return n.toLocaleString();
  return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}
