/**
 * Control panel with model selector and new chat button.
 * Excel context is loaded automatically in the background.
 */

import { makeStyles, tokens, Button, Text, Spinner, ProgressBar } from '@fluentui/react-components';
import { ChatAdd24Regular } from '@fluentui/react-icons';
import { useExcelContext } from '../../hooks/useExcelContext';
import { useExcelStore } from '../../store/excelStore';
import { useChatStore } from '../../store/chatStore';

const useStyles = makeStyles({
  container: {
    padding: tokens.spacingVerticalS,
    paddingLeft: tokens.spacingHorizontalM,
    paddingRight: tokens.spacingHorizontalM,
    backgroundColor: tokens.colorNeutralBackground2,
    borderBottom: `1px solid ${tokens.colorNeutralStroke1}`,
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: tokens.spacingHorizontalS,
  },
  progressContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    marginTop: tokens.spacingVerticalXS,
  },
  progressLabel: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  error: {
    color: tokens.colorPaletteRedForeground1,
    marginTop: tokens.spacingVerticalXS,
  },
  contextInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    marginTop: tokens.spacingVerticalXS,
  },
});

export function ControlPanel() {
  const styles = useStyles();
  // Auto-refresh context on selection change (no manual refresh needed)
  const { isLoading, error } = useExcelContext({ autoRefresh: true });
  const { isProfileLoading, profilingProgress } = useExcelStore();
  const { startNewSession, isTyping } = useChatStore();

  const showProgress = isProfileLoading && profilingProgress < 1;

  return (
    <div className={styles.container}>
      <div className={styles.row}>
        <Button
          appearance="subtle"
          size="small"
          icon={<ChatAdd24Regular />}
          onClick={startNewSession}
          disabled={isTyping}
        >
          New Chat
        </Button>
      </div>

      {showProgress && (
        <div className={styles.progressContainer}>
          <div className={styles.progressLabel}>
            <Text size={200}>Analyzing sheet...</Text>
            <Text size={100}>{Math.round(profilingProgress * 100)}%</Text>
          </div>
          <ProgressBar value={profilingProgress} max={1} thickness="medium" />
        </div>
      )}

      {isLoading && !showProgress && (
        <div className={styles.contextInfo}>
          <Spinner size="extra-tiny" />
          <Text size={100}>Updating context...</Text>
        </div>
      )}

      {error && (
        <Text className={styles.error} size={200}>
          {error}
        </Text>
      )}
    </div>
  );
}
