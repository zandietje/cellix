import { makeStyles, Tab, TabList, tokens } from '@fluentui/react-components';
import { Chat24Regular, Settings24Regular } from '@fluentui/react-icons';
import { useUIStore, TabId } from '@/store/uiStore';

const useStyles = makeStyles({
  container: {
    borderBottom: `1px solid ${tokens.colorNeutralStroke1}`,
    backgroundColor: tokens.colorNeutralBackground2,
  },
});

export function TabNavigation() {
  const styles = useStyles();
  const { activeTab, setActiveTab } = useUIStore();

  return (
    <div className={styles.container}>
      <TabList
        selectedValue={activeTab}
        onTabSelect={(_, data) => setActiveTab(data.value as TabId)}
      >
        <Tab value="chat" icon={<Chat24Regular />}>
          Chat
        </Tab>
        <Tab value="settings" icon={<Settings24Regular />}>
          Settings
        </Tab>
      </TabList>
    </div>
  );
}
