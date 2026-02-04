/**
 * React hook for accessing and refreshing Excel context.
 * Provides a convenient interface to the Excel store and context extraction.
 */

import { useCallback } from 'react';
import { useExcelStore } from '../store/excelStore';
import { extractContext } from '../lib/excel/context';

/**
 * Hook to access and refresh Excel context.
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
export function useExcelContext() {
  const { context, isLoading, error, lastRefresh, setContext, setLoading, setError, reset } =
    useExcelStore();

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const ctx = await extractContext();
      setContext(ctx);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to extract Excel context';
      setError(message);
      console.error('Excel context extraction error:', e);
    }
  }, [setContext, setError, setLoading]);

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
