import { cached, num, round } from "./lib.js";
import { INDEX_MAP } from "./universe.js";
import { nseGet, yahooQuote } from "./market.js";
import { liveQuote } from "./snapshot.js";

function ndist(x) {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const z = Math.abs(x) / Math.sqrt(2);
  const t = 1 / (1 + p * z);
  const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-z * z);
  return 0.5 * (1 + sign * y);
}

function npdf(x) {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

export function blackScholes({ spot, strike, days, iv, rate = 0.065, type = "CE" }) {
  const T = Math.max(days, 0.01) / 365;
  const sigma = Math.max(iv, 0.01);
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(spot / strike) + (rate + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  const disc = Math.exp(-rate * T);
  const call = spot * ndist(d1) - strike * disc * ndist(d2);
  const put = strike * disc * ndist(-d2) - spot * ndist(-d1);
  const delta = type === "CE" ? ndist(d1) : ndist(d1) - 1;
  const gamma = npdf(d1) / (spot * sigma * sqrtT);
  const vega = (spot * npdf(d1) * sqrtT) / 100;
  const thetaCall = (-spot * npdf(d1) * sigma) / (2 * sqrtT) - rate * strike * disc * ndist(d2);
  const thetaPut = (-spot * npdf(d1) * sigma) / (2 * sqrtT) + rate * strike * disc * ndist(-d2);
  const theta = (type === "CE" ? thetaCall : thetaPut) / 365;
  const rho = type === "CE" ? (strike * T * disc * ndist(d2)) / 100 : (-strike * T * disc * ndist(-d2)) / 100;
  return {
    price: round(type === "CE" ? call : put, 2),
    delta: round(delta, 4),
    gamma: round(gamma, 6),
    theta: round(theta, 2),
    vega: round(vega, 2),
    rho: round(rho, 2)
  };
}

function daysTo(expiry) {
  if (!expiry) return 7;
  const d = new Date(expiry);
  if (Number.isNaN(d.getTime())) {
    const m = String(expiry).match(/(\d{2})-([A-Za-z]{3})-(\d{4})/);
    if (m) {
      const months = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
      const dt = new Date(Number(m[3]), months[m[2]], Number(m[1]));
      return Math.max((dt - Date.now()) / 86400000, 0.2);
    }
    return 7;
  }
  return Math.max((d - Date.now()) / 86400000, 0.2);
}

function maxPain(rows, spot) {
  let best = spot;
  let bestCost = Infinity;
  for (const row of rows) {
    let cost = 0;
    for (const r of rows) {
      if (row.strike > r.strike) cost += (row.strike - r.strike) * r.ceOi;
      if (row.strike < r.strike) cost += (r.strike - row.strike) * r.peOi;
    }
    if (cost < bestCost) {
      bestCost = cost;
      best = row.strike;
    }
  }
  return best;
}

function normalizeChain(raw, symbol) {
  const records = raw?.records || raw;
  const data = records?.data || [];
  const expiryDates = records?.expiryDates || [];
  const spot = num(records?.underlyingValue);
  const rows = data
    .map((d) => {
      const ce = d.CE || d.ce || {};
      const pe = d.PE || d.pe || {};
      const strike = num(d.strikePrice || ce.strikePrice || pe.strikePrice);
      if (!strike) return null;
      return {
        strike,
        expiry: d.expiryDate || d.expiryDates || ce.expiryDate || pe.expiryDate,
        ceLtp: num(ce.lastPrice),
        ceOi: num(ce.openInterest),
        ceChgOi: num(ce.changeinOpenInterest),
        ceIv: num(ce.impliedVolatility),
        ceVol: num(ce.totalTradedVolume),
        ceBid: num(ce.bidprice || ce.bidPrice || ce.buyPrice1),
        ceAsk: num(ce.askPrice || ce.sellPrice1),
        ceChg: num(ce.change),
        peLtp: num(pe.lastPrice),
        peOi: num(pe.openInterest),
        peChgOi: num(pe.changeinOpenInterest),
        peIv: num(pe.impliedVolatility),
        peVol: num(pe.totalTradedVolume),
        peBid: num(pe.bidprice || pe.bidPrice || pe.buyPrice1),
        peAsk: num(pe.askPrice || pe.sellPrice1),
        peChg: num(pe.change)
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.strike - b.strike);

  const ceOi = rows.reduce((a, r) => a + r.ceOi, 0);
  const peOi = rows.reduce((a, r) => a + r.peOi, 0);
  const pcr = ceOi ? peOi / ceOi : 0;
  const pain = maxPain(rows, spot);
  const atm = rows.reduce((best, r) => (Math.abs(r.strike - spot) < Math.abs(best - spot) ? r.strike : best), rows[0]?.strike || spot);
  const spec = INDEX_MAP[symbol] || { lot: 1, step: 50, name: symbol };
  const days = daysTo(expiryDates[0]);
  const withGreeks = rows.map((r) => {
    const ceG = blackScholes({ spot, strike: r.strike, days, iv: (r.ceIv || 15) / 100, type: "CE" });
    const peG = blackScholes({ spot, strike: r.strike, days, iv: (r.peIv || 15) / 100, type: "PE" });
    const ceItm = spot > r.strike;
    const peItm = spot < r.strike;
    return {
      ...r,
      ceDelta: ceG.delta,
      ceTheta: ceG.theta,
      ceVega: ceG.vega,
      ceGamma: ceG.gamma,
      peDelta: peG.delta,
      peTheta: peG.theta,
      peVega: peG.vega,
      peGamma: peG.gamma,
      ceIntrinsic: round(Math.max(spot - r.strike, 0), 2),
      peIntrinsic: round(Math.max(r.strike - spot, 0), 2),
      ceTime: round(Math.max(r.ceLtp - Math.max(spot - r.strike, 0), 0), 2),
      peTime: round(Math.max(r.peLtp - Math.max(r.strike - spot, 0), 0), 2),
      ceItm,
      peItm,
      atm: r.strike === atm
    };
  });

  const support = [...withGreeks].sort((a, b) => b.peOi - a.peOi)[0];
  const resistance = [...withGreeks].sort((a, b) => b.ceOi - a.ceOi)[0];
  const atmRow = withGreeks.find((r) => r.strike === atm);

  return {
    symbol,
    name: spec.name || symbol,
    lot: spec.lot,
    step: spec.step,
    spot,
    expiries: expiryDates,
    expiry: expiryDates[0] || null,
    pcr: round(pcr, 3),
    maxPain: pain,
    atm,
    atmIv: round(((atmRow?.ceIv || 0) + (atmRow?.peIv || 0)) / 2, 2),
    ceOi,
    peOi,
    ceChgOi: withGreeks.reduce((a, r) => a + r.ceChgOi, 0),
    peChgOi: withGreeks.reduce((a, r) => a + r.peChgOi, 0),
    support: support?.strike || null,
    resistance: resistance?.strike || null,
    days: round(days, 2),
    rows: withGreeks,
    timestamp: new Date().toISOString()
  };
}

const INDEX_KEYS = new Set(["NIFTY", "BANKNIFTY", "FINNIFTY", "MIDCPNIFTY", "NIFTYNXT50"]);

function unwrapChain(raw) {
  if (raw?.records?.data) return raw;
  if (raw?.data && Array.isArray(raw.data)) {
    return {
      records: {
        data: raw.data,
        expiryDates: raw.expiryDates || raw.records?.expiryDates || [],
        underlyingValue: raw.underlyingValue || raw.records?.underlyingValue
      }
    };
  }
  return raw;
}

export async function getOptionChain(symbol = "NIFTY", expiry) {
  const key = String(symbol || "NIFTY").toUpperCase();
  const nseSym = INDEX_MAP[key]?.nse || key;
  return cached(`oc:${nseSym}:${expiry || "front"}`, 8000, async () => {
    const type = INDEX_KEYS.has(key) ? "Indices" : "Equity";
    const urls = [];
    if (expiry) {
      urls.push(`/api/option-chain-v3?type=${type}&symbol=${encodeURIComponent(nseSym)}&expiry=${encodeURIComponent(expiry)}`);
    }
    urls.push(`/api/option-chain-v3?type=${type}&symbol=${encodeURIComponent(nseSym)}`);
    let raw = null;
    let lastErr;
    for (const u of urls) {
      try {
        raw = unwrapChain(await nseGet(u));
        const rows = raw?.records?.data || raw?.data || [];
        if (rows.length) break;
        raw = null;
      } catch (err) {
        lastErr = err;
        raw = null;
      }
    }
    if (!raw) {
      try {
        const info = await nseGet(`/api/option-chain-contract-info?symbol=${encodeURIComponent(nseSym)}`);
        const expiries = info?.expiryDates || info?.records?.expiryDates || [];
        const chosen = expiry && expiries.includes(expiry) ? expiry : expiries[0];
        if (!chosen) throw lastErr || new Error(`No NSE expiries for ${nseSym}`);
        raw = unwrapChain(
          await nseGet(
            `/api/option-chain-v3?type=${type}&symbol=${encodeURIComponent(nseSym)}&expiry=${encodeURIComponent(chosen)}`
          )
        );
        raw.records = {
          ...(raw.records || {}),
          expiryDates: expiries,
          underlyingValue: raw.records?.underlyingValue || info?.underlyingValue
        };
      } catch (err) {
        throw lastErr || err;
      }
    }
    const records = raw.records || {};
    const data = records.data || [];
    const expiries =
      records.expiryDates?.length
        ? records.expiryDates
        : [...new Set(data.map((d) => d.expiryDate || d.expiryDates).filter(Boolean))];
    const chosen = expiry && expiries.includes(expiry) ? expiry : expiries[0] || expiry || null;
    const chain = normalizeChain(
      {
        records: {
          ...records,
          expiryDates: expiries,
          data: data.map((d) => ({
            ...d,
            expiryDate: d.expiryDate || d.expiryDates || chosen
          })),
          underlyingValue: records.underlyingValue
        }
      },
      key
    );
    return { ...chain, symbol: key, expiry: chosen, expiries };
  }).then((chain) => {
    const q = liveQuote(key);
    if (q?.price == null) return { ...chain, live: true };
    return { ...chain, spot: q.price, liveSpot: q.price, tickAt: q.tickAt, live: true };
  });
}

export async function getOiAnalysis(symbol = "NIFTY") {
  const chain = await getOptionChain(symbol);
  const step = chain.step || 50;
  const spot = chain.spot || chain.atm || 0;
  const band = Math.max(step * 18, spot * 0.035);
  let around = (chain.rows || []).filter((r) => Math.abs(r.strike - spot) <= band);
  if (around.length < 12 && chain.rows?.length) {
    const mid = chain.rows.findIndex((r) => r.strike >= (chain.atm || spot));
    const i = mid < 0 ? Math.floor(chain.rows.length / 2) : mid;
    around = chain.rows.slice(Math.max(0, i - 14), i + 15);
  }
  const buildup = around.map((r) => {
    const callBuild =
      r.ceChgOi > 0 && r.ceChg < 0 ? "Short buildup" : r.ceChgOi > 0 && r.ceChg > 0 ? "Long buildup" : r.ceChgOi < 0 && r.ceChg > 0 ? "Short covering" : r.ceChgOi < 0 && r.ceChg < 0 ? "Long unwinding" : "Flat";
    const putBuild =
      r.peChgOi > 0 && r.peChg < 0 ? "Short buildup" : r.peChgOi > 0 && r.peChg > 0 ? "Long buildup" : r.peChgOi < 0 && r.peChg > 0 ? "Short covering" : r.peChgOi < 0 && r.peChg < 0 ? "Long unwinding" : "Flat";
    return { strike: r.strike, ceOi: r.ceOi, peOi: r.peOi, ceChgOi: r.ceChgOi, peChgOi: r.peChgOi, callBuild, putBuild, pcr: r.ceOi ? round(r.peOi / r.ceOi, 2) : 0, atm: r.atm };
  });
  return {
    ...chain,
    rows: around,
    buildup,
    bias:
      chain.pcr > 1.1 ? "Put writers dominating · bullish lean" : chain.pcr < 0.8 ? "Call writers dominating · bearish lean" : "Balanced PCR · range possible"
  };
}

export const STRATEGY_TEMPLATES = [
  { id: "long-call", name: "Long Call", bias: "Bullish", risk: "Defined", description: "Buy ATM/OTM call. Unlimited profit if spot rallies." },
  { id: "long-put", name: "Long Put", bias: "Bearish", risk: "Defined", description: "Buy ATM/OTM put. Profits if spot falls." },
  { id: "bull-call", name: "Bull Call Spread", bias: "Bullish", risk: "Defined", description: "Buy lower strike call, sell higher strike call." },
  { id: "bear-put", name: "Bear Put Spread", bias: "Bearish", risk: "Defined", description: "Buy higher strike put, sell lower strike put." },
  { id: "bull-put", name: "Bull Put Spread", bias: "Bullish", risk: "Defined", description: "Sell higher strike put, buy lower strike put. Credit strategy." },
  { id: "bear-call", name: "Bear Call Spread", bias: "Bearish", risk: "Defined", description: "Sell lower strike call, buy higher strike call. Credit strategy." },
  { id: "long-straddle", name: "Long Straddle", bias: "Neutral", risk: "Defined", description: "Buy ATM call and ATM put. Needs a big move." },
  { id: "short-straddle", name: "Short Straddle", bias: "Neutral", risk: "Undefined", description: "Sell ATM call and put. Profits in a tight range." },
  { id: "long-strangle", name: "Long Strangle", bias: "Neutral", risk: "Defined", description: "Buy OTM call and OTM put." },
  { id: "short-strangle", name: "Short Strangle", bias: "Neutral", risk: "Undefined", description: "Sell OTM call and OTM put." },
  { id: "iron-condor", name: "Iron Condor", bias: "Neutral", risk: "Defined", description: "Short OTM strangle, hedge with farther wings." },
  { id: "iron-fly", name: "Iron Butterfly", bias: "Neutral", risk: "Defined", description: "Short ATM straddle, buy OTM wings." },
  { id: "butterfly-call", name: "Call Butterfly", bias: "Neutral", risk: "Defined", description: "Buy 1 ITM call, sell 2 ATM, buy 1 OTM." },
  { id: "jade-lizard", name: "Jade Lizard", bias: "Bullish", risk: "Undefined", description: "Short put + short call spread. No upside risk if sized well." },
  { id: "ratio-call", name: "Call Ratio Backspread", bias: "Bullish", risk: "Undefined", description: "Sell 1 ITM/ATM call, buy 2 OTM calls." },
  { id: "covered-call", name: "Covered Call", bias: "Bullish", risk: "Undefined", description: "Long futures/stock + short OTM call." },
  { id: "protective-put", name: "Protective Put", bias: "Bullish", risk: "Defined", description: "Long futures/stock + long put hedge." },
  { id: "calendar", name: "Calendar Spread", bias: "Neutral", risk: "Defined", description: "Sell near expiry ATM, buy far expiry ATM (approx via 2 lots)." }
];

function nearest(rows, target) {
  return rows.reduce((b, r) => (Math.abs(r.strike - target) < Math.abs(b.strike - target) ? r : b), rows[0]);
}

export function buildTemplateLegs(id, chain) {
  const rows = chain.rows;
  const atm = nearest(rows, chain.atm || chain.spot);
  const step = chain.step || 50;
  const up1 = nearest(rows, atm.strike + step * 2);
  const up2 = nearest(rows, atm.strike + step * 4);
  const dn1 = nearest(rows, atm.strike - step * 2);
  const dn2 = nearest(rows, atm.strike - step * 4);
  const lot = 1;
  const L = (row, type, side, qty = 1) => ({
    type,
    side,
    strike: row.strike,
    premium: type === "CE" ? row.ceLtp : row.peLtp,
    qty,
    lot,
    iv: type === "CE" ? row.ceIv : row.peIv,
    expiry: chain.expiry
  });
  switch (id) {
    case "long-call":
      return [L(atm, "CE", "buy")];
    case "long-put":
      return [L(atm, "PE", "buy")];
    case "bull-call":
      return [L(atm, "CE", "buy"), L(up1, "CE", "sell")];
    case "bear-put":
      return [L(atm, "PE", "buy"), L(dn1, "PE", "sell")];
    case "bull-put":
      return [L(atm, "PE", "sell"), L(dn1, "PE", "buy")];
    case "bear-call":
      return [L(atm, "CE", "sell"), L(up1, "CE", "buy")];
    case "long-straddle":
      return [L(atm, "CE", "buy"), L(atm, "PE", "buy")];
    case "short-straddle":
      return [L(atm, "CE", "sell"), L(atm, "PE", "sell")];
    case "long-strangle":
      return [L(up1, "CE", "buy"), L(dn1, "PE", "buy")];
    case "short-strangle":
      return [L(up1, "CE", "sell"), L(dn1, "PE", "sell")];
    case "iron-condor":
      return [L(dn2, "PE", "buy"), L(dn1, "PE", "sell"), L(up1, "CE", "sell"), L(up2, "CE", "buy")];
    case "iron-fly":
      return [L(dn1, "PE", "buy"), L(atm, "PE", "sell"), L(atm, "CE", "sell"), L(up1, "CE", "buy")];
    case "butterfly-call":
      return [L(dn1, "CE", "buy"), L(atm, "CE", "sell", 2), L(up1, "CE", "buy")];
    case "jade-lizard":
      return [L(dn1, "PE", "sell"), L(up1, "CE", "sell"), L(up2, "CE", "buy")];
    case "ratio-call":
      return [L(atm, "CE", "sell"), L(up1, "CE", "buy", 2)];
    case "covered-call":
      return [L(up1, "CE", "sell")];
    case "protective-put":
      return [L(dn1, "PE", "buy")];
    case "calendar":
      return [L(atm, "CE", "sell"), L(atm, "CE", "buy")];
    default:
      return [L(atm, "CE", "buy")];
  }
}

export function analyzeStrategy({ legs, spot, lotSize = 75, days = 7 }) {
  const clean = (legs || []).map((l) => ({
    type: l.type === "PE" ? "PE" : "CE",
    side: l.side === "sell" ? "sell" : "buy",
    strike: num(l.strike),
    premium: num(l.premium),
    qty: Math.max(num(l.qty, 1), 1),
    iv: num(l.iv, 16)
  }));
  const sign = (s) => (s === "sell" ? -1 : 1);
  const payoffAt = (s) =>
    clean.reduce((sum, l) => {
      const intrinsic = l.type === "CE" ? Math.max(s - l.strike, 0) : Math.max(l.strike - s, 0);
      return sum + sign(l.side) * l.qty * lotSize * (intrinsic - l.premium);
    }, 0);

  const lo = spot * 0.88;
  const hi = spot * 1.12;
  const points = [];
  const n = 80;
  for (let i = 0; i <= n; i++) {
    const s = lo + ((hi - lo) * i) / n;
    points.push({ spot: round(s, 2), pnl: round(payoffAt(s), 2) });
  }
  const pnls = points.map((p) => p.pnl);
  const maxProfit = Math.max(...pnls);
  const maxLoss = Math.min(...pnls);
  const be = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if ((a.pnl <= 0 && b.pnl >= 0) || (a.pnl >= 0 && b.pnl <= 0)) {
      const t = a.pnl / (a.pnl - b.pnl || 1);
      be.push(round(a.spot + (b.spot - a.spot) * t, 2));
    }
  }
  const netCredit = clean.reduce((s, l) => s + -sign(l.side) * l.qty * lotSize * l.premium, 0);
  const greeks = clean.reduce(
    (acc, l) => {
      const g = blackScholes({ spot, strike: l.strike, days, iv: (l.iv || 16) / 100, type: l.type });
      const q = sign(l.side) * l.qty * lotSize;
      acc.delta += g.delta * q;
      acc.gamma += g.gamma * q;
      acc.theta += g.theta * q;
      acc.vega += g.vega * q;
      return acc;
    },
    { delta: 0, gamma: 0, theta: 0, vega: 0 }
  );
  const pop = Math.max(5, Math.min(92, 50 + (maxProfit > Math.abs(maxLoss) ? 8 : -8) + (netCredit > 0 ? 10 : -6)));
  return {
    points,
    maxProfit: round(maxProfit, 2),
    maxLoss: round(maxLoss, 2),
    breakevens: be,
    netCredit: round(netCredit, 2),
    premiumOutlay: round(-Math.min(netCredit, 0), 2),
    greeks: {
      delta: round(greeks.delta, 2),
      gamma: round(greeks.gamma, 4),
      theta: round(greeks.theta, 2),
      vega: round(greeks.vega, 2)
    },
    pop: round(pop, 0),
    spotPnl: round(payoffAt(spot), 2),
    lotSize,
    legs: clean
  };
}

export async function wizard({ symbol = "NIFTY", view = "bullish", targetPct = 1.2 }) {
  const chain = await getOptionChain(symbol);
  const viewKey = String(view).toLowerCase();
  const pick =
    viewKey.includes("bear")
      ? ["bear-put", "long-put", "bear-call"]
      : viewKey.includes("neutral") || viewKey.includes("range")
        ? ["iron-condor", "short-strangle", "iron-fly"]
        : Math.abs(targetPct) > 2
          ? ["long-call", "ratio-call", "bull-call"]
          : ["bull-call", "bull-put", "long-call"];
  const ideas = pick.map((id) => {
    const meta = STRATEGY_TEMPLATES.find((t) => t.id === id);
    const legs = buildTemplateLegs(id, chain);
    const analysis = analyzeStrategy({ legs, spot: chain.spot, lotSize: chain.lot, days: chain.days });
    return { ...meta, legs, analysis };
  });
  return { symbol, spot: chain.spot, expiry: chain.expiry, pcr: chain.pcr, maxPain: chain.maxPain, ideas };
}

export async function easyOptions({ symbol = "NIFTY", direction = "up" }) {
  const chain = await getOptionChain(symbol);
  const id = direction === "down" ? "bear-put" : "bull-call";
  const meta = STRATEGY_TEMPLATES.find((t) => t.id === id);
  const legs = buildTemplateLegs(id, chain);
  const analysis = analyzeStrategy({ legs, spot: chain.spot, lotSize: chain.lot, days: chain.days });
  return {
    headline: direction === "down" ? `${chain.name} looks weak — defined-risk put spread` : `${chain.name} looks strong — defined-risk call spread`,
    note: "Easy Options picks a hedged spread so max loss is known before you trade.",
    chain: { spot: chain.spot, pcr: chain.pcr, maxPain: chain.maxPain, expiry: chain.expiry, lot: chain.lot },
    strategy: { ...meta, legs, analysis }
  };
}
