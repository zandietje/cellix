/**
 * Event listeners for profile cache invalidation.
 * Listens to worksheet changes and invalidates stale profiles.
 */

import { invalidateProfile } from './profileCache';

/** Debounce timers per sheet (prevents race condition where one sheet's change cancels another's) */
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

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
 * Each sheet has its own timer to prevent race conditions.
 */
function handleSheetChange(sheetName: string, _event: Excel.WorksheetChangedEventArgs): void {
  // Clear existing timer for this specific sheet
  const existingTimer = debounceTimers.get(sheetName);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  // Set new timer for this sheet
  const timer = setTimeout(() => {
    console.log(`[ProfileEvents] Invalidating profile for sheet: ${sheetName}`);
    invalidateProfile(sheetName);
    debounceTimers.delete(sheetName);
  }, DEBOUNCE_DELAY);

  debounceTimers.set(sheetName, timer);
}

/**
 * Unregister all change listeners.
 * Call on add-in shutdown.
 */
export function unregisterAllListeners(): void {
  registeredSheets.clear();
  // Clear all pending timers
  for (const timer of debounceTimers.values()) {
    clearTimeout(timer);
  }
  debounceTimers.clear();
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
