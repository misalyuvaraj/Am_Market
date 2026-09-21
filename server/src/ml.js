import { cached, round } from "./lib.js";
import { INDEX_MAP } from "./universe.js";
import { bollinger, ema, liveNews, macd, nseGet, rsi, sma, yahooQuote, yahooQuoteLive } from "./market.js";
import { applyLiveLast, liveQuote } from "./snapshot.js";

const BULL_WORDS = /\b(surge|rally|soar|jump|gain|profit|beat|upgrade|record|strong|bull|boom|growth|outperform|buyback|dividend|all[- ]time high)\b/i;
const BEAR_WORDS = /\b(crash|plunge|slump|fall|drop|loss|miss|downgrade|fraud|probe|weak|bear|selloff|layoff|default|warning|recession|all[- ]time low)\b/i;

const INDEX_KEYS = new Set(["NIFTY", "BANKNIFTY", "SENSEX", "FINNIFTY", "MIDCPNIFTY", "INDIAVIX"]);
const NO_FUND = new Set([...INDEX_KEYS, "BTCUSD", "BTCINR", "BTC", ...Object.keys(INDEX_MAP).filter((k) => INDEX_MAP[k]?.yahoo?.includes("="))]);

function yahooId(key) {
  const k = String(key || "NIFTY").toUpperCase();
  if (INDEX_MAP[k]) return INDEX_MAP[k].yahoo;
  if (k.includes("=") || k.includes("-") || k.includes(".")) return k;
  return `${k}.NS`;
}

function linreg(ys) {
  const n = ys.length;
  if (n < 5) return { slope: 0, r2: 0 };
  let sx = 0;
  let sy = 0;
  let sxy = 0;
  let sx2 = 0;
  let sy2 = 0;
  for (let i = 0; i < n; i++) {
    const y = ys[i];
    sx += i;
    sy += y;
    sxy += i * y;
    sx2 += i * i;
    sy2 += y * y;
  }
  const den = n * sx2 - sx * sx;
  const slope = den ? (n * sxy - sx * sy) / den : 0;
  const intercept = (sy - slope * sx) / n;
  let ssRes = 0;
  let ssTot = 0;
  const mean = sy / n;
  for (let i = 0; i < n; i++) {
    const pred = intercept + slope * i;
    ssRes += (ys[i] - pred) ** 2;
    ssTot += (ys[i] - mean) ** 2;
  }
  return { slope, r2: ssTot ? 1 - ssRes / ssTot : 0 };
}

function atr(candles, n = 14) {
  if (candles.length < n + 1) return null;
  const trs = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const p = candles[i - 1];
    trs.push(Math.max(c.h - c.l, Math.abs(c.h - p.c), Math.abs(c.l - p.c)));
  }
  return sma(trs, n);
}

function realizedVol(closes, n = 20) {
  if (closes.length < n + 1) return null;
  const rets = [];
  for (let i = closes.length - n; i < closes.length; i++) {
    if (closes[i - 1] > 0) rets.push(Math.log(closes[i] / closes[i - 1]));
  }
  if (rets.length < 5) return null;
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const varc = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length;
  return Math.sqrt(varc) * Math.sqrt(252) * 100;
}

function maxDrawdown(closes) {
  let peak = closes[0] || 0;
  let dd = 0;
  for (const c of closes) {
    if (c > peak) peak = c;
    if (peak) dd = Math.min(dd, (c - peak) / peak);
  }
  return dd * 100;
}

function scoreSentiment(items) {
  let pos = 0;
  let neg = 0;
  const tagged = (items || []).slice(0, 12).map((n) => {
    const text = `${n.title || ""} ${n.description || ""}`;
    const up = BULL_WORDS.test(text);
    const down = BEAR_WORDS.test(text);
    if (up) pos += 1;
    if (down) neg += 1;
    return {
      title: n.title,
      link: n.link,
      source: n.source,
      tone: up && !down ? "bullish" : down && !up ? "bearish" : "neutral"
    };
  });
  const total = pos + neg || 1;
  const score = round(((pos - neg) / total) * 100, 0);
  const bias = score >= 25 ? "Bullish" : score <= -25 ? "Bearish" : "Mixed";
  return { score, bias, pos, neg, headlines: tagged };
}

async function nseFundamentals(symbol) {
  const data = await nseGet(`/api/quote-equity?symbol=${encodeURIComponent(symbol)}`, 10000);
  const meta = data?.metadata || {};
  const price = data?.priceInfo || {};
  const info = data?.info || {};
  const pe = Number(meta.pdSymbolPe);
  const sectorPe = Number(meta.pdSectorPe);
  const eps = Number(meta.eps);
  const book = Number(meta.bookValue ?? meta.bv);
  const high = Number(price.weekHighLow?.max);
  const low = Number(price.weekHighLow?.min);
  if (!info.companyName && !Number.isFinite(pe) && !Number.isFinite(high)) return null;
  return {
    name: info.companyName || symbol,
    currency: "INR",
    marketCap: null,
    trailingPE: Number.isFinite(pe) ? pe : null,
    forwardPE: null,
    eps: Number.isFinite(eps) ? eps : null,
    bookValue: Number.isFinite(book) ? book : null,
    priceToBook: Number.isFinite(book) && book && price.lastPrice ? price.lastPrice / book : null,
    beta: null,
    dividendYield: Number.isFinite(Number(meta.yield)) ? Number(meta.yield) : null,
    profitMargins: null,
    revenueGrowth: null,
    earningsGrowth: null,
    week52High: Number.isFinite(high) ? high : null,
    week52Low: Number.isFinite(low) ? low : null,
    avgVolume: null,
    targetMean: null,
    recommendation: meta.pdSectorInd || null,
    sectorPe: Number.isFinite(sectorPe) ? sectorPe : null
  };
}

function newsTopic(key) {
  const k = String(key || "").toUpperCase();
  if (k === "NIFTY" || k === "BANKNIFTY" || k === "FINNIFTY") return "nse";
  if (k === "SENSEX") return "bse";
  if (k.startsWith("BTC")) return "btc";
  if (k.includes("USD") || k.includes("INR") || k === "DXY") return "forex";
  return k;
}

export async function analyzeSymbol(key = "NIFTY") {
  const symbol = String(key || "NIFTY").toUpperCase();
  return cached(`ml:${symbol}`, 4000, async () => {
    const yid = yahooId(symbol);
    const q = liveQuote(symbol);
    const [chart, live, news, funds] = await Promise.allSettled([
      yahooQuote(yid, "6mo", "1d"),
      q ? Promise.resolve(q) : yahooQuoteLive(yid),
      liveNews(newsTopic(symbol)),
      NO_FUND.has(symbol) ? Promise.resolve(null) : nseFundamentals(symbol)
    ]);
    if (chart.status !== "fulfilled") throw chart.reason || new Error("chart failed");
    const pack = applyLiveLast(chart.value, symbol, live.status === "fulfilled" ? live.value : null);
    const candles = (pack.candles || []).filter((c) => c.c);
    const closes = candles.map((c) => c.c);
    const volumes = candles.map((c) => Number(c.v) || 0);
    const last = closes.at(-1);
    const prev = closes.at(-2);
    const s20 = sma(closes, 20);
    const s50 = sma(closes, 50);
    const s200 = sma(closes, 200);
    const e9 = ema(closes, 9);
    const e21 = ema(closes, 21);
    const r = rsi(closes, 14);
    const m = macd(closes);
    const bb = bollinger(closes, 20);
    const vol20 = sma(volumes, 20);
    const lastVol = volumes.at(-1) || 0;
    const volRatio = vol20 ? lastVol / vol20 : null;
    const week = closes.length > 6 ? pctChange(closes.at(-6), last) : null;
    const month = closes.length > 21 ? pctChange(closes.at(-21), last) : null;
    const threeMo = closes.length > 63 ? pctChange(closes.at(-63), last) : null;
    const fit20 = linreg(closes.slice(-20));
    const fit50 = linreg(closes.slice(-50));
    const slopePct = last ? (fit20.slope / last) * 100 : 0;
    const hh = higherHighs(candles.slice(-12));
    const ll = higherLows(candles.slice(-12));
    const rv20 = realizedVol(closes, 20);
    const rv60 = realizedVol(closes, 60);
    const atr14 = atr(candles, 14);
    const dd = maxDrawdown(closes.slice(-63));
    const headlines = news.status === "fulfilled" ? news.value : [];
    const sentiment = scoreSentiment(headlines);
    let financials = funds.status === "fulfilled" ? funds.value : null;
    if (!financials) {
      const hi = pack.fiftyTwoWeekHigh || Math.max(...candles.map((c) => c.h));
      const lo = pack.fiftyTwoWeekLow || Math.min(...candles.map((c) => c.l));
      financials = {
        name: pack.name,
        week52High: hi,
        week52Low: lo,
        trailingPE: null,
        forwardPE: null,
        eps: null,
        bookValue: null,
        priceToBook: null,
        beta: null,
        dividendYield: null,
        profitMargins: null,
        revenueGrowth: null,
        earningsGrowth: null,
        avgVolume: pack.volume || null,
        recommendation: null,
        sectorPe: null
      };
    }

    const techSignals = [];
    if (s20 && last > s20) techSignals.push({ name: "Price > SMA20", bias: "bullish" });
    else if (s20) techSignals.push({ name: "Price < SMA20", bias: "bearish" });
    if (s20 && s50) techSignals.push({ name: s20 > s50 ? "SMA20 > SMA50" : "SMA20 < SMA50", bias: s20 > s50 ? "bullish" : "bearish" });
    if (s200) techSignals.push({ name: last > s200 ? "Above 200 DMA" : "Below 200 DMA", bias: last > s200 ? "bullish" : "bearish" });
    if (e9 && e21) techSignals.push({ name: e9 > e21 ? "EMA9 > EMA21" : "EMA9 < EMA21", bias: e9 > e21 ? "bullish" : "bearish" });
    if (r != null) {
      techSignals.push({
        name: r > 70 ? "RSI overbought" : r < 30 ? "RSI oversold" : "RSI neutral",
        bias: r > 70 ? "bearish" : r < 30 ? "bullish" : "neutral",
        value: round(r, 1)
      });
    }
    if (m) techSignals.push({ name: m.macd >= 0 ? "MACD above zero" : "MACD below zero", bias: m.macd >= 0 ? "bullish" : "bearish" });
    if (bb) {
      techSignals.push({
        name: last > bb.upper ? "Above upper Bollinger" : last < bb.lower ? "Below lower Bollinger" : "Inside Bollinger",
        bias: last > bb.upper ? "bearish" : last < bb.lower ? "bullish" : "neutral"
      });
    }
    const bull = techSignals.filter((s) => s.bias === "bullish").length;
    const bear = techSignals.filter((s) => s.bias === "bearish").length;
    const techBias = bull > bear + 1 ? "Bullish" : bear > bull + 1 ? "Bearish" : "Neutral";

    const trendBias = slopePct > 0.08 && hh ? "Bullish" : slopePct < -0.08 && ll === false ? "Bearish" : "Range";
    let composite = 50;
    composite += clamp(slopePct * 40, -12, 12);
    composite += (bull - bear) * 3;
    composite += clamp(sentiment.score * 0.12, -10, 10);
    if (volRatio > 1.6 && last > prev) composite += 4;
    if (volRatio > 1.6 && last < prev) composite -= 4;
    if (r > 72) composite -= 6;
    if (r < 28) composite += 6;
    if (rv20 && rv60 && rv20 > rv60 * 1.35) composite -= 5;
    if (financials?.trailingPE && financials.trailingPE > 40) composite -= 2;
    if (financials?.trailingPE && financials.trailingPE > 0 && financials.trailingPE < 18) composite += 2;
    composite = clamp(composite, 8, 92);

    const lean = composite >= 58 ? "Bullish" : composite <= 42 ? "Bearish" : "Range / Mixed";
    const confidence = Math.round(clamp(Math.abs(composite - 50) * 1.6 + (fit20.r2 || 0) * 20, 32, 78));
    const alerts = buildAlerts({
      symbol,
      last,
      prev,
      r,
      s20,
      s50,
      volRatio,
      sentiment,
      rv20,
      rv60,
      atr14,
      bb,
      week52High: financials?.week52High,
      week52Low: financials?.week52Low,
      lean,
      confidence
    });

    return {
      symbol,
      name: pack.name || INDEX_MAP[symbol]?.name || symbol,
      price: pack.price,
      changePct: pack.changePct,
      generatedAt: new Date().toISOString(),
      live: true,
      tickAt: pack.tickAt || Date.now(),
      disclaimer: "Educational pattern read from the live tape plus daily history. Not SEBI-registered advice. Patterns can fail.",
      score: Math.round(composite),
      lean,
      confidence,
      horizon: "1–5 sessions",
      trend: {
        bias: trendBias,
        dayPct: pack.changePct,
        weekPct: week,
        monthPct: month,
        threeMonthPct: threeMo,
        slopePerDayPct: round(slopePct, 3),
        r2: round(fit20.r2, 2),
        higherHighs: hh,
        higherLows: ll,
        vsSma20: s20 ? round(last - s20, 2) : null,
        summary: trendText(trendBias, week, month)
      },
      history: {
        bars: candles.length,
        lastVolume: lastVol,
        avgVolume20: vol20 ? Math.round(vol20) : null,
        volumeRatio: volRatio ? round(volRatio, 2) : null,
        volumeBias: volumeBias(volRatio, last, prev),
        high20: round(Math.max(...candles.slice(-20).map((c) => c.h)), 2),
        low20: round(Math.min(...candles.slice(-20).map((c) => c.l)), 2),
        range20Pct: rangePct(candles.slice(-20))
      },
      sentiment,
      financials: {
            ...mapFin(financials),
            note: financials.trailingPE
              ? "NSE live quote: symbol P/E, EPS, 52-week range. Not a full annual report."
              : NO_FUND.has(symbol)
                ? "No company P&L on an index / FX / BTC. Pick RELIANCE, INFY or TCS for equity multiples when NSE quote is open."
                : "52-week range from live daily history. P/E and EPS fill in when the NSE equity quote is reachable."
          },
      technicals: {
        bias: techBias,
        rsi: round(r, 1),
        macd: m ? round(m.macd, 2) : null,
        sma20: round(s20, 2),
        sma50: round(s50, 2),
        sma200: round(s200, 2),
        ema9: round(e9, 2),
        ema21: round(e21, 2),
        bollinger: bb
          ? { mid: round(bb.mid, 2), upper: round(bb.upper, 2), lower: round(bb.lower, 2), width: round(bb.width * 100, 2) }
          : null,
        signals: techSignals
      },
      risk: {
        realizedVol20: round(rv20, 1),
        realizedVol60: round(rv60, 1),
        atr14: round(atr14, 2),
        atrPct: last && atr14 ? round((atr14 / last) * 100, 2) : null,
        drawdown3m: round(dd, 1),
        beta: financials?.beta ?? null,
        volRegime: volRegime(rv20, rv60),
        summary: riskText(rv20, rv60, dd)
      },
      forecast: {
        lean,
        confidence,
        horizon: "1–5 sessions",
        expectedMovePct: last && atr14 ? round((atr14 / last) * 100 * 1.2, 2) : null,
        summary: forecastText(lean, confidence, symbol),
        next: last && atr14
          ? {
              support: round(last - atr14, 2),
              resistance: round(last + atr14, 2)
            }
          : null
      },
      alerts,
      spark: pack.spark || closes.slice(-80)
    };
  });
}

function pctChange(from, to) {
  if (!from) return null;
  return round(((to - from) / from) * 100, 2);
}

function higherHighs(bars) {
  if (bars.length < 6) return false;
  const highs = bars.map((b) => b.h);
  return highs.at(-1) > highs.at(-3) && highs.at(-3) > highs.at(-6);
}

function higherLows(bars) {
  if (bars.length < 6) return false;
  const lows = bars.map((b) => b.l);
  return lows.at(-1) > lows.at(-3) && lows.at(-3) > lows.at(-6);
}

function rangePct(bars) {
  if (!bars.length) return null;
  const hi = Math.max(...bars.map((c) => c.h));
  const lo = Math.min(...bars.map((c) => c.l));
  const last = bars.at(-1).c;
  if (!hi || hi === lo) return null;
  return round(((last - lo) / (hi - lo)) * 100, 0);
}

function volumeBias(ratio, last, prev) {
  if (ratio == null) return "No volume on this feed";
  if (ratio > 1.6 && last >= prev) return "High volume on up day — accumulation lean";
  if (ratio > 1.6 && last < prev) return "High volume on down day — distribution lean";
  if (ratio < 0.7) return "Quiet tape — move may not travel far";
  return "Volume in a normal band";
}

function volRegime(rv20, rv60) {
  if (!rv20 || !rv60) return "Unknown";
  if (rv20 > rv60 * 1.35) return "Elevated";
  if (rv20 < rv60 * 0.8) return "Compressed";
  return "Normal";
}

function mapFin(f) {
  return {
    available: Boolean(f.trailingPE || f.week52High || f.eps),
    name: f.name,
    marketCap: f.marketCap,
    trailingPE: f.trailingPE != null ? round(f.trailingPE, 1) : null,
    forwardPE: f.forwardPE != null ? round(f.forwardPE, 1) : null,
    eps: f.eps != null ? round(f.eps, 2) : null,
    bookValue: f.bookValue != null ? round(f.bookValue, 2) : null,
    priceToBook: f.priceToBook != null ? round(f.priceToBook, 2) : null,
    beta: f.beta != null ? round(f.beta, 2) : null,
    dividendYield: f.dividendYield != null ? round(f.dividendYield, 2) : null,
    profitMargins: f.profitMargins != null ? round(f.profitMargins, 1) : null,
    revenueGrowth: f.revenueGrowth != null ? round(f.revenueGrowth, 1) : null,
    earningsGrowth: f.earningsGrowth != null ? round(f.earningsGrowth, 1) : null,
    week52High: f.week52High != null ? round(f.week52High, 2) : null,
    week52Low: f.week52Low != null ? round(f.week52Low, 2) : null,
    avgVolume: f.avgVolume,
    recommendation: f.recommendation,
    sectorPe: f.sectorPe != null ? round(f.sectorPe, 1) : null
  };
}

function trendText(bias, week, month) {
  const w = week != null ? `${week}% week` : "week n/a";
  const m = month != null ? `${month}% month` : "month n/a";
  if (bias === "Bullish") return `Uptrend lean on daily closes (${w}, ${m}).`;
  if (bias === "Bearish") return `Downtrend lean on daily closes (${w}, ${m}).`;
  return `Sideways / mixed trend (${w}, ${m}).`;
}

function riskText(rv20, rv60, dd) {
  const a = rv20 != null ? `${round(rv20, 1)}% 20d vol` : "vol n/a";
  const b = rv60 != null ? `${round(rv60, 1)}% 60d vol` : "";
  return `${a}${b ? ` vs ${b}` : ""}. 3-month drawdown ${round(dd, 1)}%.`;
}

function forecastText(lean, confidence, symbol) {
  if (lean === "Bullish") return `${symbol} historical mix leans constructive over 1–5 sessions (confidence ${confidence}%). Prefer defined-risk longs, not naked size.`;
  if (lean === "Bearish") return `${symbol} historical mix leans defensive over 1–5 sessions (confidence ${confidence}%). Hedges / put spreads over hero shorts.`;
  return `${symbol} patterns are two-sided (confidence ${confidence}%). Range structures around ATR bands are cleaner than a directional bet.`;
}

function buildAlerts(x) {
  const out = [];
  if (x.r > 70) out.push({ level: "warn", text: `RSI ${round(x.r, 1)} is overbought — pullback risk is elevated.` });
  if (x.r < 30) out.push({ level: "info", text: `RSI ${round(x.r, 1)} is oversold — bounce setups get better odds, not a guarantee.` });
  if (x.volRatio > 1.8) out.push({ level: "info", text: `Volume is ${round(x.volRatio, 1)}× the 20-day average — the move has participation.` });
  if (x.s20 && x.s50 && Math.abs(x.s20 - x.s50) / x.last < 0.004) out.push({ level: "info", text: "SMA20 and SMA50 are coiled — a cross can fire soon." });
  if (x.rv20 && x.rv60 && x.rv20 > x.rv60 * 1.4) out.push({ level: "warn", text: "Realized volatility is spiking versus the 60-day baseline." });
  if (x.bb && x.last > x.bb.upper) out.push({ level: "warn", text: "Price is above the upper Bollinger band — mean reversion risk." });
  if (x.bb && x.last < x.bb.lower) out.push({ level: "info", text: "Price is below the lower Bollinger band — stretch to the downside." });
  if (x.week52High && x.last / x.week52High > 0.98) out.push({ level: "info", text: `${x.symbol} is testing the 52-week high zone.` });
  if (x.week52Low && x.last / x.week52Low < 1.04) out.push({ level: "warn", text: `${x.symbol} is near the 52-week low zone.` });
  if (x.sentiment.bias === "Bearish" && x.lean === "Bullish") out.push({ level: "warn", text: "Price lean is up but news tone is negative — headline risk." });
  if (x.sentiment.bias === "Bullish" && x.lean === "Bearish") out.push({ level: "info", text: "News is constructive while price is still defensive — wait for tape confirmation." });
  if (!out.length) out.push({ level: "info", text: `No extreme pattern alert. Composite lean is ${x.lean} at ${x.confidence}% confidence.` });
  return out.slice(0, 6);
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

export function mlSnapshot(ml) {
  if (!ml) return "";
  return [
    `ML ${ml.symbol} lean ${ml.lean} score ${ml.score} confidence ${ml.confidence}% horizon ${ml.horizon}`,
    `Trend ${ml.trend?.bias} week ${ml.trend?.weekPct}% month ${ml.trend?.monthPct}%`,
    `Tech RSI ${ml.technicals?.rsi} MACD ${ml.technicals?.macd} SMA20 ${ml.technicals?.sma20} SMA200 ${ml.technicals?.sma200}`,
    `Risk vol20 ${ml.risk?.realizedVol20}% ATR% ${ml.risk?.atrPct} DD3m ${ml.risk?.drawdown3m}%`,
    `News tone ${ml.sentiment?.bias} (${ml.sentiment?.pos} up / ${ml.sentiment?.neg} down)`,
    ml.financials?.trailingPE ? `PE ${ml.financials.trailingPE} EPS ${ml.financials.eps} PB ${ml.financials.priceToBook}` : "No company statements",
    `Alerts: ${(ml.alerts || []).map((a) => a.text).join(" | ")}`
  ].join("\n");
}
