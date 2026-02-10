/**
 * Event listeners for profile cache invalidation.
 * Listens to worksheet changes and invalidates stale profiles.
 */

import { invalidateProfile } from './profileCache';

/** Debounce timeout handle */
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

/** Debounce delay in ms */
const DEBOUNCE_DELAY = 2000;

/** Track registered sheets to avoid duplicates */
const registeredSheets = new Set<string>();

/**
 * Register change listener for a worksheet.
 * Invalidates profile cache after changes (debounced).
 */
export async function registerSheetChangeListener(sheetName: string): Promise<void> {
  if (registeredSheets.has(sheetName)) {
    return;
  }

  try {
    await Excel.run(async (context) => {
      const sheet = context.workbook.worksheets.getItem(sheetName);

      sheet.onChanged.add((event) => {
        handleSheetChange(sheetName, event);
        return Promise.resolve();
      });

      await context.sync();
      registeredSheets.add(sheetName);

      console.log(`[ProfileEvents] Registered change listener for sheet: ${sheetName}`);
    });
  } catch (e) {
    console.warn(`[ProfileEvents] Failed to register listener for ${sheetName}:`, e);
  }
}

/**
 * Register change listener for the active worksheet.
 */
export async function registerActiveSheetChangeListener(): Promise<void> {
  try {
    await Excel.run(async (context) => {
      const sheet = context.workbook.worksheets.getActiveWorksheet();
      sheet.load('name');
      await context.sync();

      await registerSheetChangeListener(sheet.name);
    });
  } catch (e) {
    console.warn('[ProfileEvents] Failed to register active sheet listener:', e);
  }
}

/**
 * Handle worksheet change event with debouncing.
 */
function handleSheetChange(sheetName: string, _event: Excel.WorksheetChangedEventArgs): void {
  // Clear existing timer
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  // Set new timer
  debounceTimer = setTimeout(() => {
    console.log(`[ProfileEvents] Invalidating profile for sheet: ${sheetName}`);
    invalidateProfile(sheetName);
    debounceTimer = null;
  }, DEBOUNCE_DELAY);
}

/**
 * Unregister all change listeners.
 * Call on add-in shutdown.
 */
export function unregisterAllListeners(): void {
  registeredSheets.clear();
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
}

/**
 * Check if a sheet has a registered listener.
 */
export function hasRegisteredListener(sheetName: string): boolean {
  return registeredSheets.has(sheetName);
}

/**
 * Get count of registered listeners.
 */
export function getRegisteredListenerCount(): number {
  return registeredSheets.size;
}
