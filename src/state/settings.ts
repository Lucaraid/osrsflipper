"use client";
import { create } from "zustand";
import { DEFAULT_SETTINGS, type Settings } from "@/lib/storage/settings-schema";
import { loadSettings, saveSettings } from "@/lib/storage/settings-store";

interface SettingsState {
  settings: Settings;
  hydrated: boolean;
  hydrate: () => void;
  update: (patch: Partial<Settings>) => void;
  replace: (s: Settings) => void;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  hydrated: false,
  hydrate: () => {
    if (get().hydrated) return;
    set({ settings: loadSettings(), hydrated: true });
  },
  update: (patch) => {
    const next = { ...get().settings, ...patch };
    saveSettings(next);
    set({ settings: next });
  },
  replace: (s) => {
    saveSettings(s);
    set({ settings: s });
  },
}));

export const useSettings = () => useSettingsStore((s) => s.settings);
