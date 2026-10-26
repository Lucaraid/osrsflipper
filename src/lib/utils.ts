import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Parst Mengen-/Preis-Eingaben im OSRS-Stil: "1.5m", "250k", "2b", "1'000'000", "1 000".
 * Gibt null zurück, wenn die Eingabe leer oder ungültig ist.
 */
export function parseAmount(input: string): number | null {
  const s = input.trim().toLowerCase().replace(/['’\s_]/g, "").replace(/,/g, ".");
  if (!s) return null;
  const m = /^(-?\d+(?:\.\d+)?)([kmb])?$/.exec(s);
  if (!m) return null;
  const n = Number(m[1]);
  const mult = m[2] === "k" ? 1e3 : m[2] === "m" ? 1e6 : m[2] === "b" ? 1e9 : 1;
  const v = Math.round(n * mult);
  return Number.isFinite(v) ? v : null;
}
