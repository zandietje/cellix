import { makeStyles, Text, tokens, mergeClasses } from '@fluentui/react-components';
import type { ChatMessage } from '@cellix/shared';
import { ToolCallCard } from './ToolCallCard';

const useStyles = makeStyles({
  container: {
    display: 'flex',
    marginBottom: tokens.spacingVerticalXS,
  },
  userContainer: {
    justifyContent: 'flex-end',
  },
  assistantContainer: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '85%',
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    borderRadius: tokens.borderRadiusMedium,
  },
  userBubble: {
    backgroundColor: tokens.colorBrandBackground,
    color: tokens.colorNeutralForegroundOnBrand,
  },
  assistantBubble: {
    backgroundColor: tokens.colorNeutralBackground3,
    color: tokens.colorNeutralForeground1,
  },
  content: {
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  timestamp: {
    display: 'block',
    fontSize: tokens.fontSizeBase100,
    marginTop: tokens.spacingVerticalXS,
    opacity: 0.7,
  },
  toolCalls: {
    marginTop: tokens.spacingVerticalS,
  },
});

interface MessageBubbleProps {
  message: ChatMessage;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const styles = useStyles();
  const isUser = message.role === 'user';

  const containerClass = mergeClasses(
    styles.container,
    isUser ? styles.userContainer : styles.assistantContainer
  );

  const bubbleClass = mergeClasses(
    styles.bubble,
    isUser ? styles.userBubble : styles.assistantBubble
  );

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const hasToolCalls = message.toolCalls && message.toolCalls.length > 0;

  return (
    <div className={containerClass}>
      <div className={bubbleClass}>
        {message.content && <Text className={styles.content}>{message.content}</Text>}

        {hasToolCalls && (
          <div className={styles.toolCalls}>
            {message.toolCalls!.map((toolCall) => (
              <ToolCallCard key={toolCall.id} toolCall={toolCall} />
            ))}
          </div>
        )}

        <Text className={styles.timestamp}>{formatTime(message.timestamp)}</Text>
      </div>
    </div>
  );
}
