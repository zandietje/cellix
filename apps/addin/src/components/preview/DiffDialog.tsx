/**
 * DiffDialog component for showing before/after cell values.
 * Displays a table with current and new values, highlighting overwrites.
 */

import {
  makeStyles,
  tokens,
  Dialog,
  DialogSurface,
  DialogTitle,
  DialogBody,
  DialogContent,
  DialogActions,
  Button,
  Badge,
  Text,
} from '@fluentui/react-components';
import { Dismiss24Regular } from '@fluentui/react-icons';
import type { CellChange } from '../../lib/tools/types';

const useStyles = makeStyles({
  surface: {
    maxWidth: '500px',
    maxHeight: '80vh',
  },
  content: {
    overflowY: 'auto',
    maxHeight: '400px',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: tokens.fontSizeBase200,
  },
  th: {
    textAlign: 'left',
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`,
    backgroundColor: tokens.colorNeutralBackground3,
    borderBottom: `1px solid ${tokens.colorNeutralStroke1}`,
    fontWeight: tokens.fontWeightSemibold,
  },
  td: {
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    verticalAlign: 'top',
  },
  cellAddress: {
    fontFamily: 'monospace',
    whiteSpace: 'nowrap',
  },
  cellValue: {
    maxWidth: '120px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  overwriteRow: {
    backgroundColor: tokens.colorPaletteYellowBackground2,
  },
  emptyValue: {
    color: tokens.colorNeutralForeground4,
    fontStyle: 'italic',
  },
  badge: {
    marginLeft: tokens.spacingHorizontalXS,
  },
  summary: {
    marginBottom: tokens.spacingVerticalM,
  },
});

interface DiffDialogProps {
  open: boolean;
  onClose: () => void;
  changes: CellChange[];
  toolName: string;
  address: string;
}

export function DiffDialog({ open, onClose, changes, toolName, address }: DiffDialogProps) {
  const styles = useStyles();

  const overwriteCount = changes.filter((c) => c.isOverwrite).length;
  const totalChanges = changes.length;

  // Format value for display
  const formatValue = (value: unknown): string => {
    if (value === null || value === undefined || value === '') {
      return '(empty)';
    }
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    return String(value);
  };

  // Check if value is empty
  const isEmpty = (value: unknown): boolean => {
    return value === null || value === undefined || value === '';
  };

  return (
    <Dialog open={open} onOpenChange={(_, data) => !data.open && onClose()}>
      <DialogSurface className={styles.surface}>
        <DialogTitle
          action={
            <Button
              appearance="subtle"
              aria-label="close"
              icon={<Dismiss24Regular />}
              onClick={onClose}
            />
          }
        >
          Cell Changes
        </DialogTitle>

        <DialogBody>
          <DialogContent className={styles.content}>
            <div className={styles.summary}>
              <Text>
                <strong>{toolName.replace(/_/g, ' ')}</strong> will modify{' '}
                <strong>{totalChanges}</strong> cell{totalChanges !== 1 ? 's' : ''} at{' '}
                <strong>{address}</strong>
              </Text>
              {overwriteCount > 0 && (
                <Text block style={{ color: tokens.colorPaletteYellowForeground1 }}>
                  {overwriteCount} cell{overwriteCount !== 1 ? 's' : ''} with existing data will be
                  overwritten
                </Text>
              )}
            </div>

            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.th}>Cell</th>
                  <th className={styles.th}>Current</th>
                  <th className={styles.th}>New</th>
                </tr>
              </thead>
              <tbody>
                {changes.slice(0, 50).map((change, index) => (
                  <tr
                    key={index}
                    className={change.isOverwrite ? styles.overwriteRow : undefined}
                  >
                    <td className={`${styles.td} ${styles.cellAddress}`}>
                      {change.address}
                      {change.isOverwrite && (
                        <Badge
                          className={styles.badge}
                          appearance="filled"
                          color="warning"
                          size="small"
                        >
                          overwrite
                        </Badge>
                      )}
                    </td>
                    <td
                      className={`${styles.td} ${styles.cellValue} ${isEmpty(change.currentValue) ? styles.emptyValue : ''}`}
                      title={formatValue(change.currentValue)}
                    >
                      {formatValue(change.currentValue)}
                    </td>
                    <td
                      className={`${styles.td} ${styles.cellValue}`}
                      title={formatValue(change.newValue)}
                    >
                      {formatValue(change.newValue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {changes.length > 50 && (
              <Text size={200} style={{ marginTop: tokens.spacingVerticalS, display: 'block' }}>
                Showing first 50 of {changes.length} changes...
              </Text>
            )}
          </DialogContent>

          <DialogActions>
            <Button appearance="secondary" onClick={onClose}>
              Close
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
