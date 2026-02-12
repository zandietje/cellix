/**
 * Zustand store for Excel context state.
 * Manages the current Excel context, loading state, and errors.
 */

import { create } from 'zustand';
import type { ExcelContextFull, ExcelContextWithProfile, ProfilingLevel } from '@cellix/shared';

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

  /** Profiling progress (0-1) */
  profilingProgress: number;
  /** Whether profile is being loaded/extracted */
  isProfileLoading: boolean;
  /** Current profiling level being extracted */
  currentProfilingLevel: ProfilingLevel | null;

  /** Set the current context */
  setContext: (context: ExcelContext | null) => void;
  /** Set loading state */
  setLoading: (isLoading: boolean) => void;
  /** Set error state */
  setError: (error: string | null) => void;
  /** Clear context and error */
  reset: () => void;

  /** Set profiling progress (0-1) */
  setProfilingProgress: (progress: number) => void;
  /** Set profile loading state */
  setProfileLoading: (loading: boolean, level?: ProfilingLevel | null) => void;
}

export const useExcelStore = create<ExcelState>((set) => ({
  context: null,
  isLoading: false,
  error: null,
  lastRefresh: null,
  profilingProgress: 0,
  isProfileLoading: false,
  currentProfilingLevel: null,

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
      profilingProgress: 0,
      isProfileLoading: false,
      currentProfilingLevel: null,
    }),

  setProfilingProgress: (progress) => set({ profilingProgress: progress }),

  setProfileLoading: (loading, level = null) =>
    set({
      isProfileLoading: loading,
      currentProfilingLevel: level,
      profilingProgress: loading ? 0 : 1,
    }),
}));
