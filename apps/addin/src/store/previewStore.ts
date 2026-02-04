/**
 * Zustand store for managing tool execution preview state.
 * Handles pending actions, execution status, and results.
 */

import { create } from 'zustand';
import type { PreviewData, ExecutionResult } from '../lib/tools/types';
import type { ToolCallStatus } from '@cellix/shared';

interface PreviewState {
  /** List of pending tool call previews awaiting user action */
  pendingActions: PreviewData[];
  /** Whether execution is currently in progress */
  isExecuting: boolean;
  /** Results from recent executions */
  executionResults: ExecutionResult[];
  /** Whether the preview panel should be visible */
  isPanelVisible: boolean;

  // Actions
  /** Add a pending action to the queue */
  addPendingAction: (preview: PreviewData) => void;
  /** Remove a pending action by tool call ID */
  removePendingAction: (toolCallId: string) => void;
  /** Mark an action as approved (ready for execution) */
  approveAction: (toolCallId: string) => void;
  /** Reject an action (remove from queue) */
  rejectAction: (toolCallId: string) => void;
  /** Approve all pending actions */
  approveAll: () => void;
  /** Reject all pending actions */
  rejectAll: () => void;
  /** Set whether execution is in progress */
  setExecuting: (executing: boolean) => void;
  /** Add an execution result */
  addExecutionResult: (result: ExecutionResult) => void;
  /** Clear all pending actions and results */
  clearAll: () => void;
  /** Set panel visibility */
  setPanelVisible: (visible: boolean) => void;
  /** Get pending actions that have been approved */
  getApprovedActions: () => PreviewData[];
  /** Update tool call status in a preview */
  updatePreviewStatus: (toolCallId: string, status: ToolCallStatus) => void;
}

export const usePreviewStore = create<PreviewState>((set, get) => ({
  pendingActions: [],
  isExecuting: false,
  executionResults: [],
  isPanelVisible: false,

  addPendingAction: (preview) =>
    set((state) => ({
      pendingActions: [...state.pendingActions, preview],
      isPanelVisible: true, // Auto-show panel when actions are added
    })),

  removePendingAction: (toolCallId) =>
    set((state) => {
      const newPendingActions = state.pendingActions.filter(
        (p) => p.toolCall.id !== toolCallId
      );
      return {
        pendingActions: newPendingActions,
        // Hide panel if no more pending actions
        isPanelVisible: newPendingActions.length > 0,
      };
    }),

  approveAction: (toolCallId) =>
    set((state) => ({
      pendingActions: state.pendingActions.map((p) =>
        p.toolCall.id === toolCallId
          ? {
              ...p,
              toolCall: { ...p.toolCall, status: 'preview' as ToolCallStatus },
            }
          : p
      ),
    })),

  rejectAction: (toolCallId) =>
    set((state) => {
      const newPendingActions = state.pendingActions.filter(
        (p) => p.toolCall.id !== toolCallId
      );
      return {
        pendingActions: newPendingActions,
        isPanelVisible: newPendingActions.length > 0,
      };
    }),

  approveAll: () =>
    set((state) => ({
      pendingActions: state.pendingActions.map((p) => ({
        ...p,
        toolCall: { ...p.toolCall, status: 'preview' as ToolCallStatus },
      })),
    })),

  rejectAll: () =>
    set({
      pendingActions: [],
      isPanelVisible: false,
    }),

  setExecuting: (executing) => set({ isExecuting: executing }),

  addExecutionResult: (result) =>
    set((state) => ({
      executionResults: [...state.executionResults, result],
    })),

  clearAll: () =>
    set({
      pendingActions: [],
      executionResults: [],
      isPanelVisible: false,
    }),

  setPanelVisible: (visible) => set({ isPanelVisible: visible }),

  getApprovedActions: () => {
    const state = get();
    return state.pendingActions.filter((p) => p.toolCall.status === 'preview');
  },

  updatePreviewStatus: (toolCallId, status) =>
    set((state) => ({
      pendingActions: state.pendingActions.map((p) =>
        p.toolCall.id === toolCallId
          ? { ...p, toolCall: { ...p.toolCall, status } }
          : p
      ),
    })),
}));
