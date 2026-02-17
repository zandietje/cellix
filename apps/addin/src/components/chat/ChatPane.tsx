import { useState, useCallback, useRef } from 'react';
import { makeStyles, tokens, MessageBar, MessageBarBody, MessageBarActions, Button } from '@fluentui/react-components';
import { DismissRegular } from '@fluentui/react-icons';
import { MessageList } from './MessageList';
import { InputBox } from './InputBox';
import { TypingIndicator } from './TypingIndicator';
import { useChatStore } from '@/store/chatStore';
import { useExcelStore } from '@/store/excelStore';
import { usePreviewStore } from '@/store/previewStore';
import { streamChat, continueChat } from '@/lib/api';
import type { ToolResult, HistoryMessage } from '@/lib/api';
import { generatePreview, executeToolCall, isWriteTool, isReadTool } from '@/lib/tools';
import type { ToolCall, ChatStreamEvent } from '@cellix/shared';
import { CHAT_CONFIG } from '@/lib/constants';

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
  const {
    messages,
    isTyping,
    sessionId,
    addMessage,
    updateLastAssistantMessage,
    setTyping,
    setExecutingTools,
    setSessionId,
    updateToolCallStatus,
    setToolCallResult,
    setLastAssistantMeta,
  } = useChatStore();
  const { context: excelContext } = useExcelStore();
  const { addPendingAction } = usePreviewStore();

  // Error state for connection/streaming errors
  const [streamError, setStreamError] = useState<string | null>(null);
  const lastMessageRef = useRef<string | null>(null);

  /**
   * Consume events from an SSE stream, updating the last assistant message.
   * Works identically for both initial chat and continuation streams.
   * Returns the collected text content and tool calls.
   */
  const consumeStream = useCallback(
    async (stream: AsyncGenerator<ChatStreamEvent, void, unknown>) => {
      let fullContent = '';
      const toolCalls: Array<{ id: string; name: string; arguments: string }> = [];

      for await (const event of stream) {
        switch (event.type) {
          case 'session':
            // Store session ID from backend for conversation continuity
            if (event.sessionId) {
              setSessionId(event.sessionId);
            }
            // Store tier/model metadata on the current assistant message
            if (event.tier && event.model) {
              setLastAssistantMeta(event.tier, event.model);
            }
            break;

          case 'text':
            if (event.content) {
              fullContent += event.content;
              updateLastAssistantMessage(fullContent, toolCalls);
            }
            break;

          case 'tool_call_start':
          case 'tool_call_delta': {
            const tc = event.toolCall;
            if (tc?.id) {
              const idx = toolCalls.findIndex((t) => t.id === tc.id);
              if (idx >= 0) {
                toolCalls[idx] = { id: tc.id, name: tc.name, arguments: tc.arguments };
              } else {
                toolCalls.push({ id: tc.id, name: tc.name, arguments: tc.arguments });
              }
              updateLastAssistantMessage(fullContent, toolCalls);
            }
            break;
          }

          case 'tool_call_end': {
            const tc = event.toolCall;
            if (tc?.id) {
              const idx = toolCalls.findIndex((t) => t.id === tc.id);
              if (idx >= 0) {
                toolCalls[idx] = { id: tc.id, name: tc.name, arguments: tc.arguments };
              } else {
                toolCalls.push({ id: tc.id, name: tc.name, arguments: tc.arguments });
              }
              updateLastAssistantMessage(fullContent, toolCalls);
            }
            break;
          }

          case 'error':
            fullContent += `\n\n*Error: ${event.error}*`;
            updateLastAssistantMessage(fullContent, toolCalls);
            break;

          case 'done':
            break;
        }
      }

      return { content: fullContent, toolCalls };
    },
    [updateLastAssistantMessage, setSessionId, setLastAssistantMeta]
  );

  /**
   * Execute tool calls and collect results for the feedback loop.
   * - Read tools: Execute immediately, collect ToolResult[] for continuation
   * - Write tools: Generate preview for user approval (not sent back to AI)
   */
  const executeAndCollectResults = useCallback(
    async (toolCalls: Array<{ id: string; name: string; arguments: string }>) => {
      const readResults: ToolResult[] = [];
      let hasWriteTools = false;
      let hasValidationErrors = false;

      for (const tc of toolCalls) {
        try {
          let parameters: Record<string, unknown> = {};
          try {
            parameters = JSON.parse(tc.arguments || '{}');
          } catch {
            // Keep empty object if parse fails
          }

          const toolCall: ToolCall = {
            id: tc.id,
            name: tc.name,
            parameters,
            status: 'pending',
          };

          if (isWriteTool(tc.name)) {
            hasWriteTools = true;
            const preview = await generatePreview(toolCall);

            if (!preview.validation.valid) {
              // Validation failed — send error back to AI so it can retry
              hasValidationErrors = true;
              updateToolCallStatus(tc.id, 'error');
              readResults.push({
                toolCallId: tc.id,
                toolName: tc.name,
                result: `Validation failed: ${preview.validation.errors.map(e => e.message).join('; ')}. Please fix the parameters and try again.`,
                isError: true,
              });
            } else {
              // Valid write tool — show preview for user approval
              addPendingAction(preview);
            }
          } else if (isReadTool(tc.name)) {
            // Read tools: Execute and collect result for AI continuation
            const result = await executeToolCall(toolCall);
            if (result.success) {
              setToolCallResult(tc.id, 'executed', result.resultData);
              readResults.push({
                toolCallId: tc.id,
                toolName: tc.name,
                result: result.resultData,
              });
            } else {
              setToolCallResult(tc.id, 'error', undefined, result.error);
              readResults.push({
                toolCallId: tc.id,
                toolName: tc.name,
                result: result.error || 'Execution failed',
                isError: true,
              });
            }
          }
          // Analytics tools: No execution needed (text-only reasoning by AI)
        } catch (err) {
          console.error(`[ChatPane] Failed to process tool ${tc.name}:`, err);
          const errorMsg = err instanceof Error ? err.message : 'Tool execution failed';
          setToolCallResult(tc.id, 'error', undefined, errorMsg);
          readResults.push({
            toolCallId: tc.id,
            toolName: tc.name,
            result: errorMsg,
            isError: true,
          });
        }
      }

      return { readResults, hasWriteTools, hasValidationErrors };
    },
    [addPendingAction, updateToolCallStatus, setToolCallResult]
  );

  /**
   * Build conversation history from current messages for the backend.
   * Extracts user/assistant text messages, excluding the current message being sent.
   * Limited to last 20 messages to stay within token budget.
   */
  const buildHistory = useCallback((): HistoryMessage[] => {
    const history: HistoryMessage[] = [];
    for (const msg of messages) {
      if ((msg.role === 'user' || msg.role === 'assistant') && msg.content) {
        history.push({ role: msg.role, content: msg.content });
      }
    }
    // Keep last 20 messages (will be further trimmed by backend token budget)
    return history.slice(-20);
  }, [messages]);

  /**
   * Main stream processor with tool result feedback loop.
   *
   * Flow:
   * 1. Stream initial AI response
   * 2. If AI requests tool calls:
   *    a. Execute read tools immediately, generate previews for write tools
   *    b. Send read tool results back to AI via /api/chat/continue
   *    c. Stream the AI's analysis response
   *    d. If AI requests more tools, repeat (up to CHAT_CONFIG.MAX_CONTINUATION_ITERATIONS)
   * 3. Display final response
   */
  const processStream = useCallback(
    async (userMessage: string) => {
      // Build history from existing messages (before the current user message was added)
      const history = buildHistory();

      // Stage 1: Stream initial AI response (with session and history)
      const initial = await consumeStream(streamChat(userMessage, excelContext, sessionId, history));

      // Stage 2: Tool execution + continuation loop
      let currentContent = initial.content;
      let currentToolCalls = initial.toolCalls;
      let iteration = 0;

      while (currentToolCalls.length > 0 && iteration < CHAT_CONFIG.MAX_CONTINUATION_ITERATIONS) {
        iteration++;

        // Execute tools and collect read results
        setExecutingTools(true);
        const { readResults, hasWriteTools, hasValidationErrors } = await executeAndCollectResults(currentToolCalls);
        setExecutingTools(false);

        // Stop the loop if:
        // - Valid write tools are present (need user approval first) and no errors to retry
        // - No results to send back to AI
        if (hasWriteTools && !hasValidationErrors) break;
        if (readResults.length === 0) break;

        // Add new assistant message placeholder for the continuation response
        addMessage({ role: 'assistant', content: '' });

        // Send tool results back to AI and stream the continuation
        const isFinalIteration = iteration >= CHAT_CONFIG.MAX_CONTINUATION_ITERATIONS;
        const continuation = await consumeStream(
          continueChat({
            message: userMessage,
            sessionId,
            history,
            excelContext,
            assistantContent: currentContent || null,
            toolCalls: currentToolCalls,
            toolResults: readResults,
            allowTools: !isFinalIteration,
          })
        );

        currentContent = continuation.content;
        currentToolCalls = continuation.toolCalls;
      }
    },
    [excelContext, sessionId, buildHistory, consumeStream, executeAndCollectResults, addMessage, setExecutingTools]
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
        // Clear the ref on success to free memory
        lastMessageRef.current = null;
      } catch (error) {
        // Connection/network errors - show in error bar with retry option
        const errorMessage = error instanceof Error ? error.message : 'Failed to send message';
        setStreamError(errorMessage);
        updateLastAssistantMessage('*Connection error. See error message above.*', []);
      } finally {
        setTyping(false);
        setExecutingTools(false);
      }
    },
    [addMessage, setTyping, setExecutingTools, processStream, updateLastAssistantMessage]
  );

  const handleRetry = useCallback(async () => {
    if (!lastMessageRef.current) return;

    setStreamError(null);
    setTyping(true);

    // Update the last assistant message to show retry in progress
    updateLastAssistantMessage('', []);

    try {
      await processStream(lastMessageRef.current);
      // Clear the ref on success to free memory
      lastMessageRef.current = null;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to send message';
      setStreamError(errorMessage);
      updateLastAssistantMessage('*Connection error. See error message above.*', []);
    } finally {
      setTyping(false);
      setExecutingTools(false);
    }
  }, [processStream, setTyping, setExecutingTools, updateLastAssistantMessage]);

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
