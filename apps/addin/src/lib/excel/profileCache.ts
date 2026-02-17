/**
 * Profile Cache for Cellix.
 * In-memory cache with localStorage persistence for sheet profiles.
 * Supports progressive profiling levels for efficient data loading.
 */

import type {
  SheetProfile,
  ProfileCacheEntry,
  WorkbookInventory,
  ProfilingLevel,
} from '@cellix/shared';
import { PROFILING_LEVEL_ORDER } from '@cellix/shared';

/** Current profile version — cached profiles with older versions are discarded */
const CURRENT_PROFILE_VERSION = 2;

/** localStorage key for profile cache */
const STORAGE_KEY = 'cellix_profile_cache';

/** Maximum age before profile is considered stale (5 minutes) */
const MAX_CACHE_AGE_MS = 5 * 60 * 1000;

/** Maximum entries in localStorage */
const MAX_CACHE_ENTRIES = 20;

/** In-memory cache */
const memoryCache = new Map<string, ProfileCacheEntry>();

/** Workbook inventory cache */
let inventoryCache: WorkbookInventory | null = null;
let inventoryCachedAt: number | null = null;

/**
 * Get profile from cache, or null if not cached/stale.
 */
export function getCachedProfile(sheetName: string): SheetProfile | null {
  // Check memory cache first
  const entry = memoryCache.get(sheetName);
  if (entry && !isStale(entry.cachedAt) && entry.version >= CURRENT_PROFILE_VERSION) {
    return entry.profile;
  }

  // Check localStorage
  const stored = loadFromStorage();
  const storedEntry = stored[sheetName];
  if (storedEntry && !isStale(storedEntry.cachedAt) && storedEntry.version >= CURRENT_PROFILE_VERSION) {
    // Hydrate memory cache
    memoryCache.set(sheetName, storedEntry);
    return storedEntry.profile;
  }

  return null;
}

/**
 * Store profile in cache at a specific level.
 * @param profile - The profile to cache
 * @param level - The profiling level (default: 'full')
 */
export function setCachedProfile(profile: SheetProfile, level: ProfilingLevel = 'full'): void {
  const entry: ProfileCacheEntry = {
    profile,
    sheetName: profile.sheetName,
    version: profile.version,
    cachedAt: Date.now(),
    level,
  };

  // Update memory cache
  memoryCache.set(profile.sheetName, entry);

  // Update localStorage
  const stored = loadFromStorage();
  stored[profile.sheetName] = entry;

  // Prune old entries if needed
  const entries = Object.entries(stored);
  if (entries.length > MAX_CACHE_ENTRIES) {
    entries.sort((a, b) => a[1].cachedAt - b[1].cachedAt);
    const toRemove = entries.slice(0, entries.length - MAX_CACHE_ENTRIES);
    toRemove.forEach(([key]) => delete stored[key]);
  }

  saveToStorage(stored);
}

/**
 * Invalidate profile for a sheet.
 */
export function invalidateProfile(sheetName: string): void {
  memoryCache.delete(sheetName);

  const stored = loadFromStorage();
  delete stored[sheetName];
  saveToStorage(stored);
}

/**
 * Invalidate all cached profiles.
 */
export function invalidateAllProfiles(): void {
  memoryCache.clear();
  inventoryCache = null;
  inventoryCachedAt = null;
  saveToStorage({});
}

/**
 * Get cached workbook inventory.
 */
export function getCachedInventory(): WorkbookInventory | null {
  if (inventoryCache && inventoryCachedAt && !isStale(inventoryCachedAt)) {
    return inventoryCache;
  }
  return null;
}

/**
 * Set cached workbook inventory.
 */
export function setCachedInventory(inventory: WorkbookInventory): void {
  inventoryCache = inventory;
  inventoryCachedAt = Date.now();
}

/**
 * Check if timestamp is stale.
 */
function isStale(cachedAt: number): boolean {
  return Date.now() - cachedAt > MAX_CACHE_AGE_MS;
}

/**
 * Load cache from localStorage.
 */
function loadFromStorage(): Record<string, ProfileCacheEntry> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.warn('[ProfileCache] Failed to load from localStorage:', e);
  }
  return {};
}

/**
 * Save cache to localStorage.
 */
function saveToStorage(cache: Record<string, ProfileCacheEntry>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch (e) {
    console.warn('[ProfileCache] Failed to save to localStorage:', e);
  }
}

/**
 * Get profile at minimum required level, or null if not available.
 * Returns cached profile only if it meets the minimum level requirement.
 *
 * @param sheetName - Sheet to get profile for
 * @param minLevel - Minimum profiling level required
 * @returns Profile if available at required level, null otherwise
 */
export function getCachedProfileAtLevel(
  sheetName: string,
  minLevel: ProfilingLevel
): SheetProfile | null {
  // Check memory cache first
  const entry = memoryCache.get(sheetName);
  if (entry && !isStale(entry.cachedAt) && entry.version >= CURRENT_PROFILE_VERSION) {
    const entryLevel = entry.level ?? 'full';
    if (PROFILING_LEVEL_ORDER[entryLevel] >= PROFILING_LEVEL_ORDER[minLevel]) {
      return entry.profile;
    }
  }

  // Check localStorage
  const stored = loadFromStorage();
  const storedEntry = stored[sheetName];
  if (storedEntry && !isStale(storedEntry.cachedAt) && storedEntry.version >= CURRENT_PROFILE_VERSION) {
    const entryLevel = storedEntry.level ?? 'full';
    if (PROFILING_LEVEL_ORDER[entryLevel] >= PROFILING_LEVEL_ORDER[minLevel]) {
      // Hydrate memory cache
      memoryCache.set(sheetName, storedEntry);
      return storedEntry.profile;
    }
  }

  return null;
}

/**
 * Check if profile needs upgrade to a higher level.
 *
 * @param sheetName - Sheet to check
 * @param requiredLevel - The level needed
 * @returns true if profile doesn't exist or is at a lower level
 */
export function needsLevelUpgrade(
  sheetName: string,
  requiredLevel: ProfilingLevel
): boolean {
  // Check memory cache first
  const entry = memoryCache.get(sheetName);
  if (entry && !isStale(entry.cachedAt)) {
    const entryLevel = entry.level ?? 'full';
    return PROFILING_LEVEL_ORDER[entryLevel] < PROFILING_LEVEL_ORDER[requiredLevel];
  }

  // Check localStorage
  const stored = loadFromStorage();
  const storedEntry = stored[sheetName];
  if (storedEntry && !isStale(storedEntry.cachedAt)) {
    const entryLevel = storedEntry.level ?? 'full';
    return PROFILING_LEVEL_ORDER[entryLevel] < PROFILING_LEVEL_ORDER[requiredLevel];
  }

  // No cached entry, definitely needs upgrade
  return true;
}

