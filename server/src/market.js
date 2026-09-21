import { cached, getJson, getText, parseRss, num, pct, round, mapLimit, marketSession } from "./lib.js";
import { NIFTY50, INDEX_MAP, FOREX_PAIRS, UA } from "./universe.js";
import { applyLiveLast, liveQuote, freshTickers } from "./snapshot.js";

const YAHOO = "https://query1.finance.yahoo.com/v8/finance/chart";
const DOWNSTOX = "https://downstox.com/api";
const BINANCE = "https://api.binance.com/api/v3";
const COINGECKO = "https://api.coingecko.com/api/v3";

let nseCookies = "";
let nseReadyAt = 0;

const NSE_HEADERS = {
  "User-Agent": UA,
  Accept: "*/*",
  "Accept-Language": "en-GB,en-US;q=0.9,en;q=0.8",
  "Accept-Encoding": "gzip, deflate",
  Referer: "https://www.nseindia.com/option-chain",
  "X-Requested-With": "XMLHttpRequest",
  "Cache-Control": "no-cache",
  Pragma: "no-cache"
};

function collectCookies(res) {
  const raw = res.headers.getSetCookie?.() || [];
  const parts = raw.length
    ? raw.map((c) => c.split(";")[0])
    : (res.headers.get("set-cookie") || "")
        .split(/,(?=[^ ;]+=)/)
        .map((c) => c.split(";")[0])
        .filter(Boolean);
  if (!parts.length) return;
  const jar = new Map(
    nseCookies
      .split(";")
      .map((x) => x.trim())
      .filter(Boolean)
      .map((x) => x.split("="))
      .filter((x) => x[0])
  );
  for (const p of parts) {
    const [k, ...rest] = p.split("=");
    if (k) jar.set(k.trim(), rest.join("="));
  }
  nseCookies = [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function nseWarm() {
  if (nseCookies && Date.now() - nseReadyAt < 8 * 60 * 1000) return;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10000);
  try {
    const res = await fetch("https://www.nseindia.com/option-chain", {
      signal: ctrl.signal,
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-IN,en;q=0.9",
        "Accept-Encoding": "gzip, deflate"
      }
    });
    collectCookies(res);
    await res.arrayBuffer().catch(() => {});
    nseReadyAt = Date.now();
  } finally {
    clearTimeout(t);
  }
}

export async function nseGet(path, timeoutMs = 9000) {
  await nseWarm();
  const url = path.startsWith("http") ? path : `https://www.nseindia.com${path}`;
  const once = async () => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        headers: { ...NSE_HEADERS, Cookie: nseCookies },
        redirect: "follow",
        signal: ctrl.signal
      });
      collectCookies(res);
      if (!res.ok) {
        const err = new Error(`HTTP ${res.status} ${url}`);
        err.status = res.status;
        throw err;
      }
      return res.json();
    } finally {
      clearTimeout(t);
    }
  };
  try {
    return await once();
  } catch (err) {
    nseCookies = "";
    nseReadyAt = 0;
    await nseWarm();
    return once();
  }
}

export async function yahooChart(symbol, range = "1d", interval = "1m") {
  const encoded = encodeURIComponent(symbol);
  const data = await getJson(
    `${YAHOO}/${encoded}?range=${range}&interval=${interval}&includePrePost=false`
  );
  const result = data?.chart?.result?.[0];
  if (!result) throw new Error(`No yahoo data for ${symbol}`);
  const meta = result.meta || {};
  const ts = result.timestamp || [];
  const q = result.indicators?.quote?.[0] || {};
  const closes = (q.close || []).map((v, i) => ({
    t: (ts[i] || 0) * 1000,
    o: num(q.open?.[i], 0),
    h: num(q.high?.[i], 0),
    l: num(q.low?.[i], 0),
    c: num(v, 0),
    v: num(q.volume?.[i], 0)
  })).filter((x) => x.c);
  const price = num(meta.regularMarketPrice, closes.at(-1)?.c);
  const prev = num(meta.chartPreviousClose || meta.previousClose, closes[0]?.c);
  return {
    symbol,
    name: meta.shortName || meta.symbol || symbol,
    exchange: meta.exchangeName || meta.fullExchangeName || "",
    currency: meta.currency || "INR",
    price,
    prev,
    change: round(price - prev, 2),
    changePct: round(pct(price, prev), 2),
    priceChangePercent: round(pct(price, prev), 2),
    tickAt: Date.now(),
    open: num(meta.regularMarketOpen, closes[0]?.o),
    high: num(meta.regularMarketDayHigh, Math.max(...closes.map((x) => x.h || x.c))),
    low: num(meta.regularMarketDayLow, Math.min(...closes.map((x) => x.l || x.c))),
    volume: num(meta.regularMarketVolume),
    marketState: meta.marketState || "",
    fiftyTwoWeekHigh: num(meta.fiftyTwoWeekHigh, Math.max(...closes.map((x) => x.h || x.c))),
    fiftyTwoWeekLow: num(meta.fiftyTwoWeekLow, Math.min(...closes.map((x) => x.l || x.c))),
    spark: closes.slice(-80).map((x) => x.c),
    candles: closes
  };
}

function withTickVolume(candles = []) {
  if (!candles.length) return candles;
  if (candles.some((c) => Number(c.v) > 0)) return candles;
  return candles.map((c) => {
    const range = Math.abs(Number(c.h) - Number(c.l));
    const body = Math.abs(Number(c.c) - Number(c.o));
    const v = Math.max(1, Math.round((range * 12 + body * 6) * 1e5 + Math.abs(Number(c.c)) * 0.04));
    return { ...c, v };
  });
}

function intervalMs(interval) {
  const map = { "1m": 60e3, "2m": 120e3, "5m": 300e3, "15m": 900e3, "30m": 1800e3, "60m": 3600e3, "1h": 3600e3, "1d": 86400e3 };
  return map[interval] || 300e3;
}

function mergeFormingBar(candles, interval) {
  if (!candles.length) return candles;
  const step = intervalMs(interval);
  const out = candles.map((c) => ({ ...c }));
  const last = out[out.length - 1];
  if (last.t % step !== 0 && out.length > 1) {
    const prev = out[out.length - 2];
    prev.h = Math.max(Number(prev.h) || prev.c, last.h, last.c);
    prev.l = Math.min(Number(prev.l) || prev.c, last.l, last.c);
    prev.c = last.c;
    prev.v = Number(prev.v || 0) + Number(last.v || 0);
    out.pop();
  } else {
    last.t = last.t - (last.t % step);
  }
  return out;
}

function stampLiveBar(chart, interval = "5m") {
  let candles = withTickVolume(chart.candles || []);
  candles = mergeFormingBar(candles, interval);
  if (candles.length && Number.isFinite(Number(chart.price))) {
    const last = candles[candles.length - 1];
    last.c = Number(chart.price);
    last.h = Math.max(Number(last.h) || last.c, last.c);
    last.l = Math.min(Number(last.l) || last.c, last.c);
    if (!Number(last.o)) last.o = last.c;
  }
  return { ...chart, candles };
}

export async function getLiveCandles(key, range = "5d", interval = "5m") {
  const k = String(key || "USDINR").toUpperCase();
  const ttl = interval === "1m" || interval === "2m" || interval === "5m" ? 2500 : 6000;
  if (k === "BTC" || k === "BTCUSD" || k === "BTCUSDT") {
    const pack = await cached(`bn:kl:${interval}`, 2000, async () => {
      const map = { "1m": "1m", "2m": "1m", "5m": "5m", "15m": "15m", "30m": "30m", "60m": "1h", "1h": "1h", "1d": "1d" };
      const kl = await getJson(`${BINANCE}/klines?symbol=BTCUSDT&interval=${map[interval] || "5m"}&limit=300`);
      const candles = kl.map((row) => ({
        t: num(row[0]),
        o: num(row[1]),
        h: num(row[2]),
        l: num(row[3]),
        c: num(row[4]),
        v: num(row[5])
      }));
      const last = candles.at(-1) || {};
      const first = candles[0] || {};
      const price = last.c;
      const dayOpen = candles.find((c) => {
        const d = new Date(c.t);
        return d.getUTCHours() === 0 && d.getUTCMinutes() === 0;
      }) || first;
      const prev = dayOpen.o || first.o;
      return stampLiveBar({
        symbol: "BTCUSDT",
        name: "Bitcoin",
        exchange: "Binance",
        price,
        prev,
        change: round(price - prev, 2),
        changePct: round(pct(price, prev), 2),
        priceChangePercent: round(pct(price, prev), 2),
        high: Math.max(...candles.map((x) => x.h)),
        low: Math.min(...candles.map((x) => x.l)),
        spark: candles.slice(-80).map((x) => x.c),
        candles,
        source: "binance",
        interval,
        range
      }, interval);
    });
    return applyLiveLast(pack, k);
  }
  const spec = INDEX_MAP[k] || { yahoo: k.includes("=") || k.includes("-") ? k : `${k}.NS` };
  const pack = await cached(`livebar:${spec.yahoo}:${range}:${interval}`, ttl, async () => {
    const chart = await yahooChart(spec.yahoo, range, interval);
    return stampLiveBar({ ...chart, interval, range, source: "yahoo" }, interval);
  });
  return applyLiveLast(pack, k);
}

export async function yahooQuote(symbol, range = "1d", interval = "2m") {
  const ttl = interval === "1m" || interval === "2m" || interval === "5m" ? 2500 : 6000;
  return cached(`y:${symbol}:${range}:${interval}`, ttl, () => yahooChart(symbol, range, interval));
}

export async function yahooQuoteLive(symbol) {
  return cached(`ylive:${symbol}`, 1500, () => yahooChart(symbol, "1d", "1m"));
}

export async function downstoxOverview() {
  return cached("dx:overview", 2000, () => getJson(`${DOWNSTOX}/india-markets/overview`));
}

export async function downstox(path, ttl = 30000) {
  return cached(`dx:${path}`, ttl, () => getJson(`${DOWNSTOX}${path}`));
}

export function packBtcTicker(ticker, spark = []) {
  const price = num(ticker.lastPrice ?? ticker.c);
  const change = num(ticker.priceChange ?? ticker.p);
  const changePct = num(ticker.priceChangePercent ?? ticker.P);
  return {
    symbol: "BTCUSDT",
    name: "Bitcoin",
    exchange: "Binance",
    currency: "USD",
    price,
    prev: price - change,
    change: round(change, 2),
    changePct: round(changePct, 2),
    priceChangePercent: round(changePct, 2),
    high: num(ticker.highPrice ?? ticker.h),
    low: num(ticker.lowPrice ?? ticker.l),
    volume: num(ticker.volume ?? ticker.v),
    quoteVolume: num(ticker.quoteVolume ?? ticker.q),
    trades: num(ticker.count ?? ticker.n),
    spark,
    source: "binance",
    tickAt: Date.now()
  };
}

export async function binanceTicker() {
  return cached("bn:tick", 700, async () => {
    const ticker = await getJson(`${BINANCE}/ticker/24hr?symbol=BTCUSDT`);
    return packBtcTicker(ticker);
  });
}

export async function binanceBtc() {
  return cached("bn:btc", 8000, async () => {
    const [ticker, klines] = await Promise.all([
      getJson(`${BINANCE}/ticker/24hr?symbol=BTCUSDT`),
      getJson(`${BINANCE}/klines?symbol=BTCUSDT&interval=1m&limit=120`)
    ]);
    return packBtcTicker(ticker, klines.map((k) => num(k[4])));
  });
}

export async function coinGeckoBtc() {
  return cached("cg:btc", 12000, async () => {
    const data = await getJson(
      `${COINGECKO}/simple/price?ids=bitcoin&vs_currencies=usd,inr&include_24hr_change=true&include_24hr_vol=true`
    );
    const b = data.bitcoin || {};
    return {
      usd: num(b.usd),
      inr: num(b.inr),
      usdChange: round(num(b.usd_24h_change), 2),
      inrChange: round(num(b.inr_24h_change), 2),
      vol: num(b.usd_24h_vol)
    };
  });
}

const GOOGLE_RSS = (q) =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-IN&gl=IN&ceid=IN:en`;

const NEWS_FEEDS = {
  nse: [
    "https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms",
    "https://www.livemint.com/rss/markets",
    "https://www.moneycontrol.com/rss/latestnews.xml",
    "https://feeds.finance.yahoo.com/rss/2.0/headline?s=%5ENSEI,%5EBSESN&region=IN&lang=en-IN",
    GOOGLE_RSS("NIFTY OR SENSEX OR NSE OR BSE when:1d")
  ],
  bse: [
    "https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms",
    "https://www.livemint.com/rss/markets",
    GOOGLE_RSS("SENSEX OR BSE when:1d")
  ],
  btc: [
    "https://www.coindesk.com/arc/outboundfeeds/rss/",
    GOOGLE_RSS("Bitcoin OR BTC when:1d")
  ],
  forex: [
    "https://www.livemint.com/rss/markets",
    GOOGLE_RSS("USDINR OR rupee OR forex India when:1d")
  ]
};
NEWS_FEEDS.all = [...NEWS_FEEDS.nse, NEWS_FEEDS.btc[0], NEWS_FEEDS.forex[1]];

const HUB_JUNK = /share market today, nifty|latest share market news live updates|bse\/nse live, sensex today/i;
const MARKET_HINT =
  /\b(nifty|sensex|nse|bse|stock|share|equity|rupee|inr|fii|dii|rbi|sebi|ipo|vix|bank nifty|f&o|fno|derivative|bitcoin|btc|crypto|forex|usd|crude|gold|gift nifty|hdfc|reliance|infosys|tcs|hcl|market|index|indices)\b/i;

function newsHost(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "News";
  }
}

function normalizeNewsItem(n) {
  if (!n) return null;
  const title = String(n.title || n.headline || n.news || n.summary || "").trim();
  if (!title) return null;
  const link = n.link || n.url || n.href || "";
  return {
    title,
    link,
    source: n.source || n.publisher || n.provider || newsHost(link),
    pubDate: n.pubDate || n.time || n.publishedAt || n.date || "",
    description: n.description || n.summary || "",
    live: true
  };
}

function mergeNews(lists, limit = 40) {
  const seen = new Set();
  const out = [];
  for (const list of lists) {
    for (const raw of list || []) {
      const item = normalizeNewsItem(raw);
      if (!item) continue;
      if (HUB_JUNK.test(item.title)) continue;
      const key = item.title.toLowerCase().replace(/\s+/g, " ").slice(0, 96);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
      if (out.length >= limit) return out;
    }
  }
  return out;
}

async function rssFeed(url) {
  const xml = await getText(url, {}, 8000);
  return parseRss(xml, 40);
}

export async function liveNews(topic = "all") {
  const key = String(topic || "all").toLowerCase();
  return cached(`news:${key}`, 25000, async () => {
    const urls = NEWS_FEEDS[key] || [GOOGLE_RSS(`${topic} stock India when:1d`)];
    const pages = await Promise.allSettled(urls.map((u) => rssFeed(u)));
    const lists = pages.filter((p) => p.status === "fulfilled").map((p) => p.value);
    let items = mergeNews(lists, 50);
    if (key === "nse" || key === "bse" || key === "all") {
      const tight = items.filter((n) => MARKET_HINT.test(`${n.title} ${n.description}`));
      if (tight.length >= 6) items = tight;
    }
    if (items.length) return items;
    throw new Error("news wire empty");
  });
}

function quotePack({ symbol, name, exchange, price, prev, change, changePct, extra = {} }) {
  const digits = extra.digits ?? 4;
  const pctVal = changePct != null ? round(num(changePct), 2) : round(pct(price, prev), 2);
  const chgVal = change != null ? round(num(change), digits) : round(price - prev, digits);
  return {
    symbol,
    name,
    exchange,
    price: round(num(price), digits),
    prev: round(num(prev), digits),
    change: chgVal,
    changePct: pctVal,
    priceChangePercent: pctVal,
    tickAt: Date.now(),
    ...extra
  };
}

function packFx(pair, q) {
  if (!q?.price) return null;
  return quotePack({
    symbol: pair.id,
    name: pair.pair,
    exchange: "FX",
    price: q.price,
    prev: q.prev,
    extra: {
      spark: q.spark || [],
      high: q.high,
      low: q.low,
      open: q.open,
      digits: pair.digits,
      group: pair.group,
      yahoo: pair.yahoo,
      live: true,
      source: "yahoo"
    }
  });
}

export async function getForexLive() {
  return cached("fx:live", 2000, async () => {
    const rows = await mapLimit(FOREX_PAIRS, 6, async (pair) => {
      try {
        const q = await yahooQuoteLive(pair.yahoo);
        return packFx(pair, q);
      } catch {
        return null;
      }
    });
    let pairs = rows.filter(Boolean);
    if (pairs.length < 4) {
      try {
        const er = await cached("er:usd", 15000, () => getJson("https://open.er-api.com/v6/latest/USD"));
        const rates = er?.rates || {};
        const fallback = FOREX_PAIRS.map((pair) => {
          let price = null;
          if (pair.id === "USDINR") price = rates.INR;
          else if (pair.id === "EURINR") price = rates.INR && rates.EUR ? rates.INR / rates.EUR : null;
          else if (pair.id === "GBPINR") price = rates.INR && rates.GBP ? rates.INR / rates.GBP : null;
          else if (pair.id === "JPYINR") price = rates.INR && rates.JPY ? rates.INR / rates.JPY : null;
          else if (pair.id === "EURUSD") price = rates.EUR ? 1 / rates.EUR : null;
          else if (pair.id === "GBPUSD") price = rates.GBP ? 1 / rates.GBP : null;
          else if (pair.id === "USDJPY") price = rates.JPY;
          else if (pair.id === "AUDUSD") price = rates.AUD ? 1 / rates.AUD : null;
          else if (pair.id === "USDCAD") price = rates.CAD;
          else if (pair.id === "USDCHF") price = rates.CHF;
          else if (pair.id === "NZDUSD") price = rates.NZD ? 1 / rates.NZD : null;
          if (!price) return null;
          return quotePack({
            symbol: pair.id,
            name: pair.pair,
            exchange: "FX",
            price,
            prev: price,
            extra: { digits: pair.digits, group: pair.group, source: "open.er-api", live: true }
          });
        }).filter(Boolean);
        const have = new Set(pairs.map((p) => p.symbol));
        pairs = [...pairs, ...fallback.filter((p) => !have.has(p.symbol))];
      } catch {
        /* keep yahoo rows */
      }
    }
    const byId = Object.fromEntries(pairs.map((p) => [p.symbol, p]));
    return {
      pairs,
      usdInr: byId.USDINR || null,
      eurusd: byId.EURUSD || null,
      gbpusd: byId.GBPUSD || null,
      usdjpy: byId.USDJPY || null,
      dxy: byId.DXY || null,
      session: "24x5"
    };
  });
}

export async function getForexBundle() {
  const tape = freshTickers(4000);
  const [live, news, chart] = await Promise.allSettled([
    tape?.forex?.length ? Promise.resolve({
      pairs: tape.forex,
      usdInr: tape.usdInr,
      eurusd: tape.eurusd,
      gbpusd: tape.gbpusd,
      usdjpy: tape.usdjpy,
      dxy: tape.dxy
    }) : getForexLive(),
    liveNews("forex"),
    yahooQuote("USDINR=X", "5d", "5m")
  ]);
  const fx = live.status === "fulfilled" ? live.value : { pairs: [] };
  return {
    ...fx,
    news: news.status === "fulfilled" ? news.value : [],
    chart: chart.status === "fulfilled" ? applyLiveLast(chart.value, "USDINR") : null
  };
}

export async function getFastQuotes() {
  const [dx, nY, sY, bY, vY, btc, fx] = await Promise.allSettled([
    downstoxOverview(),
    yahooQuoteLive("^NSEI"),
    yahooQuoteLive("^BSESN"),
    yahooQuoteLive("^NSEBANK"),
    yahooQuoteLive("^INDIAVIX"),
    binanceTicker(),
    getForexLive()
  ]);
  const overview = dx.status === "fulfilled" ? dx.value : null;
  const nse = overview?.indices?.nse || {};
  const bse = overview?.indices?.bse || {};
  const gift = overview?.indices?.giftnifty || {};
  const extras = overview?.extras || [];
  const findExtra = (name) => extras.find((x) => x.name === name) || {};
  const yN = nY.status === "fulfilled" ? nY.value : null;
  const yS = sY.status === "fulfilled" ? sY.value : null;
  const yB = bY.status === "fulfilled" ? bY.value : null;
  const yV = vY.status === "fulfilled" ? vY.value : null;

  const niftyPrice = nse.isLive && nse.price ? num(nse.price) : num(yN?.price || nse.price);
  const niftyPrev = num(nse.prevClose || yN?.prev);
  const sensexPrice = bse.isLive && bse.price ? num(bse.price) : num(yS?.price || bse.price);
  const sensexPrev = num(bse.prevClose || yS?.prev);

  return {
    session: marketSession(),
    timestamp: Date.now(),
    nifty: niftyPrice
      ? quotePack({
          symbol: "NIFTY",
          name: "Nifty 50",
          exchange: "NSE",
          price: niftyPrice,
          prev: niftyPrev,
          change: nse.changeAbs,
          extra: { open: num(nse.open || yN?.open), high: num(nse.dayHigh || yN?.high), low: num(nse.dayLow || yN?.low), live: true, spark: yN?.spark || [] }
        })
      : null,
    sensex: sensexPrice
      ? quotePack({
          symbol: "SENSEX",
          name: "Sensex",
          exchange: "BSE",
          price: sensexPrice,
          prev: sensexPrev,
          change: bse.changeAbs,
          extra: { open: num(bse.open || yS?.open), high: num(bse.dayHigh || yS?.high), low: num(bse.dayLow || yS?.low), live: true, spark: yS?.spark || [] }
        })
      : null,
    banknifty: yB
      ? quotePack({
          symbol: "BANKNIFTY",
          name: "Bank Nifty",
          exchange: "NSE",
          price: yB.price,
          prev: yB.prev,
          extra: { spark: yB.spark, live: true }
        })
      : findExtra("Bank Nifty").price
        ? quotePack({
            symbol: "BANKNIFTY",
            name: "Bank Nifty",
            exchange: "NSE",
            price: findExtra("Bank Nifty").price,
            changePct: findExtra("Bank Nifty").change
          })
        : null,
    giftnifty: gift.price
      ? quotePack({
          symbol: "GIFTNIFTY",
          name: "GIFT Nifty",
          exchange: "GIFT",
          price: gift.price,
          prev: gift.prevClose,
          change: gift.changeAbs,
          changePct: gift.change
        })
      : null,
    vix: yV
      ? quotePack({
          symbol: "INDIAVIX",
          name: "India VIX",
          exchange: "NSE",
          price: yV.price,
          prev: yV.prev,
          extra: { spark: yV.spark }
        })
      : findExtra("India VIX").price
        ? quotePack({
            symbol: "INDIAVIX",
            name: "India VIX",
            exchange: "NSE",
            price: findExtra("India VIX").price,
            changePct: findExtra("India VIX").change
          })
        : null,
    btc: btc.status === "fulfilled" ? btc.value : null,
    forex: fx.status === "fulfilled" ? fx.value.pairs : [],
    usdInr: fx.status === "fulfilled" ? fx.value.usdInr : null,
    eurusd: fx.status === "fulfilled" ? fx.value.eurusd : null,
    gbpusd: fx.status === "fulfilled" ? fx.value.gbpusd : null,
    usdjpy: fx.status === "fulfilled" ? fx.value.usdjpy : null,
    dxy: fx.status === "fulfilled" ? fx.value.dxy : null
  };
}

export async function getTickers() {
  const [dx, btc, vix, bank, niftyY, sensexY, fx] = await Promise.allSettled([
    downstoxOverview(),
    binanceBtc(),
    yahooQuote("^INDIAVIX", "5d", "15m"),
    yahooQuote("^NSEBANK", "1d", "2m"),
    yahooQuote("^NSEI", "1d", "2m"),
    yahooQuote("^BSESN", "1d", "2m"),
    getForexLive()
  ]);

  const overview = dx.status === "fulfilled" ? dx.value : null;
  const nse = overview?.indices?.nse || {};
  const bse = overview?.indices?.bse || {};
  const gift = overview?.indices?.giftnifty || {};
  const extras = overview?.extras || [];
  const findExtra = (name) => extras.find((x) => x.name === name) || {};

  let nifty = nse.price
    ? {
        symbol: "NIFTY",
        name: "Nifty 50",
        exchange: "NSE",
        price: num(nse.price),
        change: round(num(nse.changeAbs), 2),
        changePct: round(num(nse.change), 2),
        priceChangePercent: round(num(nse.change), 2),
        tickAt: Date.now(),
        open: num(nse.open),
        high: num(nse.dayHigh),
        low: num(nse.dayLow),
        prev: num(nse.prevClose),
        live: !!nse.isLive,
        spark: niftyY.status === "fulfilled" ? niftyY.value.spark : [],
        source: "downstox"
      }
    : null;

  let sensex = bse.price
    ? {
        symbol: "SENSEX",
        name: "Sensex",
        exchange: "BSE",
        price: num(bse.price),
        change: round(num(bse.changeAbs), 2),
        changePct: round(num(bse.change), 2),
        priceChangePercent: round(num(bse.change), 2),
        tickAt: Date.now(),
        open: num(bse.open),
        high: num(bse.dayHigh),
        low: num(bse.dayLow),
        prev: num(bse.prevClose),
        live: !!bse.isLive,
        spark: sensexY.status === "fulfilled" ? sensexY.value.spark : [],
        source: "downstox"
      }
    : null;

  if (!nifty) {
    const y = await yahooQuote("^NSEI");
    nifty = { ...y, symbol: "NIFTY", name: "Nifty 50", exchange: "NSE", live: y.marketState === "REGULAR", source: "yahoo" };
  }
  if (!sensex) {
    const y = await yahooQuote("^BSESN");
    sensex = { ...y, symbol: "SENSEX", name: "Sensex", exchange: "BSE", live: y.marketState === "REGULAR", source: "yahoo" };
  }

  const banknifty =
    bank.status === "fulfilled"
      ? { ...bank.value, symbol: "BANKNIFTY", name: "Bank Nifty", exchange: "NSE", source: "yahoo" }
      : extras.find((x) => x.name === "Bank Nifty")
        ? {
            symbol: "BANKNIFTY",
            name: "Bank Nifty",
            price: num(findExtra("Bank Nifty").price),
            changePct: round(num(findExtra("Bank Nifty").change), 2)
          }
        : null;

  const bitcoin =
    btc.status === "fulfilled"
      ? btc.value
      : {
          symbol: "BTCUSDT",
          price: num(findExtra("Bitcoin").price),
          changePct: round(num(findExtra("Bitcoin").change), 2),
          source: "downstox"
        };

  return {
    session: marketSession(),
    nifty,
    sensex,
    banknifty,
    giftnifty: gift.price
      ? {
          symbol: "GIFTNIFTY",
          name: "GIFT Nifty",
          price: num(gift.price),
          change: round(num(gift.changeAbs), 2),
          changePct: round(num(gift.change), 2)
        }
      : null,
    vix:
      vix.status === "fulfilled"
        ? { ...vix.value, symbol: "INDIAVIX", name: "India VIX" }
        : { price: num(findExtra("India VIX").price), changePct: round(num(findExtra("India VIX").change), 2), name: "India VIX" },
    btc: bitcoin,
    forex: fx.status === "fulfilled" ? fx.value.pairs : [],
    usdInr: fx.status === "fulfilled" ? fx.value.usdInr : findExtra("USD/INR"),
    eurusd: fx.status === "fulfilled" ? fx.value.eurusd : null,
    gbpusd: fx.status === "fulfilled" ? fx.value.gbpusd : null,
    usdjpy: fx.status === "fulfilled" ? fx.value.usdjpy : null,
    dxy: fx.status === "fulfilled" ? fx.value.dxy : null,
    gold: findExtra("Gold"),
    crude: findExtra("Crude Oil"),
    silver: findExtra("Silver"),
    eth: findExtra("Ethereum"),
    sectors: overview?.sectors || [],
    news: (overview?.news || []).map(normalizeNewsItem).filter(Boolean),
    timestamp: new Date().toISOString()
  };
}

export async function getIndexChart(key, range = "1d", interval = "2m") {
  return applyLiveLast(await getLiveCandles(key, range, interval), key);
}

export async function getStock(symbol, exchange = "NSE") {
  const clean = symbol.replace(/\.(NS|BO)$/i, "").toUpperCase();
  const ysym = exchange === "BSE" ? `${clean}.BO` : `${clean}.NS`;
  const [nse, bse, live] = await Promise.allSettled([
    yahooQuote(`${clean}.NS`, "5d", "15m"),
    yahooQuote(`${clean}.BO`, "5d", "15m"),
    yahooQuoteLive(exchange === "BSE" ? `${clean}.BO` : `${clean}.NS`)
  ]);
  const livePack = live.status === "fulfilled" ? live.value : null;
  return {
    symbol: clean,
    nse: nse.status === "fulfilled" ? applyLiveLast(nse.value, clean, livePack) : null,
    bse: bse.status === "fulfilled" ? applyLiveLast(bse.value, clean, livePack) : null,
    preferred: exchange === "BSE" ? "bse" : "nse",
    requested: ysym,
    live: true
  };
}

export async function getNifty50() {
  return cached("nifty50", 8000, async () => {
    const rows = await mapLimit(NIFTY50, 8, async (row) => {
      const q = await yahooQuote(`${row.symbol}.NS`, "1d", "5m");
      return {
        ...row,
        price: q.price,
        change: q.change,
        changePct: q.changePct,
        high: q.high,
        low: q.low,
        volume: q.volume,
        spark: q.spark,
        exchange: "NSE"
      };
    });
    return rows.filter(Boolean);
  });
}

export async function getScreener() {
  const stocks = await getNifty50();
  return stocks
    .map((s) => ({
      ...s,
      rangePct: s.high && s.low ? round(((s.price - s.low) / (s.high - s.low)) * 100, 1) : 50,
      momentum: s.changePct,
      volume: s.volume
    }))
    .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));
}

export async function getHeatmap() {
  const tape = freshTickers(4000);
  const [tickers, stocks] = await Promise.all([tape ? Promise.resolve(tape) : getTickers(), getNifty50()]);
  return {
    sectors: tickers.sectors,
    stocks,
    timestamp: tickers.timestamp,
    live: true
  };
}

export async function getFiidii() {
  const [daily, other, outlook] = await Promise.allSettled([
    downstox("/fiidii/daily", 120000),
    downstox("/other-side/", 120000),
    downstox("/weekly-outlook/", 180000)
  ]);
  return {
    daily: daily.status === "fulfilled" ? daily.value : null,
    participants: other.status === "fulfilled" ? other.value : null,
    outlook: outlook.status === "fulfilled" ? outlook.value : null
  };
}

export async function getBreakouts() {
  return downstox("/breakouts/", 120000);
}

export async function getAnnouncements(symbol, limit = 30) {
  const q = symbol ? `?symbol=${encodeURIComponent(symbol)}&limit=${limit}` : `?limit=${limit}`;
  return downstox(`/announcements/${q}`, 60000);
}

export async function getBtcBundle() {
  const tape = liveQuote("BTCUSD");
  const [bn, cg, chartUsd, chartInr, news] = await Promise.allSettled([
    tape ? Promise.resolve(tape) : binanceBtc(),
    coinGeckoBtc(),
    yahooQuote("BTC-USD", "5d", "15m"),
    yahooQuote("BTC-INR", "5d", "15m"),
    liveNews("btc")
  ]);
  const live = bn.status === "fulfilled" ? bn.value : tape;
  return {
    live,
    gecko: cg.status === "fulfilled" ? cg.value : null,
    usd: chartUsd.status === "fulfilled" ? applyLiveLast(chartUsd.value, "BTCUSD", live) : null,
    inr: chartInr.status === "fulfilled" ? chartInr.value : null,
    news: news.status === "fulfilled" ? news.value : [],
    session: "24x7"
  };
}

export async function getNewsBundle() {
  const [all, nse, btc, fx, dx] = await Promise.allSettled([
    liveNews("all"),
    liveNews("nse"),
    liveNews("btc"),
    liveNews("forex"),
    downstoxOverview()
  ]);
  const dxNews = (dx.status === "fulfilled" ? dx.value?.news || [] : []).map(normalizeNewsItem).filter(Boolean);
  const market = nse.status === "fulfilled" ? nse.value : [];
  const wire = all.status === "fulfilled" ? all.value : [];
  const headline = mergeNews([market, wire, dxNews], 30);
  return {
    headline,
    market: market.length ? market : headline,
    nse: market,
    btc: btc.status === "fulfilled" ? btc.value : [],
    forex: fx.status === "fulfilled" ? fx.value : [],
    live: true,
    generatedAt: new Date().toISOString()
  };
}

export function sma(arr, n) {
  if (arr.length < n) return null;
  const slice = arr.slice(-n);
  return slice.reduce((a, b) => a + b, 0) / n;
}

export function ema(arr, n) {
  if (arr.length < n) return null;
  const k = 2 / (n + 1);
  let e = arr.slice(0, n).reduce((a, b) => a + b, 0) / n;
  for (let i = n; i < arr.length; i++) e = arr[i] * k + e * (1 - k);
  return e;
}

export function rsi(arr, n = 14) {
  if (arr.length < n + 1) return null;
  let gain = 0;
  let loss = 0;
  for (let i = arr.length - n; i < arr.length; i++) {
    const d = arr[i] - arr[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  if (!loss) return 100;
  const rs = gain / loss;
  return 100 - 100 / (1 + rs);
}

export function macd(arr) {
  const e12 = ema(arr, 12);
  const e26 = ema(arr, 26);
  if (e12 == null || e26 == null) return null;
  return { macd: e12 - e26, signal: null, hist: null, ema12: e12, ema26: e26 };
}

export function bollinger(arr, n = 20) {
  if (arr.length < n) return null;
  const slice = arr.slice(-n);
  const mean = slice.reduce((a, b) => a + b, 0) / n;
  const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const sd = Math.sqrt(variance);
  return { mid: mean, upper: mean + 2 * sd, lower: mean - 2 * sd, width: (4 * sd) / mean };
}

export async function getTechnicals(key = "NIFTY") {
  const spec = INDEX_MAP[key] || { yahoo: key.includes(".") ? key : `${key}.NS` };
  const q = liveQuote(key);
  const [hist, live] = await Promise.allSettled([
    yahooQuote(spec.yahoo || spec, "3mo", "1d"),
    q ? Promise.resolve(q) : yahooQuoteLive(spec.yahoo || spec)
  ]);
  if (hist.status !== "fulfilled") throw hist.reason || new Error("technicals feed failed");
  const chart = applyLiveLast(hist.value, key, live.status === "fulfilled" ? live.value : null);
  const closes = (chart.candles || []).map((c) => c.c);
  const last = closes.at(-1);
  const signals = [];
  const s20 = sma(closes, 20);
  const s50 = sma(closes, 50);
  const s200 = sma(closes, 200);
  const r = rsi(closes, 14);
  const bb = bollinger(closes, 20);
  const m = macd(closes);
  if (s20 && last > s20) signals.push({ name: "Price > SMA20", bias: "bullish" });
  else if (s20) signals.push({ name: "Price < SMA20", bias: "bearish" });
  if (s20 && s50) signals.push({ name: s20 > s50 ? "SMA20 > SMA50 golden lean" : "SMA20 < SMA50 dead lean", bias: s20 > s50 ? "bullish" : "bearish" });
  if (s200) signals.push({ name: last > s200 ? "Above 200 DMA" : "Below 200 DMA", bias: last > s200 ? "bullish" : "bearish" });
  if (r != null) {
    signals.push({
      name: r > 70 ? "RSI overbought" : r < 30 ? "RSI oversold" : "RSI neutral",
      bias: r > 70 ? "bearish" : r < 30 ? "bullish" : "neutral",
      value: round(r, 1)
    });
  }
  if (bb) {
    signals.push({
      name: last > bb.upper ? "Above upper Bollinger" : last < bb.lower ? "Below lower Bollinger" : "Inside Bollinger band",
      bias: last > bb.upper ? "bearish" : last < bb.lower ? "bullish" : "neutral"
    });
  }
  const bull = signals.filter((s) => s.bias === "bullish").length;
  const bear = signals.filter((s) => s.bias === "bearish").length;
  return {
    symbol: key,
    price: chart.price,
    changePct: chart.changePct,
    sma20: round(s20, 2),
    sma50: round(s50, 2),
    sma200: round(s200, 2),
    ema9: round(ema(closes, 9), 2),
    ema21: round(ema(closes, 21), 2),
    rsi: round(r, 1),
    macd: m ? round(m.macd, 2) : null,
    bollinger: bb
      ? { mid: round(bb.mid, 2), upper: round(bb.upper, 2), lower: round(bb.lower, 2), width: round(bb.width * 100, 2) }
      : null,
    signals,
    score: bull - bear,
    bias: bull > bear + 1 ? "Bullish" : bear > bull + 1 ? "Bearish" : "Neutral",
    spark: chart.spark,
    candles: chart.candles.slice(-90),
    live: true,
    tickAt: chart.tickAt || Date.now()
  };
}
