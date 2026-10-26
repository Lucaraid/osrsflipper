"use client";
import { create } from "zustand";

/** Zuletzt im Profit-Rechner eingegebene Werte je Item – Grundlage für „Trade erfassen“. */
export interface CalcValues {
  buy: number | null;
  sell: number | null;
  qty: number | null;
}

interface CalcState {
  byItem: Record<number, CalcValues>;
  set: (itemId: number, v: CalcValues) => void;
}

export const useCalcStore = create<CalcState>((set, get) => ({
  byItem: {},
  set: (itemId, v) => set({ byItem: { ...get().byItem, [itemId]: v } }),
}));
