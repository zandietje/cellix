/**
 * ActionCard component for displaying a single pending tool call.
 * Shows tool name, affected range, cell count, warnings, and action buttons.
 */

import { useState } from 'react';
import {
  makeStyles,
  tokens,
  Card,
  CardHeader,
  Text,
  Button,
  Badge,
  Tooltip,
} from '@fluentui/react-components';
import {
  CheckmarkCircle24Regular,
  DismissCircle24Regular,
  Eye24Regular,
  Warning24Regular,
} from '@fluentui/react-icons';
import type { PreviewData } from '../../lib/tools/types';
import { formatToolName } from '../../lib/formatters';
import { DiffDialog } from './DiffDialog';

const useStyles = makeStyles({
  card: {
    marginBottom: tokens.spacingVerticalS,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    flexWrap: 'wrap',
  },
  toolName: {
    fontWeight: tokens.fontWeightSemibold,
    textTransform: 'capitalize',
    fontSize: tokens.fontSizeBase200,
  },
  content: {
    padding: `0 ${tokens.spacingHorizontalS} ${tokens.spacingVerticalS}`,
  },
  detailRow: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    marginBottom: tokens.spacingVerticalXS,
  },
  label: {
    color: tokens.colorNeutralForeground3,
    minWidth: '70px',
  },
  warnings: {
    marginTop: tokens.spacingVerticalS,
  },
  warningItem: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: tokens.spacingHorizontalXS,
    color: tokens.colorPaletteYellowForeground1,
    marginBottom: tokens.spacingVerticalXXS,
  },
  warningIcon: {
    marginTop: '2px',
  },
  reason: {
    marginTop: tokens.spacingVerticalS,
    padding: tokens.spacingVerticalS,
    backgroundColor: tokens.colorNeutralBackground3,
    borderRadius: tokens.borderRadiusSmall,
    fontStyle: 'italic',
  },
  actions: {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: tokens.spacingHorizontalXS,
    marginTop: tokens.spacingVerticalM,
  },
  errorCard: {
    borderLeft: `3px solid ${tokens.colorPaletteRedBorder1}`,
  },
  warningCard: {
    borderLeft: `3px solid ${tokens.colorPaletteYellowBorder1}`,
  },
});

interface ActionCardProps {
  preview: PreviewData;
  onApprove: (toolCallId: string) => void;
  onReject: (toolCallId: string) => void;
  disabled?: boolean;
}

export function ActionCard({ preview, onApprove, onReject, disabled }: ActionCardProps) {
  const styles = useStyles();
  const [showDiff, setShowDiff] = useState(false);

  const { toolCall, affectedRange, cellCount, changes, warnings, validation, reason } = preview;
  const hasErrors = !validation.valid;
  const hasWarnings = warnings.length > 0;

  // Get card style based on state
  const cardClassName = hasErrors
    ? `${styles.card} ${styles.errorCard}`
    : hasWarnings
      ? `${styles.card} ${styles.warningCard}`
      : styles.card;

  return (
    <>
      <Card className={cardClassName}>
        <CardHeader
          header={
            <div className={styles.header}>
              <Text className={styles.toolName}>{formatToolName(toolCall.name)}</Text>
              {hasErrors && (
                <Badge appearance="filled" color="danger">
                  Invalid
                </Badge>
              )}
              {!hasErrors && preview.requiresConfirmation && (
                <Badge appearance="filled" color="warning">
                  Confirmation Required
                </Badge>
              )}
              {toolCall.status === 'preview' && (
                <Badge appearance="filled" color="success">
                  Approved
                </Badge>
              )}
            </div>
          }
        />

        <div className={styles.content}>
          {affectedRange && (
            <div className={styles.detailRow}>
              <Text size={200} className={styles.label}>
                Range:
              </Text>
              <Text size={200}>{affectedRange}</Text>
            </div>
          )}

          <div className={styles.detailRow}>
            <Text size={200} className={styles.label}>
              Cells:
            </Text>
            <Text size={200}>{cellCount}</Text>
          </div>

          {reason && (
            <div className={styles.reason}>
              <Text size={200} weight="semibold">Why: </Text>
              <Text size={200}>{reason}</Text>
            </div>
          )}

          {(hasErrors || hasWarnings) && (
            <div className={styles.warnings}>
              {validation.errors.map((error, i) => (
                <div key={`error-${i}`} className={styles.warningItem}>
                  <DismissCircle24Regular
                    className={styles.warningIcon}
                    style={{ color: tokens.colorPaletteRedForeground1 }}
                  />
                  <Text size={200} style={{ color: tokens.colorPaletteRedForeground1 }}>
                    {error.message}
                  </Text>
                </div>
              ))}
              {warnings
                .filter((w) => !validation.errors.some((e) => e.message === w))
                .map((warning, i) => (
                  <div key={`warning-${i}`} className={styles.warningItem}>
                    <Warning24Regular className={styles.warningIcon} />
                    <Text size={200}>{warning}</Text>
                  </div>
                ))}
            </div>
          )}

          <div className={styles.actions}>
            {changes.length > 0 && (
              <Tooltip content="View cell changes" relationship="label">
                <Button
                  appearance="subtle"
                  size="small"
                  icon={<Eye24Regular />}
                  onClick={() => setShowDiff(true)}
                  disabled={disabled}
                >
                  View
                </Button>
              </Tooltip>
            )}

            <Button
              appearance="subtle"
              size="small"
              icon={<DismissCircle24Regular />}
              onClick={() => onReject(toolCall.id)}
              disabled={disabled}
            >
              Reject
            </Button>

            <Button
              appearance="primary"
              size="small"
              icon={<CheckmarkCircle24Regular />}
              onClick={() => onApprove(toolCall.id)}
              disabled={disabled || hasErrors}
            >
              Approve
            </Button>
          </div>
        </div>
      </Card>

      {showDiff && (
        <DiffDialog
          open={showDiff}
          onClose={() => setShowDiff(false)}
          changes={changes}
          toolName={toolCall.name}
          address={affectedRange}
        />
      )}
    </>
  );
}
