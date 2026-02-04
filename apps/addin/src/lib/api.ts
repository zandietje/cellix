import axios, { AxiosError } from 'axios';
import type { ApiResponse, HealthResponse, ChatStreamEvent, ExcelContextFull } from '@cellix/shared';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiResponse<unknown>>) => {
    const message = error.response?.data?.error?.message || 'Network error';
    console.error('API Error:', message);
    return Promise.reject(new Error(message));
  }
);

/** Check if the backend is healthy */
export async function checkHealth(): Promise<boolean> {
  try {
    const response = await apiClient.get<HealthResponse>('/health');
    return response.data.status === 'ok';
  } catch {
    return false;
  }
}

/** Get detailed health status */
export async function getHealthStatus(): Promise<HealthResponse | null> {
  try {
    const response = await apiClient.get<HealthResponse>('/health');
    return response.data;
  } catch {
    return null;
  }
}

/**
 * Send a chat message and stream the response via SSE.
 * Yields ChatStreamEvent objects as they arrive from the backend.
 */
export async function* streamChat(
  message: string,
  excelContext?: ExcelContextFull | null
): AsyncGenerator<ChatStreamEvent, void, unknown> {
  const response = await fetch(`${API_BASE_URL}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message,
      excelContext: excelContext ?? undefined,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Chat request failed: ${response.status} ${error}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('No response body available');
  }

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // Decode the chunk and add to buffer
      buffer += decoder.decode(value, { stream: true });

      // Parse SSE events from buffer
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        // SSE format: "data: {json}"
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data) {
            try {
              const event = JSON.parse(data) as ChatStreamEvent;
              yield event;

              // Stop on done or error
              if (event.type === 'done' || event.type === 'error') {
                return;
              }
            } catch {
              // Ignore JSON parse errors for malformed data
              console.warn('Failed to parse SSE data:', data);
            }
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Send a chat message (non-streaming, for testing).
 */
export async function sendChatSync(
  message: string,
  excelContext?: ExcelContextFull | null
): Promise<{ content: string; toolCalls: Array<{ id: string; name: string; parameters: Record<string, unknown> }> }> {
  const response = await apiClient.post('/chat/sync', {
    message,
    excelContext: excelContext ?? undefined,
  });

  if (!response.data.success) {
    throw new Error(response.data.error?.message || 'Chat request failed');
  }

  return response.data.data;
}
