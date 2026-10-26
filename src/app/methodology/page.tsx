import type { Metadata } from "next";
import { RANK_WEIGHTS } from "@/lib/analysis/scanner";
import { TAX_RULES } from "@/lib/tax/rules";

export const metadata: Metadata = { title: "Methodology" };

function H({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-1.5 mt-6 text-base font-semibold">{children}</h2>;
}

export default function MethodologyPage() {
  const w = RANK_WEIGHTS;
  return (
    <article className="max-w-3xl text-sm leading-relaxed text-muted [&_b]:text-text [&_li]:mb-1 [&_table]:my-2 [&_td]:border-b [&_td]:border-border [&_td]:px-2 [&_td]:py-1 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:text-text [&_ul]:list-disc [&_ul]:pl-5">
      <h1 className="text-2xl font-extrabold text-text">Methodology & transparency</h1>
      <p className="mt-1">How OSRS GE Flipper calculates its numbers. All formulas live in the source code under <code>src/lib</code> and are covered by automated tests.</p>

      <H>Data source</H>
      <ul>
        <li><b>OSRS Wiki Real-time Prices API v2</b> (<code>prices.runescape.wiki/api/v2/osrs</code>): <code>/mapping</code> (metadata, limits), <code>/latest</code> (last instant-buy/-sell observation), <code>/5m</code> and <code>/1h</code> (averages & volume per block), <code>/timeseries</code> (history: 6h, 24h, 7d, 30d, 6m, 1y).</li>
        <li>According to the wiki, data has come from Jagex (all clients) since 30 Sep 2026; before that only from RuneLite users. Older history is therefore based on a smaller sample.</li>
        <li>There is <b>no public order book</b>. “Instant-buy” is the last price someone bought at instantly; “instant-sell” the last price of an instant sale. That doesn’t mean you can trade at those prices right now.</li>
        <li>Caching: server cache (latest/5m 60 s, 1h 5 min, mapping 6 h, completed hourly blocks 26 h). If the API fails, the last successful data is shown with its age – never made-up values.</li>
      </ul>

      <H>GE tax</H>
      <p>
        {TAX_RULES.rate * 100}% of the sell price <b>per item</b>, rounded down to whole coins (so prices under 50 gp are tax-free), at most {TAX_RULES.capPerItem.toLocaleString("de-CH")} gp per item. {Object.keys(TAX_RULES.exemptItems).length} items are exempt (e.g. Old school bond, energy potions, basic tools, teleport tablets). As of {TAX_RULES.verifiedAt}.
      </p>

      <H>Scanner estimates</H>
      <ul>
        <li>Est. buy price = last instant-sell + offset; est. sell price = last instant-buy − offset (offset adjustable, default 1 gp).</li>
        <li>Net margin = sell − tax(sell) − buy. ROI = net margin ÷ buy.</li>
        <li>Quantity = min(⌊capital ÷ buy⌋, GE limit). Only known limits are used; if the limit is missing, “Not available” is shown.</li>
        <li>Profit @ capital = net margin × quantity. Potential per limit = net margin × limit (independent of capital).</li>
      </ul>

      <H>Data quality (0–100)</H>
      <table>
        <thead><tr><th>Component</th><th>Points</th><th>Basis</th></tr></thead>
        <tbody>
          <tr><td>Freshness</td><td>30</td><td>15 per price side; full until “fresh”, linear down to 0 at “stale”</td></tr>
          <tr><td>Both price sides</td><td>10</td><td>instant-buy and instant-sell available</td></tr>
          <tr><td>Activity 1 h</td><td>15</td><td>volume on both (15) or one side (7)</td></tr>
          <tr><td>History 24 h</td><td>25</td><td>share of active hours (15) + hours with both sides (10)</td></tr>
          <tr><td>Plausibility</td><td>20</td><td>current spread vs. 24h average spread; inversion and &gt; 30% deviation from the 24h mean are penalised</td></tr>
        </tbody>
      </table>

      <H>Risk (0–100, higher = riskier)</H>
      <table>
        <thead><tr><th>Component</th><th>max</th><th>Basis</th></tr></thead>
        <tbody>
          <tr><td>Volatility</td><td>30</td><td>coefficient of variation of hourly average prices (24 h): 0% → 0, ≥ 5% → 30</td></tr>
          <tr><td>Liquidity</td><td>30</td><td>24h volume on the weaker side ÷ planned quantity: ≥ 5× → 0, ≤ 0.5× → 30 (log)</td></tr>
          <tr><td>Spread</td><td>20</td><td>(instant-buy − instant-sell) ÷ instant-sell: ≤ 1% → 0, ≥ 10% → 20</td></tr>
          <tr><td>Data quality</td><td>20</td><td>(100 − quality) × 0.2</td></tr>
        </tbody>
      </table>
      <p>Classes: &lt; 30 low, &lt; 60 medium, otherwise high.</p>

      <H>Score (0–100)</H>
      <p>Weighted sum of normalised factors (each 0–1), multiplied by a <b>plausibility factor</b> of 0.5–1 (from the plausibility part of data quality). Items without a positive net margin get 0.</p>
      <p>Profit and ROI are counted <b>conservatively</b>: the smaller of (a) the margin from the last observation and (b) a margin using the last 1h block’s average prices (sell = min(last, avg instant-buy), buy = max(last, avg instant-sell)). That way single outlier trades don’t float to the top.</p>
      <table>
        <thead><tr><th>Factor</th><th>Weight</th><th>Normalisation</th></tr></thead>
        <tbody>
          <tr><td>Profit potential @ capital (conservative)</td><td>{w.profit * 100}%</td><td>log₁₀(1 + profit) ÷ 7 (10M gp → 1)</td></tr>
          <tr><td>ROI (conservative)</td><td>{w.roi * 100}%</td><td>ROI ÷ 10% (capped)</td></tr>
          <tr><td>Liquidity</td><td>{w.liquidity * 100}%</td><td>log₁₀(1 + coverage) ÷ log₁₀(11) (10× → 1)</td></tr>
          <tr><td>Stability</td><td>{w.stability * 100}%</td><td>1 − (volatility + spread risk points) ÷ 50</td></tr>
          <tr><td>Freshness</td><td>{w.freshness * 100}%</td><td>freshness points ÷ 30</td></tr>
          <tr><td>Data quality</td><td>{w.quality * 100}%</td><td>quality ÷ 100</td></tr>
        </tbody>
      </table>
      <p>The score is a <b>decision aid</b>, not a probability of profit. The reasons are shown for each item.</p>

      <H>Market indicators (item page)</H>
      <ul>
        <li>Price per time step = volume-weighted mean of average instant-buy and average instant-sell.</li>
        <li>Price change = (last − first point with trades) ÷ first. Volatility = standard deviation of log returns (per time step, not annualised).</li>
        <li>Median, mean, min/max, range = (max − min) ÷ mean, deviation = (last − mean) ÷ mean.</li>
        <li>With fewer than 10 points with trades, stats are considered unreliable. Gaps are never interpolated.</li>
      </ul>

      <H>Trades, FIFO & portfolio</H>
      <ul>
        <li>Sales are matched to the oldest open buys using <b>FIFO</b>; a buy’s fees are spread across its items. Overselling is rejected.</li>
        <li>Cash = capital entries − buys + net sale proceeds. Open buy offers reserve cash but are only deducted once logged as a buy (no double counting).</li>
        <li>Est. market value of open items = quantity × (last instant-sell − tax). Without a market price they are valued at cost.</li>
      </ul>
    </article>
  );
}
