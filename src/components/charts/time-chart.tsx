"use client";
import {
  AreaSeries,
  ColorType,
  createChart,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type MouseEventParams,
  type SeriesType,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { gp, gpShort } from "@/lib/format";

export interface ChartSeries {
  name: string;
  type: "line" | "histogram" | "area";
  color: string;
  /** 0 = Hauptbereich, 1 = unterer Bereich (z. B. Volumen) */
  pane?: 0 | 1;
  /** Zeit in Unix-Sekunden; value null = Datenlücke (wird nicht interpoliert) */
  data: Array<{ time: number; value: number | null }>;
}

function cssVar(name: string, fallback: string) {
  if (typeof window === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function subscribeTheme(cb: () => void) {
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => obs.disconnect();
}

function useTheme() {
  return useSyncExternalStore(subscribeTheme, () => document.documentElement.dataset.theme ?? "light", () => "light");
}

/**
 * Interaktiver Zeitreihen-Chart (Zoom per Mausrad/Pinch, Verschieben per Drag, Tooltip bei Hover).
 * Fehlende Werte werden als Lücke dargestellt.
 */
const defaultFormat = (v: number) => gp(v);

/** Escaping für den Tooltip (Seriennamen können Item-Namen aus externen Daten enthalten). */
function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}
const SAFE_COLOR = /^#[0-9a-f]{3,8}$/i;

export function TimeChart({ series, height = 320, formatValue = defaultFormat, timeVisible = true }: { series: ChartSeries[]; height?: number; formatValue?: (v: number) => string; timeVisible?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const theme = useTheme();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const text = cssVar("--muted", "#8a93a1");
    const grid = cssVar("--chart-grid", "#1f242c");
    const border = cssVar("--border", "#272d36");
    const chart: IChartApi = createChart(el, {
      height,
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: text, fontSize: 11, panes: { separatorColor: border }, attributionLogo: false },
      grid: { vertLines: { color: grid }, horzLines: { color: grid } },
      rightPriceScale: { borderColor: border },
      timeScale: { borderColor: border, timeVisible, secondsVisible: false },
      crosshair: { mode: CrosshairMode.Normal },
      localization: {
        locale: "de-CH",
        priceFormatter: (v: number) => gpShort(v),
        timeFormatter: (t: Time) => new Date((t as number) * 1000).toLocaleString("de-CH", { dateStyle: "short", timeStyle: "short" }),
      },
    });

    const apis: Array<{ s: ChartSeries; api: ISeriesApi<SeriesType> }> = [];
    for (const s of series) {
      const data = s.data.map((d) => (d.value == null ? { time: d.time as UTCTimestamp } : { time: d.time as UTCTimestamp, value: d.value }));
      let api: ISeriesApi<SeriesType>;
      if (s.type === "histogram") {
        api = chart.addSeries(HistogramSeries, { color: s.color, priceFormat: { type: "volume" }, lastValueVisible: false, priceLineVisible: false }, s.pane ?? 0);
      } else if (s.type === "area") {
        api = chart.addSeries(AreaSeries, { lineColor: s.color, topColor: `${s.color}40`, bottomColor: `${s.color}05`, lineWidth: 2, priceLineVisible: false }, s.pane ?? 0);
      } else {
        api = chart.addSeries(LineSeries, { color: s.color, lineWidth: 2, priceLineVisible: false }, s.pane ?? 0);
      }
      api.setData(data as never);
      apis.push({ s, api });
    }
    if (series.some((s) => s.pane === 1)) {
      const panes = chart.panes();
      panes[1]?.setHeight(Math.round(height * 0.25));
    }
    chart.timeScale().fitContent();

    const onMove = (p: MouseEventParams) => {
      const tip = tipRef.current;
      if (!tip) return;
      if (!p.time || !p.point || p.point.x < 0 || p.point.y < 0) {
        tip.style.display = "none";
        return;
      }
      const rows = apis
        .map(({ s, api }) => {
          const d = p.seriesData.get(api) as { value?: number } | undefined;
          const v = d && typeof d.value === "number" ? (s.type === "histogram" ? d.value.toLocaleString("de-CH") : formatValue(d.value)) : "no data";
          const color = SAFE_COLOR.test(s.color) ? s.color : "inherit";
          return `<div style="display:flex;gap:8px;justify-content:space-between"><span style="color:${color}">${esc(s.name)}</span><span class="num">${esc(v)}</span></div>`;
        })
        .join("");
      tip.innerHTML = `<div style="color:var(--muted);margin-bottom:2px">${new Date((p.time as number) * 1000).toLocaleString("de-CH", { dateStyle: "short", timeStyle: "short" })}</div>${rows}`;
      tip.style.display = "block";
      const w = el.clientWidth;
      tip.style.left = `${Math.min(Math.max(p.point.x + 12, 0), w - 190)}px`;
      tip.style.top = `${Math.max(p.point.y - 10, 0)}px`;
    };
    chart.subscribeCrosshairMove(onMove);
    return () => {
      chart.unsubscribeCrosshairMove(onMove);
      chart.remove();
    };
  }, [series, height, formatValue, theme, timeVisible]);

  return (
    <div className="relative" style={{ height }}>
      <div ref={ref} className="h-full w-full" />
      <div
        ref={tipRef}
        className="pointer-events-none absolute z-10 hidden w-[180px] rounded-md border border-border bg-surface-3 px-2 py-1.5 text-[11px] shadow-lg"
        aria-hidden
      />
    </div>
  );
}
