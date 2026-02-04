/**
 * Displays the current Excel context in a compact, readable format.
 * Shows selection info, size, warnings for large ranges, and basic stats.
 */

import { makeStyles, tokens, Text, Badge, Tooltip } from '@fluentui/react-components';
import { Warning16Regular } from '@fluentui/react-icons';
import type { ExcelContextFull } from '@cellix/shared';
import { SAFETY_LIMITS } from '../../lib/constants';

const useStyles = makeStyles({
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
  },
  label: {
    color: tokens.colorNeutralForeground3,
    minWidth: '70px',
  },
  value: {
    fontFamily: tokens.fontFamilyMonospace,
  },
  warning: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    color: tokens.colorPaletteYellowForeground1,
    marginTop: tokens.spacingVerticalXS,
  },
  stats: {
    marginTop: tokens.spacingVerticalS,
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
  },
});

interface ContextDisplayProps {
  context: ExcelContextFull;
}

export function ContextDisplay({ context }: ContextDisplayProps) {
  const styles = useStyles();
  const totalCells = context.selection.rowCount * context.selection.columnCount;
  const isLarge = totalCells > SAFETY_LIMITS.CONFIRM_THRESHOLD_CELLS;

  return (
    <div className={styles.container}>
      <div className={styles.row}>
        <Text size={200} className={styles.label}>
          Selection:
        </Text>
        <Text size={200} className={styles.value}>
          {context.selection.address}
        </Text>
      </div>

      <div className={styles.row}>
        <Text size={200} className={styles.label}>
          Size:
        </Text>
        <Text size={200}>
          {context.selection.rowCount} rows x {context.selection.columnCount} cols (
          {totalCells.toLocaleString()} cells)
        </Text>
        {isLarge && (
          <Tooltip
            content="Large selections may require confirmation for write operations"
            relationship="label"
          >
            <Badge appearance="filled" color="warning" size="small">
              Large
            </Badge>
          </Tooltip>
        )}
      </div>

      <div className={styles.row}>
        <Text size={200} className={styles.label}>
          Sheet:
        </Text>
        <Text size={200}>{context.activeSheet}</Text>
      </div>

      {context.selection.sampled && (
        <div className={styles.warning}>
          <Warning16Regular />
          <Text size={200}>
            Showing first {SAFETY_LIMITS.MAX_CONTEXT_ROWS} of{' '}
            {context.selection.originalRowCount} rows
          </Text>
        </div>
      )}

      {context.stats.numericColumns.length > 0 && (
        <div className={styles.stats}>
          {context.stats.numericColumns.slice(0, 3).map((col) => (
            <div key={col.column}>
              <Text size={200}>
                {col.header}: Sum={formatCompact(col.sum)}, Avg={formatCompact(col.avg)}
              </Text>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Formats a number in compact notation (K, M, B).
 */
function formatCompact(n: number): string {
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return n.toFixed(Number.isInteger(n) ? 0 : 2);
}
