/** Formatierungshelfer (de-CH). Keine Logik zur Datenbeschaffung. */

const intFmt = new Intl.NumberFormat("de-CH", { maximumFractionDigits: 0 });
const pctFmt = new Intl.NumberFormat("de-CH", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 2 });

export const NA = "Nicht verfügbar";

export function gp(v: number | null | undefined, opts: { sign?: boolean } = {}): string {
  if (v == null || !Number.isFinite(v)) return NA;
  const s = intFmt.format(Math.round(v));
  return opts.sign && v > 0 ? `+${s}` : s;
}

/** Kompakte Darstellung: 1.2K, 3.45M, 1.1B */
export function gpShort(v: number | null | undefined, opts: { sign?: boolean } = {}): string {
  if (v == null || !Number.isFinite(v)) return NA;
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : opts.sign && v > 0 ? "+" : "";
  if (abs >= 1e9) return `${sign}${trim(abs / 1e9)}B`;
  if (abs >= 1e6) return `${sign}${trim(abs / 1e6)}M`;
  if (abs >= 1e4) return `${sign}${trim(abs / 1e3)}K`;
  return `${sign}${intFmt.format(Math.round(abs))}`;
}

function trim(n: number) {
  return n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(2);
}

export function pct(v: number | null | undefined, opts: { sign?: boolean } = {}): string {
  if (v == null || !Number.isFinite(v)) return NA;
  const s = pctFmt.format(v);
  return opts.sign && v > 0 ? `+${s}` : s;
}

export function num(v: number | null | undefined, digits = 0): string {
  if (v == null || !Number.isFinite(v)) return NA;
  return new Intl.NumberFormat("de-CH", { maximumFractionDigits: digits }).format(v);
}

/** Relative Zeitangabe ("vor 18 Minuten") für Sekunden-Differenzen */
export function ago(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return NA;
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `vor ${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `vor ${m} min`;
  const h = Math.round(m / 6) / 10;
  if (h < 48) return `vor ${num(h, 1)} h`;
  return `vor ${Math.round(h / 24)} Tagen`;
}

export function agoFromUnix(unixSec: number | null | undefined, nowMs = Date.now()): string {
  if (unixSec == null) return NA;
  return ago(nowMs / 1000 - unixSec);
}

export function dateTime(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return NA;
  return new Intl.DateTimeFormat("de-CH", { dateStyle: "short", timeStyle: "short" }).format(new Date(ms));
}

export function date(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return NA;
  return new Intl.DateTimeFormat("de-CH", { dateStyle: "medium" }).format(new Date(ms));
}

export function duration(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return NA;
  const h = ms / 3_600_000;
  if (h < 1) return `${Math.max(1, Math.round(ms / 60_000))} min`;
  if (h < 48) return `${num(h, 1)} h`;
  return `${num(h / 24, 1)} Tage`;
}

export function iconUrl(icon: string | null | undefined): string | null {
  if (!icon) return null;
  return `https://oldschool.runescape.wiki/images/${encodeURIComponent(icon.replace(/ /g, "_"))}`;
}
