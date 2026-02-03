import axios, { AxiosError } from 'axios';
import type { ApiResponse, HealthResponse } from '@cellix/shared';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://localhost:3001/api';

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
