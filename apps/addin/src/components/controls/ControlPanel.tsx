/**
 * Control panel for Excel context management.
 * Allows users to refresh and view the current Excel selection context.
 */

import { makeStyles, tokens, Button, Text, Spinner, ProgressBar } from '@fluentui/react-components';
import { ArrowSync24Regular, ChatAdd24Regular } from '@fluentui/react-icons';
import { useExcelContext } from '../../hooks/useExcelContext';
import { useExcelStore } from '../../store/excelStore';
import { useChatStore } from '../../store/chatStore';
import { ContextDisplay } from './ContextDisplay';

const useStyles = makeStyles({
  container: {
    padding: tokens.spacingVerticalM,
    backgroundColor: tokens.colorNeutralBackground2,
    borderBottom: `1px solid ${tokens.colorNeutralStroke1}`,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: tokens.spacingVerticalS,
  },
  title: {
    fontWeight: tokens.fontWeightSemibold,
  },
  actions: {
    display: 'flex',
    gap: tokens.spacingHorizontalS,
  },
  error: {
    color: tokens.colorPaletteRedForeground1,
    marginTop: tokens.spacingVerticalS,
  },
  placeholder: {
    color: tokens.colorNeutralForeground3,
  },
  progressContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    marginTop: tokens.spacingVerticalS,
    marginBottom: tokens.spacingVerticalS,
  },
  progressLabel: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});

export function ControlPanel() {
  const styles = useStyles();
  const { context, isLoading, error, refresh } = useExcelContext();
  const { isProfileLoading, profilingProgress } = useExcelStore();
  const { startNewSession, isTyping } = useChatStore();

  const showProgress = isProfileLoading && profilingProgress < 1;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <Text className={styles.title}>Excel Context</Text>
        <div className={styles.actions}>
          <Button
            appearance="subtle"
            icon={<ChatAdd24Regular />}
            onClick={startNewSession}
            disabled={isTyping}
          >
            New Chat
          </Button>
          <Button
            appearance="subtle"
            icon={isLoading ? <Spinner size="tiny" /> : <ArrowSync24Regular />}
            onClick={refresh}
            disabled={isLoading || isProfileLoading}
          >
            {isLoading ? 'Loading...' : 'Refresh'}
          </Button>
        </div>
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

      {error && (
        <Text className={styles.error} size={200}>
          {error}
        </Text>
      )}

      {context ? (
        <ContextDisplay context={context} />
      ) : !isLoading && !error && !showProgress ? (
        <Text size={200} className={styles.placeholder}>
          Click "Refresh" to load the current Excel selection.
        </Text>
      ) : null}
    </div>
  );
}
