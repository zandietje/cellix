import { create } from 'zustand';

export type TabId = 'chat' | 'settings';

interface UIState {
  /** Currently active tab */
  activeTab: TabId;
  /** Global loading state */
  isLoading: boolean;
  /** Global error message */
  error: string | null;

  /** Set the active tab */
  setActiveTab: (tab: TabId) => void;
  /** Set global loading state */
  setLoading: (isLoading: boolean) => void;
  /** Set global error message */
  setError: (error: string | null) => void;
  /** Clear the global error */
  clearError: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  activeTab: 'chat',
  isLoading: false,
  error: null,

  setActiveTab: (activeTab) => set({ activeTab }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
  clearError: () => set({ error: null }),
}));
