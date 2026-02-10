/**
 * Profile Cache for Cellix.
 * In-memory cache with localStorage persistence for sheet profiles.
 */

import type { SheetProfile, ProfileCacheEntry, WorkbookInventory } from '@cellix/shared';

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
  if (entry && !isStale(entry.cachedAt)) {
    return entry.profile;
  }

  // Check localStorage
  const stored = loadFromStorage();
  const storedEntry = stored[sheetName];
  if (storedEntry && !isStale(storedEntry.cachedAt)) {
    // Hydrate memory cache
    memoryCache.set(sheetName, storedEntry);
    return storedEntry.profile;
  }

  return null;
}

/**
 * Store profile in cache.
 */
export function setCachedProfile(profile: SheetProfile): void {
  const entry: ProfileCacheEntry = {
    profile,
    sheetName: profile.sheetName,
    version: profile.version,
    cachedAt: Date.now(),
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
 * Get cache statistics for debugging.
 */
export function getCacheStats(): {
  memoryEntries: number;
  storageEntries: number;
  hasInventory: boolean;
} {
  const stored = loadFromStorage();
  return {
    memoryEntries: memoryCache.size,
    storageEntries: Object.keys(stored).length,
    hasInventory: inventoryCache !== null,
  };
}
