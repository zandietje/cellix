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

/** Whether the audit log has been initialized from storage */
let initialized = false;

/**
 * Initialize audit log from localStorage if available.
 */
function initializeFromStorage(): void {
  if (initialized) return;

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      auditLog = JSON.parse(stored);
    }
  } catch (error) {
    // localStorage not available or corrupted, use empty log
    console.warn('[Audit] Failed to load from storage:', error);
    auditLog = [];
  }

  initialized = true;
}

/**
 * Persist audit log to localStorage.
 */
function persistToStorage(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(auditLog));
  } catch (error) {
    // localStorage not available or quota exceeded
    console.warn('[Audit] Failed to persist to storage:', error);
  }
}

/**
 * Logs a tool execution to the audit trail.
 */
export function logToolExecution(entry: AuditLogEntry): void {
  // Initialize from storage on first call
  initializeFromStorage();

  // Add new entry
  auditLog.push(entry);

  // Trim old entries if over limit
  if (auditLog.length > MAX_AUDIT_ENTRIES) {
    auditLog = auditLog.slice(-MAX_AUDIT_ENTRIES);
  }

  // Persist to storage
  persistToStorage();

  // Log to console in development
  if (import.meta.env.DEV) {
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
  initializeFromStorage();
  return [...auditLog];
}
