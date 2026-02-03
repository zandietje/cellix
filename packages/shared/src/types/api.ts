/**
 * API response types for Cellix
 */

/** Standard API error shape */
export interface ApiError {
  /** Error code for programmatic handling */
  code: string;
  /** Human-readable error message */
  message: string;
}

/** Standard API response wrapper */
export interface ApiResponse<T> {
  /** Whether the request succeeded */
  success: boolean;
  /** Response data (when success is true) */
  data?: T;
  /** Error details (when success is false) */
  error?: ApiError;
}

/** Health check response */
export interface HealthResponse {
  /** Server status */
  status: 'ok' | 'degraded';
  /** ISO timestamp of the response */
  timestamp: string;
  /** Server version */
  version: string;
}

/** Readiness check response */
export interface ReadyResponse {
  /** Overall readiness status */
  status: 'ok' | 'not_ready';
  /** Individual service checks */
  checks: {
    server: { status: 'ok' | 'error'; message?: string };
    database?: { status: 'ok' | 'error'; message?: string };
    ai?: { status: 'ok' | 'error'; message?: string };
  };
}
