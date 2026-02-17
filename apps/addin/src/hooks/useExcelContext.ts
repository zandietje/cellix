/**
 * React hook for accessing and refreshing Excel context.
 * Provides a convenient interface to the Excel store and context extraction.
 * Uses profile-first extraction by default (Phase 5C).
 * Automatically refreshes context on selection change.
 */

import { useCallback, useEffect, useRef } from 'react';
import { useExcelStore } from '../store/excelStore';
import { extractContext, extractContextWithProfile } from '../lib/excel/context';
import { DEBOUNCE_CONFIG } from '../lib/constants';

export interface UseExcelContextOptions {
  /** Use legacy full context instead of profile-first (default: false) */
  useLegacy?: boolean;
  /** Include selection data in profile context (default: true) */
  includeData?: boolean;
  /** Auto-refresh on selection change (default: true) */
  autoRefresh?: boolean;
}

/**
 * Hook to access and refresh Excel context.
 * Uses profile-first extraction by default for better token efficiency.
 * Automatically listens for selection changes and updates context.
 */
export function useExcelContext(options: UseExcelContextOptions = {}) {
  const { useLegacy = false, includeData = true, autoRefresh = true } = options;

  const { context, isLoading, error, lastRefresh, setContext, setLoading, setError, reset } =
    useExcelStore();

  // Debounce timer for selection change events
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
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

  // Auto-refresh context on selection change
  useEffect(() => {
    if (!autoRefresh) return;

    let eventResult: OfficeExtension.EventHandlerResult<Excel.WorksheetSelectionChangedEventArgs> | null = null;
    let disposed = false;

    const setup = async () => {
      try {
        // Initial load
        await refresh();
        if (disposed) return;

        // Register selection change handler
        await Excel.run(async (ctx) => {
          const sheet = ctx.workbook.worksheets.getActiveWorksheet();
          eventResult = sheet.onSelectionChanged.add(async () => {
            if (disposed) return;
            // Debounce: wait 500ms after last selection change before refreshing
            if (debounceRef.current) clearTimeout(debounceRef.current);
            debounceRef.current = setTimeout(() => {
              if (!disposed) refresh();
            }, DEBOUNCE_CONFIG.SELECTION_CHANGE);
          });
          await ctx.sync();
        });
      } catch (e) {
        console.error('Failed to setup selection change listener:', e);
      }
    };

    const setupPromise = setup();

    return () => {
      disposed = true;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      // Wait for setup to finish, then clean up event handler
      setupPromise.finally(() => {
        if (eventResult) {
          Excel.run(eventResult.context, async (ctx) => {
            eventResult!.remove();
            await ctx.sync();
          }).catch((err) => console.warn('Listener cleanup failed:', err));
        }
      });
    };
  }, [autoRefresh, refresh]);

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
