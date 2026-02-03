import { makeStyles, tokens } from '@fluentui/react-components';
import { MessageList } from './MessageList';
import { InputBox } from './InputBox';
import { TypingIndicator } from './TypingIndicator';
import { useChatStore } from '@/store/chatStore';

const useStyles = makeStyles({
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    backgroundColor: tokens.colorNeutralBackground1,
  },
  messages: {
    flex: 1,
    overflow: 'auto',
    padding: tokens.spacingVerticalM,
  },
  input: {
    borderTop: `1px solid ${tokens.colorNeutralStroke1}`,
    padding: tokens.spacingVerticalS,
  },
});

export function ChatPane() {
  const styles = useStyles();
  const { messages, isTyping, addMessage, setTyping } = useChatStore();

  const handleSend = async (content: string) => {
    addMessage({ role: 'user', content });

    // TODO: Phase 3 - Send to backend and get AI response
    // For now, just echo back
    setTyping(true);
    setTimeout(() => {
      addMessage({
        role: 'assistant',
        content: `I received your message: "${content}". AI integration coming in Phase 3!`,
      });
      setTyping(false);
    }, 1000);
  };

  return (
    <div className={styles.container}>
      <div className={styles.messages}>
        <MessageList messages={messages} />
        {isTyping && <TypingIndicator />}
      </div>
      <div className={styles.input}>
        <InputBox onSend={handleSend} disabled={isTyping} />
      </div>
    </div>
  );
}
