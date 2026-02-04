/**
 * Control panel for Excel context management.
 * Allows users to refresh and view the current Excel selection context.
 */

import { makeStyles, tokens, Button, Text, Spinner } from '@fluentui/react-components';
import { ArrowSync24Regular } from '@fluentui/react-icons';
import { useExcelContext } from '../../hooks/useExcelContext';
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
});

export function ControlPanel() {
  const styles = useStyles();
  const { context, isLoading, error, refresh } = useExcelContext();

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <Text className={styles.title}>Excel Context</Text>
        <div className={styles.actions}>
          <Button
            appearance="subtle"
            icon={isLoading ? <Spinner size="tiny" /> : <ArrowSync24Regular />}
            onClick={refresh}
            disabled={isLoading}
          >
            {isLoading ? 'Loading...' : 'Refresh'}
          </Button>
        </div>
      </div>

      {error && (
        <Text className={styles.error} size={200}>
          {error}
        </Text>
      )}

      {context ? (
        <ContextDisplay context={context} />
      ) : !isLoading && !error ? (
        <Text size={200} className={styles.placeholder}>
          Click "Refresh" to load the current Excel selection.
        </Text>
      ) : null}
    </div>
  );
}
