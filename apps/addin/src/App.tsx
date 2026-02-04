import { makeStyles, tokens } from '@fluentui/react-components';
import { TabNavigation } from './components/common/TabNavigation';
import { ChatPane } from './components/chat/ChatPane';
import { ControlPanel } from './components/controls/ControlPanel';
import { Loading } from './components/common/Loading';
import { useUIStore } from './store/uiStore';

const useStyles = makeStyles({
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    backgroundColor: tokens.colorNeutralBackground1,
  },
  content: {
    flex: 1,
    minHeight: 0, // Required for flex children to shrink and enable scrolling
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  chatArea: {
    flex: 1,
    minHeight: 0, // Required for flex children to shrink and enable scrolling
    overflow: 'hidden',
  },
  notInitialized: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    padding: tokens.spacingHorizontalXL,
    textAlign: 'center',
    color: tokens.colorNeutralForeground3,
  },
});

interface AppProps {
  isOfficeInitialized: boolean;
}

export default function App({ isOfficeInitialized }: AppProps) {
  const styles = useStyles();
  const { activeTab } = useUIStore();

  if (!isOfficeInitialized) {
    return (
      <div className={styles.container}>
        <Loading message="Connecting to Excel..." />
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <TabNavigation />
      <div className={styles.content}>
        {activeTab === 'chat' && (
          <>
            <ControlPanel />
            <div className={styles.chatArea}>
              <ChatPane />
            </div>
          </>
        )}
        {activeTab === 'settings' && (
          <div className={styles.notInitialized}>
            Settings panel coming in a future release.
          </div>
        )}
      </div>
    </div>
  );
}
