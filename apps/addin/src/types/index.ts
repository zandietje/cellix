// Re-export shared types
export type {
  ChatMessage,
  ChatRequest,
  ChatStreamEvent,
  ExcelContextFull,
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
  /** Backend API URL. Required in production (VITE_API_URL). */
  apiUrl: string;
  /** Maximum message length for chat input. */
  maxMessageLength: number;
  /** Enable development tools and debugging. */
  enableDevTools: boolean;
}

/**
 * Default configuration for the add-in.
 * Note: In production, VITE_API_URL must be set during build.
 */
export const DEFAULT_CONFIG: AddinConfig = {
  // In development, Vite proxy handles /api -> localhost:3001
  // In production, VITE_API_URL must be set (e.g., https://api.cellix.app/api)
  apiUrl: import.meta.env.VITE_API_URL || (import.meta.env.DEV ? '/api' : ''),
  maxMessageLength: 4000,
  enableDevTools: import.meta.env.DEV,
};
