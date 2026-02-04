import { create } from 'zustand';
import type { ChatMessage, ToolCall, ToolCallStatus } from '@cellix/shared';

interface ChatState {
  /** All messages in the current conversation */
  messages: ChatMessage[];
  /** Whether the assistant is currently responding */
  isTyping: boolean;
  /** Current session ID */
  sessionId: string | null;

  /** Add a new message to the conversation */
  addMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  /** Update the last assistant message (for streaming) */
  updateLastAssistantMessage: (
    content: string,
    toolCalls?: Array<{ id: string; name: string; arguments: string }>
  ) => void;
  /** Set the typing indicator state */
  setTyping: (isTyping: boolean) => void;
  /** Clear all messages and start a new session */
  clearMessages: () => void;
  /** Set the current session ID */
  setSessionId: (sessionId: string) => void;
  /** Update a tool call's status */
  updateToolCallStatus: (toolCallId: string, status: ToolCallStatus) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  isTyping: false,
  sessionId: null,

  addMessage: (message) =>
    set((state) => ({
      messages: [
        ...state.messages,
        {
          ...message,
          id: crypto.randomUUID(),
          timestamp: Date.now(),
        },
      ],
    })),

  updateLastAssistantMessage: (content, toolCalls) =>
    set((state) => {
      const messages = [...state.messages];
      const lastIndex = messages.length - 1;

      if (lastIndex >= 0 && messages[lastIndex].role === 'assistant') {
        // Parse tool calls from JSON strings to ToolCall objects
        const parsedToolCalls: ToolCall[] | undefined = toolCalls?.map((tc) => {
          let parameters: Record<string, unknown> = {};
          try {
            parameters = JSON.parse(tc.arguments || '{}');
          } catch {
            // Keep empty object if parse fails
          }
          return {
            id: tc.id,
            name: tc.name,
            parameters,
            status: 'pending' as const,
          };
        });

        messages[lastIndex] = {
          ...messages[lastIndex],
          content,
          toolCalls: parsedToolCalls,
        };
      }

      return { messages };
    }),

  setTyping: (isTyping) => set({ isTyping }),

  clearMessages: () =>
    set({
      messages: [],
      sessionId: null,
    }),

  setSessionId: (sessionId) => set({ sessionId }),

  updateToolCallStatus: (toolCallId, status) =>
    set((state) => {
      const messages = state.messages.map((message) => {
        if (message.role !== 'assistant' || !message.toolCalls) {
          return message;
        }

        const updatedToolCalls = message.toolCalls.map((tc) =>
          tc.id === toolCallId ? { ...tc, status } : tc
        );

        return { ...message, toolCalls: updatedToolCalls };
      });

      return { messages };
    }),
}));
