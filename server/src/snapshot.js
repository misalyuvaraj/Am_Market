const KEYS = {
  NIFTY: "nifty",
  SENSEX: "sensex",
  BANKNIFTY: "banknifty",
  FINNIFTY: "banknifty",
  INDIAVIX: "vix",
  VIX: "vix",
  GIFTNIFTY: "giftnifty",
  GIFT: "giftnifty",
  BTCUSD: "btc",
  BTCUSDT: "btc",
  BTC: "btc",
  BTCINR: "btc",
  USDINR: "usdInr",
  EURUSD: "eurusd",
  GBPUSD: "gbpusd",
  USDJPY: "usdjpy",
  DXY: "dxy"
};

let snap = null;
let at = 0;

export function setLiveSnapshot(data) {
  if (!data) return;
  const now = Date.now();
  data.tapeAt = now;
  data.live = true;
  snap = data;
  at = now;
}

export function getLiveSnapshot() {
  return snap;
}

export function liveAgeMs() {
  return at ? Date.now() - at : null;
}

export function freshTickers(maxAge = 4000) {
  if (snap && at && Date.now() - at < maxAge) return snap;
  return null;
}

export function liveQuote(symbol) {
  if (!snap) return null;
  const key = String(symbol || "").toUpperCase();
  const field = KEYS[key];
  if (field && snap[field]?.price != null) return snap[field];
  const fx = (snap.forex || []).find((p) => String(p.symbol).toUpperCase() === key);
  return fx || null;
}

export function applyLiveLast(pack, symbol, livePack = null) {
  const q = liveQuote(symbol);
  const price = Number(q?.price ?? livePack?.price ?? pack?.price);
  if (!pack || !Number.isFinite(price)) return pack;
  const change = q?.change ?? livePack?.change ?? pack.change;
  const changePct = q?.changePct ?? livePack?.changePct ?? pack.changePct ?? pack.priceChangePercent;
  const candles = (pack.candles || []).map((c) => ({ ...c }));
  if (candles.length) {
    const last = candles[candles.length - 1];
    last.c = price;
    last.h = Math.max(Number(last.h) || price, price);
    last.l = Math.min(Number(last.l) || price, price);
    if (q?.volume) last.v = Number(q.volume);
  }
  const spark = [...(pack.spark || q?.spark || livePack?.spark || [])];
  if (!spark.length || spark.at(-1) !== price) spark.push(price);
  return {
    ...pack,
    price,
    change,
    changePct,
    priceChangePercent: changePct,
    volume: q?.volume ?? pack.volume,
    high: q?.high ?? pack.high,
    low: q?.low ?? pack.low,
    live: true,
    tickAt: q?.tickAt || Date.now(),
    candles,
    spark: spark.slice(-120),
    source: q?.source || livePack?.source || pack.source || "live"
  };
}

export function stampPack(pack, symbol) {
  return applyLiveLast(pack, symbol);
}
