import { makeStyles, tokens } from '@fluentui/react-components';
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

  const handleSend = async (content: string) => {
    // Add user message
    addMessage({ role: 'user', content });

    // Create placeholder for assistant response
    addMessage({ role: 'assistant', content: '' });
    setTyping(true);

    try {
      let fullContent = '';
      const toolCalls: Array<{ id: string; name: string; arguments: string }> = [];

      // Stream the response from the backend
      for await (const event of streamChat(content, excelContext)) {
        switch (event.type) {
          case 'text':
            // Accumulate text content
            if (event.content) {
              fullContent += event.content;
              updateLastAssistantMessage(fullContent, toolCalls);
            }
            break;

          case 'tool_call_start':
          case 'tool_call_delta':
            // Tool call is being built - update accumulator
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
            // Tool call is complete - update with final data
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
            // Display error in the message
            fullContent += `\n\n*Error: ${event.error}*`;
            updateLastAssistantMessage(fullContent, toolCalls);
            break;

          case 'done':
            // Stream complete
            break;
        }
      }
    } catch (error) {
      // Handle fetch/network errors
      const errorMessage = error instanceof Error ? error.message : 'Failed to send message';
      updateLastAssistantMessage(`*Error: ${errorMessage}*`, []);
    } finally {
      setTyping(false);
    }
  };

  return (
    <div className={styles.container}>
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
