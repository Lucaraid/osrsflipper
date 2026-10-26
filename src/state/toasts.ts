"use client";
import { create } from "zustand";

export interface Toast {
  id: number;
  text: string;
  tone: "neutral" | "pos" | "neg" | "warn";
}

interface ToastState {
  toasts: Toast[];
  push: (text: string, tone?: Toast["tone"]) => void;
  dismiss: (id: number) => void;
}

let seq = 0;
export const useToasts = create<ToastState>((set, get) => ({
  toasts: [],
  push: (text, tone = "neutral") => {
    const id = ++seq;
    set({ toasts: [...get().toasts, { id, text, tone }].slice(-5) });
    setTimeout(() => get().dismiss(id), 6000);
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

export const toast = (text: string, tone?: Toast["tone"]) => useToasts.getState().push(text, tone);
