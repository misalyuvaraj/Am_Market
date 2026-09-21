import { WebSocket, WebSocketServer } from "ws";
import { getTickers, getFastQuotes, binanceBtc, packBtcTicker, liveNews } from "./market.js";
import { setLiveSnapshot } from "./snapshot.js";

function pushSpark(prev, price) {
  const spark = [...(prev?.spark || [])];
  if (Number.isFinite(price) && (spark.length === 0 || spark.at(-1) !== price)) spark.push(price);
  return spark.slice(-120);
}

function mergeQuotes(prev, fast) {
  if (!fast) return prev;
  if (!prev) return { ...fast, timestamp: new Date(fast.timestamp || Date.now()).toISOString() };
  const keys = ["nifty", "sensex", "banknifty", "giftnifty", "vix", "btc", "usdInr", "eurusd", "gbpusd", "usdjpy", "dxy"];
  const next = { ...prev, session: fast.session || prev.session, timestamp: new Date().toISOString() };
  for (const k of keys) {
    if (!fast[k]) continue;
    const merged = { ...(prev[k] || {}), ...fast[k] };
    merged.spark = pushSpark(prev[k], merged.price);
    merged.priceChangePercent = merged.changePct;
    next[k] = merged;
  }
  if (fast.forex?.length) {
    const prevMap = Object.fromEntries((prev.forex || []).map((p) => [p.symbol, p]));
    next.forex = fast.forex.map((p) => {
      const old = prevMap[p.symbol];
      return { ...old, ...p, spark: pushSpark(old, p.price), priceChangePercent: p.changePct };
    });
  }
  return next;
}

export function attachLive(server) {
  const wss = new WebSocketServer({ server, path: "/ws" });
  const clients = new Set();

  wss.on("error", (err) => {
    if (err.code !== "EADDRINUSE") console.error("ws", err.message);
  });

  wss.on("connection", (socket) => {
    clients.add(socket);
    socket.send(JSON.stringify({ type: "hello", ts: Date.now() }));
    if (lastTickers) socket.send(JSON.stringify({ type: "tickers", data: lastTickers, ts: Date.now() }));
    socket.on("close", () => clients.delete(socket));
    socket.on("error", () => clients.delete(socket));
  });

  const broadcast = (payload) => {
    const raw = JSON.stringify(payload);
    for (const socket of clients) {
      if (socket.readyState === 1) socket.send(raw);
    }
  };

  let lastTickers = null;
  let pulsing = false;

  async function fullPulse() {
    try {
      const [tickers, btc, news] = await Promise.all([
        getTickers(),
        binanceBtc().catch(() => null),
        liveNews("nse").catch(() => [])
      ]);
      lastTickers = mergeQuotes(tickers, { btc: btc || tickers.btc, session: tickers.session });
      lastTickers.news = (Array.isArray(news) && news.length ? news : tickers.news) || [];
      setLiveSnapshot(lastTickers);
      broadcast({ type: "tickers", data: lastTickers, ts: Date.now() });
    } catch (err) {
      broadcast({ type: "error", message: err.message, ts: Date.now() });
    }
  }

  async function fastPulse() {
    if (pulsing) return;
    pulsing = true;
    try {
      const fast = await getFastQuotes();
      lastTickers = mergeQuotes(lastTickers, fast);
      setLiveSnapshot(lastTickers);
      broadcast({ type: "tickers", data: lastTickers, ts: Date.now() });
    } catch {
      /* keep last snapshot */
    } finally {
      pulsing = false;
    }
  }

  setInterval(fastPulse, 1000);
  setInterval(fullPulse, 15000);
  fullPulse().then(fastPulse);

  let bn;
  const connectBinance = () => {
    try {
      bn = new WebSocket("wss://stream.binance.com:9443/ws/btcusdt@ticker");
    } catch {
      setTimeout(connectBinance, 3000);
      return;
    }
    let lastBn = 0;
    bn.on("message", (buf) => {
      if (Date.now() - lastBn < 200) return;
      lastBn = Date.now();
      try {
        const t = JSON.parse(buf.toString());
        const btc = packBtcTicker(t, lastTickers?.btc?.spark || []);
        btc.spark = pushSpark(lastTickers?.btc, btc.price);
        if (lastTickers) lastTickers.btc = { ...(lastTickers.btc || {}), ...btc };
        else lastTickers = { btc, session: { state: "crypto" }, timestamp: new Date().toISOString() };
        setLiveSnapshot(lastTickers);
        broadcast({ type: "btc", data: lastTickers.btc, ts: Date.now() });
      } catch {
        /* ignore parse */
      }
    });
    bn.on("close", () => setTimeout(connectBinance, 2000));
    bn.on("error", () => {
      try {
        bn.close();
      } catch {
        /* ignore */
      }
    });
  };
  connectBinance();

  return wss;
}
