import { create } from "zustand";

interface SettingsStore {
  isOpen: boolean;
  openSettings: () => void;
  closeSettings: () => void;
}

export const useSettings = create<SettingsStore>((set) => ({
  isOpen: false,
  openSettings: () => set({ isOpen: true }),
  closeSettings: () => set({ isOpen: false }),
}));
