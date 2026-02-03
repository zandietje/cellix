import { useEffect, useRef } from 'react';
import { makeStyles, Text, tokens } from '@fluentui/react-components';
import { MessageBubble } from './MessageBubble';
import type { ChatMessage } from '@cellix/shared';

const useStyles = makeStyles({
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
  },
  empty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    color: tokens.colorNeutralForeground3,
    textAlign: 'center',
    padding: tokens.spacingHorizontalXL,
  },
  emptyTitle: {
    marginBottom: tokens.spacingVerticalS,
  },
});

interface MessageListProps {
  messages: ChatMessage[];
}

export function MessageList({ messages }: MessageListProps) {
  const styles = useStyles();
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className={styles.empty}>
        <Text size={500} weight="semibold" className={styles.emptyTitle}>
          Welcome to Cellix
        </Text>
        <Text size={300}>
          Ask me about your Shopee or Lazada data, and I'll help you analyze it.
        </Text>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
