/**
 * PreviewPanel component for managing pending tool call executions.
 * Displays all pending actions with approve/reject controls.
 */

import { useCallback, useState } from 'react';
import {
  makeStyles,
  tokens,
  Text,
  Button,
  Spinner,
  Dialog,
  DialogSurface,
  DialogTitle,
  DialogBody,
  DialogContent,
  DialogActions,
} from '@fluentui/react-components';
import {
  CheckmarkCircle24Regular,
  DismissCircle24Regular,
  Play24Regular,
  Warning24Regular,
} from '@fluentui/react-icons';
import { usePreviewStore } from '../../store/previewStore';
import { useChatStore } from '../../store/chatStore';
import { executeApprovedActions, cancelToolCall } from '../../lib/tools/executor';
import { ActionCard } from './ActionCard';

const useStyles = makeStyles({
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    borderLeft: `1px solid ${tokens.colorNeutralStroke1}`,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  header: {
    padding: tokens.spacingVerticalS,
    backgroundColor: tokens.colorNeutralBackground2,
    borderBottom: `1px solid ${tokens.colorNeutralStroke1}`,
  },
  title: {
    fontWeight: tokens.fontWeightSemibold,
    marginBottom: tokens.spacingVerticalXS,
  },
  subtitle: {
    color: tokens.colorNeutralForeground3,
  },
  content: {
    flex: 1,
    minHeight: 0, // Required for flex children to shrink and enable scrolling
    overflowY: 'auto',
    padding: tokens.spacingVerticalS,
  },
  footer: {
    padding: tokens.spacingVerticalS,
    borderTop: `1px solid ${tokens.colorNeutralStroke1}`,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  footerActions: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalXS,
    justifyContent: 'flex-end',
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    color: tokens.colorNeutralForeground3,
    padding: tokens.spacingVerticalXL,
    textAlign: 'center',
  },
  executingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    zIndex: 10,
  },
  confirmContent: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: tokens.spacingHorizontalM,
  },
  confirmIcon: {
    color: tokens.colorPaletteYellowForeground1,
    flexShrink: 0,
  },
});

export function PreviewPanel() {
  const styles = useStyles();
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  const {
    pendingActions,
    isExecuting,
    approveAction,
    rejectAction,
    approveAll,
    rejectAll,
    setExecuting,
    addExecutionResult,
    removePendingAction,
    updatePreviewStatus,
  } = usePreviewStore();

  const { updateToolCallStatus } = useChatStore();

  // Count pending actions that need confirmation
  const validActions = pendingActions.filter((p) => p.validation.valid);
  const approvedActions = pendingActions.filter((p) => p.toolCall.status === 'preview');

  const handleApprove = useCallback(
    (toolCallId: string) => {
      approveAction(toolCallId);
      updateToolCallStatus(toolCallId, 'preview'); // Sync status to chatStore
    },
    [approveAction, updateToolCallStatus]
  );

  const handleReject = useCallback(
    (toolCallId: string) => {
      const preview = pendingActions.find((p) => p.toolCall.id === toolCallId);
      if (preview) {
        cancelToolCall(preview.toolCall);
        updateToolCallStatus(preview.toolCall.id, 'cancelled');
      }
      rejectAction(toolCallId);
    },
    [pendingActions, rejectAction, updateToolCallStatus]
  );

  const handleRejectAll = useCallback(() => {
    for (const preview of pendingActions) {
      cancelToolCall(preview.toolCall);
      updateToolCallStatus(preview.toolCall.id, 'cancelled');
    }
    rejectAll();
  }, [pendingActions, rejectAll, updateToolCallStatus]);

  const handleApproveAll = useCallback(() => {
    for (const preview of pendingActions) {
      if (preview.validation.valid) {
        updateToolCallStatus(preview.toolCall.id, 'preview'); // Sync status to chatStore
      }
    }
    approveAll();
  }, [pendingActions, approveAll, updateToolCallStatus]);

  const handleExecute = useCallback(async () => {
    // Check if any require confirmation
    const toExecute = approvedActions.length > 0 ? approvedActions : validActions;

    const needsConfirmation = toExecute.some((p) => p.requiresConfirmation);
    if (needsConfirmation && !showConfirmDialog) {
      setShowConfirmDialog(true);
      return;
    }

    setShowConfirmDialog(false);
    setExecuting(true);

    try {
      const results = await executeApprovedActions(toExecute, (result, index) => {
        addExecutionResult(result);
        const preview = toExecute[index];

        // Update tool call status based on result
        if (result.success) {
          updatePreviewStatus(preview.toolCall.id, 'executed');
          updateToolCallStatus(preview.toolCall.id, 'executed');
        } else {
          updatePreviewStatus(preview.toolCall.id, 'error');
          updateToolCallStatus(preview.toolCall.id, 'error');
        }

        // Remove from pending after execution
        removePendingAction(preview.toolCall.id);
      });

      // Log overall results
      const successCount = results.filter((r) => r.success).length;
      const errorCount = results.filter((r) => !r.success).length;
      console.log(
        `[Preview] Execution complete: ${successCount} succeeded, ${errorCount} failed`
      );
    } finally {
      setExecuting(false);
    }
  }, [
    approvedActions,
    validActions,
    showConfirmDialog,
    setExecuting,
    addExecutionResult,
    updatePreviewStatus,
    updateToolCallStatus,
    removePendingAction,
  ]);

  const handleConfirmExecute = useCallback(() => {
    handleExecute();
  }, [handleExecute]);

  const handleCancelConfirm = useCallback(() => {
    setShowConfirmDialog(false);
  }, []);

  // Calculate total cells for confirmation dialog
  const totalCells = pendingActions.reduce((sum, p) => sum + p.cellCount, 0);

  if (pendingActions.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.emptyState}>
          <Text>No pending actions</Text>
          <Text size={200}>
            When the AI suggests changes to your Excel data, they will appear here for review.
          </Text>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container} style={{ position: 'relative' }}>
      {isExecuting && (
        <div className={styles.executingOverlay}>
          <Spinner size="medium" />
          <Text>Executing changes...</Text>
        </div>
      )}

      <div className={styles.header}>
        <Text className={styles.title}>Pending Actions</Text>
        <Text className={styles.subtitle} size={200}>
          {pendingActions.length} action{pendingActions.length !== 1 ? 's' : ''} waiting for review
        </Text>
      </div>

      <div className={styles.content}>
        {pendingActions.map((preview) => (
          <ActionCard
            key={preview.toolCall.id}
            preview={preview}
            onApprove={handleApprove}
            onReject={handleReject}
            disabled={isExecuting}
          />
        ))}
      </div>

      <div className={styles.footer}>
        <div className={styles.footerActions}>
          <Button
            appearance="subtle"
            size="small"
            icon={<DismissCircle24Regular />}
            onClick={handleRejectAll}
            disabled={isExecuting}
          >
            Reject All
          </Button>

          {approvedActions.length === 0 && validActions.length > 0 && (
            <Button
              appearance="subtle"
              size="small"
              icon={<CheckmarkCircle24Regular />}
              onClick={handleApproveAll}
              disabled={isExecuting}
            >
              Approve All
            </Button>
          )}

          <Button
            appearance="primary"
            size="small"
            icon={<Play24Regular />}
            onClick={handleExecute}
            disabled={isExecuting || validActions.length === 0}
          >
            Execute{approvedActions.length > 0 ? ` (${approvedActions.length})` : ''}
          </Button>
        </div>
      </div>

      {/* Confirmation Dialog for large operations */}
      <Dialog open={showConfirmDialog} onOpenChange={(_, data) => !data.open && handleCancelConfirm()}>
        <DialogSurface>
          <DialogTitle>Confirm Execution</DialogTitle>
          <DialogBody>
            <DialogContent>
              <div className={styles.confirmContent}>
                <Warning24Regular className={styles.confirmIcon} />
                <div>
                  <Text block weight="semibold">
                    This operation will modify {totalCells} cells
                  </Text>
                  <Text block style={{ marginTop: tokens.spacingVerticalS }}>
                    Are you sure you want to proceed? This action cannot be undone within Cellix
                    (use Excel's Ctrl+Z to undo).
                  </Text>
                </div>
              </div>
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={handleCancelConfirm}>
                Cancel
              </Button>
              <Button appearance="primary" onClick={handleConfirmExecute}>
                Execute
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
}
