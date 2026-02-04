// Re-export shared types
export type {
  ChatMessage,
  ChatRequest,
  ChatStreamChunk,
  ExcelContext,
  MessageRole,
  ToolCall,
  ToolCallStatus,
  ApiError,
  ApiResponse,
  HealthResponse,
  ReadyResponse,
} from '@cellix/shared';

// Add-in specific types
export interface AddinConfig {
  apiUrl: string;
  maxMessageLength: number;
  enableDevTools: boolean;
}

export const DEFAULT_CONFIG: AddinConfig = {
  apiUrl: import.meta.env.VITE_API_URL || '/api',
  maxMessageLength: 4000,
  enableDevTools: import.meta.env.DEV,
};
