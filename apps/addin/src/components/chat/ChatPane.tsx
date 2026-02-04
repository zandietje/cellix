import { useState, useCallback, useRef } from 'react';
import { makeStyles, tokens, MessageBar, MessageBarBody, MessageBarActions, Button } from '@fluentui/react-components';
import { DismissRegular } from '@fluentui/react-icons';
import { MessageList } from './MessageList';
import { InputBox } from './InputBox';
import { TypingIndicator } from './TypingIndicator';
import { useChatStore } from '@/store/chatStore';
import { useExcelStore } from '@/store/excelStore';
import { streamChat } from '@/lib/api';

const useStyles = makeStyles({
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    minHeight: 0,
    position: 'relative',
    backgroundColor: tokens.colorNeutralBackground1,
  },
  errorBar: {
    flexShrink: 0,
  },
  messagesWrapper: {
    flex: 1,
    minHeight: 0,
    position: 'relative',
  },
  messages: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflowY: 'auto',
    padding: tokens.spacingVerticalM,
  },
  input: {
    flexShrink: 0,
    borderTop: `1px solid ${tokens.colorNeutralStroke1}`,
    padding: tokens.spacingVerticalS,
  },
});

export function ChatPane() {
  const styles = useStyles();
  const { messages, isTyping, addMessage, updateLastAssistantMessage, setTyping } = useChatStore();
  const { context: excelContext } = useExcelStore();

  // Error state for connection/streaming errors
  const [streamError, setStreamError] = useState<string | null>(null);
  const lastMessageRef = useRef<string | null>(null);

  const processStream = useCallback(
    async (content: string) => {
      let fullContent = '';
      const toolCalls: Array<{ id: string; name: string; arguments: string }> = [];

      for await (const event of streamChat(content, excelContext)) {
        switch (event.type) {
          case 'text':
            if (event.content) {
              fullContent += event.content;
              updateLastAssistantMessage(fullContent, toolCalls);
            }
            break;

          case 'tool_call_start':
          case 'tool_call_delta':
            if (event.toolCall) {
              const existingIndex = toolCalls.findIndex((tc) => tc.id === event.toolCall!.id);
              if (existingIndex >= 0) {
                toolCalls[existingIndex] = {
                  id: event.toolCall.id,
                  name: event.toolCall.name,
                  arguments: event.toolCall.arguments,
                };
              } else if (event.toolCall.id) {
                toolCalls.push({
                  id: event.toolCall.id,
                  name: event.toolCall.name,
                  arguments: event.toolCall.arguments,
                });
              }
              updateLastAssistantMessage(fullContent, toolCalls);
            }
            break;

          case 'tool_call_end':
            if (event.toolCall) {
              const existingIndex = toolCalls.findIndex((tc) => tc.id === event.toolCall!.id);
              if (existingIndex >= 0) {
                toolCalls[existingIndex] = {
                  id: event.toolCall.id,
                  name: event.toolCall.name,
                  arguments: event.toolCall.arguments,
                };
              } else {
                toolCalls.push({
                  id: event.toolCall.id,
                  name: event.toolCall.name,
                  arguments: event.toolCall.arguments,
                });
              }
              updateLastAssistantMessage(fullContent, toolCalls);
            }
            break;

          case 'error':
            // AI service error - show in message
            fullContent += `\n\n*Error: ${event.error}*`;
            updateLastAssistantMessage(fullContent, toolCalls);
            break;

          case 'done':
            break;
        }
      }
    },
    [excelContext, updateLastAssistantMessage]
  );

  const handleSend = useCallback(
    async (content: string) => {
      // Clear any previous error
      setStreamError(null);
      lastMessageRef.current = content;

      // Add user message
      addMessage({ role: 'user', content });

      // Create placeholder for assistant response
      addMessage({ role: 'assistant', content: '' });
      setTyping(true);

      try {
        await processStream(content);
      } catch (error) {
        // Connection/network errors - show in error bar with retry option
        const errorMessage = error instanceof Error ? error.message : 'Failed to send message';
        setStreamError(errorMessage);
        updateLastAssistantMessage('*Connection error. See error message above.*', []);
      } finally {
        setTyping(false);
      }
    },
    [addMessage, setTyping, processStream, updateLastAssistantMessage]
  );

  const handleRetry = useCallback(async () => {
    if (!lastMessageRef.current) return;

    setStreamError(null);
    setTyping(true);

    // Update the last assistant message to show retry in progress
    updateLastAssistantMessage('', []);

    try {
      await processStream(lastMessageRef.current);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to send message';
      setStreamError(errorMessage);
      updateLastAssistantMessage('*Connection error. See error message above.*', []);
    } finally {
      setTyping(false);
    }
  }, [processStream, setTyping, updateLastAssistantMessage]);

  const handleDismissError = useCallback(() => {
    setStreamError(null);
  }, []);

  return (
    <div className={styles.container}>
      {streamError && (
        <div className={styles.errorBar}>
          <MessageBar intent="error">
            <MessageBarBody>{streamError}</MessageBarBody>
            <MessageBarActions
              containerAction={
                <Button
                  aria-label="dismiss"
                  appearance="transparent"
                  icon={<DismissRegular />}
                  onClick={handleDismissError}
                />
              }
            >
              <Button size="small" onClick={handleRetry} disabled={isTyping}>
                Retry
              </Button>
            </MessageBarActions>
          </MessageBar>
        </div>
      )}
      <div className={styles.messagesWrapper}>
        <div className={styles.messages}>
          <MessageList messages={messages} />
          {isTyping && <TypingIndicator />}
        </div>
      </div>
      <div className={styles.input}>
        <InputBox onSend={handleSend} disabled={isTyping} />
      </div>
    </div>
  );
}
