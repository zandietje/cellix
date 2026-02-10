/**
 * Zustand store for sheet profile state.
 * Manages profile extraction, caching, and invalidation.
 */

import { create } from 'zustand';
import type { SheetProfile, WorkbookInventory } from '@cellix/shared';
import { extractSheetProfile, extractWorkbookInventory } from '../lib/excel/profiler';
import {
  getCachedProfile,
  setCachedProfile,
  invalidateProfile,
  invalidateAllProfiles,
  getCachedInventory,
  setCachedInventory,
} from '../lib/excel/profileCache';

interface ProfileState {
  /** Current sheet profile */
  currentProfile: SheetProfile | null;
  /** Workbook inventory */
  inventory: WorkbookInventory | null;
  /** Whether profile is being extracted */
  isLoading: boolean;
  /** Extraction progress (0-1) */
  progress: number;
  /** Error message if extraction failed */
  error: string | null;

  // Actions
  /** Load profile for sheet (uses cache if available) */
  loadProfile: (sheetName?: string) => Promise<SheetProfile | null>;
  /** Force refresh profile (ignores cache) */
  refreshProfile: (sheetName?: string) => Promise<SheetProfile | null>;
  /** Load workbook inventory */
  loadInventory: () => Promise<WorkbookInventory | null>;
  /** Invalidate profile for sheet */
  invalidate: (sheetName: string) => void;
  /** Invalidate all profiles */
  invalidateAll: () => void;
  /** Clear current profile and error */
  reset: () => void;
}

export const useProfileStore = create<ProfileState>((set, get) => ({
  currentProfile: null,
  inventory: null,
  isLoading: false,
  progress: 0,
  error: null,

  loadProfile: async (sheetName?: string) => {
    // Try cache first
    const cached = sheetName ? getCachedProfile(sheetName) : null;
    if (cached) {
      set({ currentProfile: cached, error: null });
      return cached;
    }

    // Extract new profile
    return get().refreshProfile(sheetName);
  },

  refreshProfile: async (sheetName?: string) => {
    set({ isLoading: true, progress: 0, error: null });

    try {
      const profile = await extractSheetProfile(sheetName, {
        onProgress: (progress) => set({ progress }),
      });

      setCachedProfile(profile);
      set({ currentProfile: profile, isLoading: false, progress: 1 });
      return profile;
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Failed to extract profile';
      set({ error, isLoading: false });
      return null;
    }
  },

  loadInventory: async () => {
    // Try cache first
    const cached = getCachedInventory();
    if (cached) {
      set({ inventory: cached });
      return cached;
    }

    set({ isLoading: true, error: null });

    try {
      const inventory = await extractWorkbookInventory();
      setCachedInventory(inventory);
      set({ inventory, isLoading: false });
      return inventory;
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Failed to extract inventory';
      set({ error, isLoading: false });
      return null;
    }
  },

  invalidate: (sheetName: string) => {
    invalidateProfile(sheetName);
    const current = get().currentProfile;
    if (current?.sheetName === sheetName) {
      set({ currentProfile: null });
    }
  },

  invalidateAll: () => {
    invalidateAllProfiles();
    set({ currentProfile: null, inventory: null });
  },

  reset: () => {
    set({
      currentProfile: null,
      inventory: null,
      isLoading: false,
      progress: 0,
      error: null,
    });
  },
}));
