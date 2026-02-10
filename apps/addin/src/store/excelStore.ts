/**
 * Zustand store for Excel context state.
 * Manages the current Excel context, loading state, and errors.
 */

import { create } from 'zustand';
import type { ExcelContextFull, ExcelContextWithProfile } from '@cellix/shared';

/** Context can be either profile-first or legacy full context */
export type ExcelContext = ExcelContextFull | ExcelContextWithProfile;

interface ExcelState {
  /** Current Excel context (profile-first or legacy) */
  context: ExcelContext | null;
  /** Whether context is being loaded */
  isLoading: boolean;
  /** Error message if context extraction failed */
  error: string | null;
  /** Last time context was refreshed */
  lastRefresh: number | null;

  /** Set the current context */
  setContext: (context: ExcelContext | null) => void;
  /** Set loading state */
  setLoading: (isLoading: boolean) => void;
  /** Set error state */
  setError: (error: string | null) => void;
  /** Clear context and error */
  reset: () => void;
}

export const useExcelStore = create<ExcelState>((set) => ({
  context: null,
  isLoading: false,
  error: null,
  lastRefresh: null,

  setContext: (context) =>
    set({
      context,
      error: null,
      lastRefresh: context ? Date.now() : null,
    }),

  setLoading: (isLoading) => set({ isLoading }),

  setError: (error) => set({ error, isLoading: false }),

  reset: () =>
    set({
      context: null,
      error: null,
      isLoading: false,
      lastRefresh: null,
    }),
}));
