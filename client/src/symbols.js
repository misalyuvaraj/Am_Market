export const CHART_SYMBOLS = [
  { id: "NIFTY", label: "NIFTY", group: "NSE", digits: 2 },
  { id: "BANKNIFTY", label: "BANKNIFTY", group: "NSE", digits: 2 },
  { id: "INDIAVIX", label: "INDIA VIX", group: "NSE", digits: 2 },
  { id: "SENSEX", label: "SENSEX", group: "BSE", digits: 2 },
  { id: "USDINR", label: "USD/INR", group: "FX", digits: 4 },
  { id: "EURUSD", label: "EUR/USD", group: "FX", digits: 5 },
  { id: "GBPUSD", label: "GBP/USD", group: "FX", digits: 5 },
  { id: "USDJPY", label: "USD/JPY", group: "FX", digits: 3 },
  { id: "EURINR", label: "EUR/INR", group: "FX", digits: 4 },
  { id: "BTCUSD", label: "BTCUSDT", group: "CRYPTO", digits: 2 }
];

export const CHIP_SYMBOL = {
  NIFTY: "NIFTY",
  SENSEX: "SENSEX",
  BANKNIFTY: "BANKNIFTY",
  VIX: "INDIAVIX",
  USDINR: "USDINR",
  EURUSD: "EURUSD",
  BTC: "BTCUSD"
};

export const TFS = [
  { id: "1m", range: "1d", label: "1m" },
  { id: "5m", range: "5d", label: "5m" },
  { id: "15m", range: "5d", label: "15m" },
  { id: "60m", range: "1mo", label: "1H" },
  { id: "4h", range: "6mo", label: "4H" },
  { id: "1d", range: "6mo", label: "1D" }
];

export function symbolSpec(id) {
  const key = String(id || "NIFTY").toUpperCase();
  return CHART_SYMBOLS.find((s) => s.id === key) || { id: key, label: key, group: "NSE", digits: 2 };
}

export function tickerFor(id, tickers) {
  const key = String(id || "").toUpperCase();
  if (key === "USDINR") return tickers?.usdInr;
  if (key === "EURUSD") return tickers?.eurusd;
  if (key === "GBPUSD") return tickers?.gbpusd;
  if (key === "USDJPY") return tickers?.usdjpy;
  if (key === "NIFTY") return tickers?.nifty;
  if (key === "BANKNIFTY") return tickers?.banknifty;
  if (key === "SENSEX") return tickers?.sensex;
  if (key === "BTCUSD" || key === "BTC") return tickers?.btc;
  if (key === "INDIAVIX" || key === "VIX") return tickers?.vix;
  return (tickers?.forex || []).find((p) => p.symbol === key);
}

export function livePath(id) {
  return `/live/${encodeURIComponent(String(id || "NIFTY").toUpperCase())}`;
}
