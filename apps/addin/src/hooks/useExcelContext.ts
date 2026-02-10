/**
 * React hook for accessing and refreshing Excel context.
 * Provides a convenient interface to the Excel store and context extraction.
 * Uses profile-first extraction by default (Phase 5C).
 */

import { useCallback } from 'react';
import { useExcelStore } from '../store/excelStore';
import { extractContext, extractContextWithProfile } from '../lib/excel/context';

export interface UseExcelContextOptions {
  /** Use legacy full context instead of profile-first (default: false) */
  useLegacy?: boolean;
  /** Include selection data in profile context (default: false) */
  includeData?: boolean;
}

/**
 * Hook to access and refresh Excel context.
 * Uses profile-first extraction by default for better token efficiency.
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { context, isLoading, error, refresh } = useExcelContext();
 *
 *   return (
 *     <div>
 *       <button onClick={refresh} disabled={isLoading}>Refresh</button>
 *       {context && <div>Selection: {context.selection.address}</div>}
 *     </div>
 *   );
 * }
 * ```
 */
export function useExcelContext(options: UseExcelContextOptions = {}) {
  const { useLegacy = false, includeData = false } = options;

  const { context, isLoading, error, lastRefresh, setContext, setLoading, setError, reset } =
    useExcelStore();

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Use profile-first by default, legacy if explicitly requested
      const ctx = useLegacy
        ? await extractContext()
        : await extractContextWithProfile({ includeData });
      setContext(ctx);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to extract Excel context';
      setError(message);
      console.error('Excel context extraction error:', e);
    }
  }, [setContext, setError, setLoading, useLegacy, includeData]);

  return {
    /** Current Excel context, or null if not yet loaded */
    context,
    /** Whether context is currently being loaded */
    isLoading,
    /** Error message if context extraction failed */
    error,
    /** Timestamp of last successful refresh */
    lastRefresh,
    /** Refresh the context from current Excel state */
    refresh,
    /** Reset context and error state */
    reset,
  };
}
