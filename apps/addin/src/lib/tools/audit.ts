/**
 * Audit logging for tool executions.
 * Stores execution history locally for now; backend persistence in future phase.
 */

import type { AuditLogEntry } from './types';

/** Maximum entries to keep in the audit log */
const MAX_AUDIT_ENTRIES = 100;

/** Local audit log storage key */
const STORAGE_KEY = 'cellix_audit_log';

/** In-memory audit log (also persisted to localStorage) */
let auditLog: AuditLogEntry[] = [];

/**
 * Initialize audit log from localStorage if available.
 */
function initializeFromStorage(): void {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      auditLog = JSON.parse(stored);
    }
  } catch {
    // localStorage not available or corrupted, use empty log
    auditLog = [];
  }
}

/**
 * Persist audit log to localStorage.
 */
function persistToStorage(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(auditLog));
  } catch {
    // localStorage not available or quota exceeded
    // Continue without persistence
  }
}

/**
 * Logs a tool execution to the audit trail.
 */
export function logToolExecution(entry: AuditLogEntry): void {
  // Initialize if this is first call
  if (auditLog.length === 0) {
    initializeFromStorage();
  }

  // Add new entry
  auditLog.push(entry);

  // Trim old entries if over limit
  if (auditLog.length > MAX_AUDIT_ENTRIES) {
    auditLog = auditLog.slice(-MAX_AUDIT_ENTRIES);
  }

  // Persist to storage
  persistToStorage();

  // Log to console in development
  if (process.env.NODE_ENV !== 'production') {
    const status = entry.result === 'success' ? 'SUCCESS' : entry.result.toUpperCase();
    console.log(
      `[Audit] ${status}: ${entry.toolName} - ${entry.cellsAffected} cells in ${entry.executionTimeMs.toFixed(0)}ms`,
      entry.parameters
    );
  }
}

/**
 * Gets the full audit log.
 */
export function getAuditLog(): AuditLogEntry[] {
  // Initialize if needed
  if (auditLog.length === 0) {
    initializeFromStorage();
  }
  return [...auditLog];
}

/**
 * Gets recent audit entries (last N entries).
 */
export function getRecentAuditEntries(count: number = 10): AuditLogEntry[] {
  const log = getAuditLog();
  return log.slice(-count);
}

/**
 * Gets audit entries for a specific tool.
 */
export function getAuditEntriesForTool(toolName: string): AuditLogEntry[] {
  return getAuditLog().filter((entry) => entry.toolName === toolName);
}

/**
 * Gets audit statistics.
 */
export function getAuditStats(): {
  totalExecutions: number;
  successCount: number;
  errorCount: number;
  cancelledCount: number;
  totalCellsAffected: number;
  averageExecutionTimeMs: number;
} {
  const log = getAuditLog();

  const stats = {
    totalExecutions: log.length,
    successCount: 0,
    errorCount: 0,
    cancelledCount: 0,
    totalCellsAffected: 0,
    averageExecutionTimeMs: 0,
  };

  let totalTime = 0;

  for (const entry of log) {
    if (entry.result === 'success') stats.successCount++;
    if (entry.result === 'error') stats.errorCount++;
    if (entry.result === 'cancelled') stats.cancelledCount++;
    stats.totalCellsAffected += entry.cellsAffected;
    totalTime += entry.executionTimeMs;
  }

  stats.averageExecutionTimeMs = log.length > 0 ? totalTime / log.length : 0;

  return stats;
}

/**
 * Clears the audit log.
 * Use with caution - mainly for testing.
 */
export function clearAuditLog(): void {
  auditLog = [];
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
}
