import { create } from 'zustand';
import type { ChatMessage } from '@cellix/shared';

interface ChatState {
  /** All messages in the current conversation */
  messages: ChatMessage[];
  /** Whether the assistant is currently responding */
  isTyping: boolean;
  /** Current session ID */
  sessionId: string | null;

  /** Add a new message to the conversation */
  addMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  /** Set the typing indicator state */
  setTyping: (isTyping: boolean) => void;
  /** Clear all messages and start a new session */
  clearMessages: () => void;
  /** Set the current session ID */
  setSessionId: (sessionId: string) => void;
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

  setTyping: (isTyping) => set({ isTyping }),

  clearMessages: () =>
    set({
      messages: [],
      sessionId: null,
    }),

  setSessionId: (sessionId) => set({ sessionId }),
}));
