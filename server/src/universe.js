export const NIFTY50 = [
  { symbol: "RELIANCE", name: "Reliance Industries", sector: "Energy" },
  { symbol: "TCS", name: "Tata Consultancy", sector: "IT" },
  { symbol: "HDFCBANK", name: "HDFC Bank", sector: "Banking" },
  { symbol: "INFY", name: "Infosys", sector: "IT" },
  { symbol: "ICICIBANK", name: "ICICI Bank", sector: "Banking" },
  { symbol: "HINDUNILVR", name: "Hindustan Unilever", sector: "FMCG" },
  { symbol: "ITC", name: "ITC", sector: "FMCG" },
  { symbol: "SBIN", name: "State Bank of India", sector: "Banking" },
  { symbol: "BHARTIARTL", name: "Bharti Airtel", sector: "Telecom" },
  { symbol: "BAJFINANCE", name: "Bajaj Finance", sector: "Finance" },
  { symbol: "KOTAKBANK", name: "Kotak Mahindra Bank", sector: "Banking" },
  { symbol: "LT", name: "Larsen & Toubro", sector: "Infra" },
  { symbol: "HCLTECH", name: "HCL Technologies", sector: "IT" },
  { symbol: "AXISBANK", name: "Axis Bank", sector: "Banking" },
  { symbol: "ASIANPAINT", name: "Asian Paints", sector: "Paint" },
  { symbol: "MARUTI", name: "Maruti Suzuki", sector: "Auto" },
  { symbol: "SUNPHARMA", name: "Sun Pharma", sector: "Pharma" },
  { symbol: "TITAN", name: "Titan Company", sector: "Consumer" },
  { symbol: "ULTRACEMCO", name: "UltraTech Cement", sector: "Cement" },
  { symbol: "NTPC", name: "NTPC", sector: "Power" },
  { symbol: "POWERGRID", name: "Power Grid", sector: "Power" },
  { symbol: "TATAMOTORS", name: "Tata Motors", sector: "Auto" },
  { symbol: "M&M", name: "Mahindra & Mahindra", sector: "Auto" },
  { symbol: "WIPRO", name: "Wipro", sector: "IT" },
  { symbol: "ADANIENT", name: "Adani Enterprises", sector: "Conglomerate" },
  { symbol: "ADANIPORTS", name: "Adani Ports", sector: "Infra" },
  { symbol: "JSWSTEEL", name: "JSW Steel", sector: "Metal" },
  { symbol: "TATASTEEL", name: "Tata Steel", sector: "Metal" },
  { symbol: "COALINDIA", name: "Coal India", sector: "Mining" },
  { symbol: "ONGC", name: "ONGC", sector: "Energy" },
  { symbol: "BAJAJFINSV", name: "Bajaj Finserv", sector: "Finance" },
  { symbol: "TECHM", name: "Tech Mahindra", sector: "IT" },
  { symbol: "HINDALCO", name: "Hindalco", sector: "Metal" },
  { symbol: "CIPLA", name: "Cipla", sector: "Pharma" },
  { symbol: "DRREDDY", name: "Dr Reddy's", sector: "Pharma" },
  { symbol: "EICHERMOT", name: "Eicher Motors", sector: "Auto" },
  { symbol: "APOLLOHOSP", name: "Apollo Hospitals", sector: "Healthcare" },
  { symbol: "NESTLEIND", name: "Nestle India", sector: "FMCG" },
  { symbol: "GRASIM", name: "Grasim", sector: "Cement" },
  { symbol: "BPCL", name: "BPCL", sector: "Energy" },
  { symbol: "HEROMOTOCO", name: "Hero MotoCorp", sector: "Auto" },
  { symbol: "INDUSINDBK", name: "IndusInd Bank", sector: "Banking" },
  { symbol: "TRENT", name: "Trent", sector: "Retail" },
  { symbol: "BEL", name: "Bharat Electronics", sector: "Defence" },
  { symbol: "HDFCLIFE", name: "HDFC Life", sector: "Insurance" },
  { symbol: "SBILIFE", name: "SBI Life", sector: "Insurance" },
  { symbol: "TATACONSUM", name: "Tata Consumer", sector: "FMCG" },
  { symbol: "DIVISLAB", name: "Divi's Labs", sector: "Pharma" },
  { symbol: "BRITANNIA", name: "Britannia", sector: "FMCG" },
  { symbol: "SHRIRAMFIN", name: "Shriram Finance", sector: "Finance" }
];

export const FOREX_PAIRS = [
  { id: "USDINR", yahoo: "USDINR=X", pair: "USD/INR", name: "Dollar / Rupee", digits: 4, group: "INR" },
  { id: "EURINR", yahoo: "EURINR=X", pair: "EUR/INR", name: "Euro / Rupee", digits: 4, group: "INR" },
  { id: "GBPINR", yahoo: "GBPINR=X", pair: "GBP/INR", name: "Pound / Rupee", digits: 4, group: "INR" },
  { id: "JPYINR", yahoo: "JPYINR=X", pair: "JPY/INR", name: "Yen / Rupee", digits: 4, group: "INR" },
  { id: "EURUSD", yahoo: "EURUSD=X", pair: "EUR/USD", name: "Euro / Dollar", digits: 5, group: "Major" },
  { id: "GBPUSD", yahoo: "GBPUSD=X", pair: "GBP/USD", name: "Pound / Dollar", digits: 5, group: "Major" },
  { id: "USDJPY", yahoo: "USDJPY=X", pair: "USD/JPY", name: "Dollar / Yen", digits: 3, group: "Major" },
  { id: "AUDUSD", yahoo: "AUDUSD=X", pair: "AUD/USD", name: "Aussie / Dollar", digits: 5, group: "Major" },
  { id: "USDCAD", yahoo: "USDCAD=X", pair: "USD/CAD", name: "Dollar / Canada", digits: 5, group: "Major" },
  { id: "USDCHF", yahoo: "USDCHF=X", pair: "USD/CHF", name: "Dollar / Swiss", digits: 5, group: "Major" },
  { id: "NZDUSD", yahoo: "NZDUSD=X", pair: "NZD/USD", name: "Kiwi / Dollar", digits: 5, group: "Major" },
  { id: "DXY", yahoo: "DX-Y.NYB", pair: "DXY", name: "US Dollar Index", digits: 3, group: "Index" }
];

export const INDEX_MAP = {
  NIFTY: { yahoo: "^NSEI", nse: "NIFTY", lot: 75, step: 50, name: "Nifty 50" },
  BANKNIFTY: { yahoo: "^NSEBANK", nse: "BANKNIFTY", lot: 30, step: 100, name: "Bank Nifty" },
  SENSEX: { yahoo: "^BSESN", nse: "SENSEX", lot: 20, step: 100, name: "Sensex" },
  FINNIFTY: { yahoo: "^CNXFIN", nse: "FINNIFTY", lot: 40, step: 50, name: "Fin Nifty" },
  MIDCPNIFTY: { yahoo: "^NSEMDCP50", nse: "MIDCPNIFTY", lot: 75, step: 25, name: "Midcap Nifty" },
  INDIAVIX: { yahoo: "^INDIAVIX", nse: "INDIA VIX", lot: 1, step: 0.05, name: "India VIX" },
  BTCUSD: { yahoo: "BTC-USD", nse: null, lot: 1, step: 1, name: "Bitcoin USD" },
  BTCINR: { yahoo: "BTC-INR", nse: null, lot: 1, step: 1, name: "Bitcoin INR" },
  ...Object.fromEntries(FOREX_PAIRS.map((p) => [p.id, { yahoo: p.yahoo, nse: null, lot: 1, step: 0, name: p.pair }]))
};

export const FNO_STOCKS = [
  "RELIANCE", "HDFCBANK", "ICICIBANK", "INFY", "TCS", "SBIN", "BHARTIARTL",
  "BAJFINANCE", "AXISBANK", "KOTAKBANK", "LT", "ITC", "MARUTI", "TATAMOTORS",
  "SUNPHARMA", "HCLTECH", "ADANIENT", "TATASTEEL", "HINDALCO", "WIPRO"
];

export const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

const FIRST_SKIP = new Set(["tech", "tata", "bajaj", "adani", "hdfc", "sbi", "dr", "sun", "the", "bank", "it"]);

const EXTRA_ALIASES = [
  ["hcl technologies", "HCLTECH"],
  ["hcl tech", "HCLTECH"],
  ["hcltech", "HCLTECH"],
  ["tech mahindra", "TECHM"],
  ["bank nifty", "BANKNIFTY"],
  ["banknifty", "BANKNIFTY"],
  ["nifty 50", "NIFTY"],
  ["nifty50", "NIFTY"],
  ["india vix", "INDIAVIX"],
  ["bitcoin", "BTCUSD"],
  ["usd inr", "USDINR"],
  ["infosys", "INFY"],
  ["reliance industries", "RELIANCE"],
  ["hdfc bank", "HDFCBANK"],
  ["icici bank", "ICICIBANK"],
  ["axis bank", "AXISBANK"],
  ["state bank", "SBIN"],
  ["tata motors", "TATAMOTORS"],
  ["tata steel", "TATASTEEL"],
  ["tata consumer", "TATACONSUM"],
  ["hindustan unilever", "HINDUNILVR"],
  ["hul", "HINDUNILVR"],
  ["ril", "RELIANCE"]
];

function aliasList() {
  const pairs = [...EXTRA_ALIASES];
  const firstCount = {};
  for (const row of NIFTY50) {
    const first = row.name.split(/[\s'/]+/)[0].toLowerCase();
    firstCount[first] = (firstCount[first] || 0) + 1;
  }
  for (const row of NIFTY50) {
    pairs.push([row.symbol.toLowerCase(), row.symbol]);
    pairs.push([row.name.toLowerCase(), row.symbol]);
    const first = row.name.split(/[\s'/]+/)[0].toLowerCase();
    if (first.length >= 3 && firstCount[first] === 1 && !FIRST_SKIP.has(first)) {
      pairs.push([first, row.symbol]);
    }
  }
  for (const [id, spec] of Object.entries(INDEX_MAP)) {
    pairs.push([id.toLowerCase(), id]);
    if (spec.name) pairs.push([String(spec.name).toLowerCase(), id]);
  }
  pairs.sort((a, b) => b[0].length - a[0].length);
  return pairs;
}

const ALIASES = aliasList();

export function detectSymbol(text, fallback = "NIFTY") {
  const q = String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9&\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!q) return fallback;
  for (const [alias, symbol] of ALIASES) {
    if (!alias) continue;
    if (alias.length <= 3) {
      if (new RegExp(`(?:^|\\s)${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\s|$)`).test(q)) return symbol;
    } else if (q.includes(alias)) {
      return symbol;
    }
  }
  return fallback;
}
