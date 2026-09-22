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
    const prevAt = Number(prev[k]?.tickAt) || 0;
    const nextAt = Number(fast[k]?.tickAt) || 0;
    if (prevAt && nextAt && nextAt + 250 < prevAt && Number(fast[k].price) === Number(prev[k].price)) continue;
    const merged = { ...(prev[k] || {}), ...fast[k] };
    merged.spark = prev[k]?.spark?.length ? pushSpark(prev[k], merged.price) : (fast[k].spark || []);
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
  let seq = 0;
  let lastSig = "";
  let lastSend = 0;

  function signature(data) {
    if (!data) return "";
    const keys = ["nifty", "sensex", "banknifty", "vix", "btc", "usdInr", "eurusd", "gbpusd", "usdjpy"];
    return keys.map((k) => {
      const q = data[k] || {};
      return `${q.price ?? ""}:${q.high ?? ""}:${q.low ?? ""}:${q.bar?.c ?? ""}:${q.bar?.v ?? ""}`;
    }).join("|");
  }

  function publish(data) {
    if (!data) return;
    const sig = signature(data);
    const changed = sig !== lastSig;
    const now = Date.now();
    if (!changed && now - lastSend < 2000) return;
    lastSig = sig;
    lastSend = now;
    seq += 1;
    data.seq = seq;
    data.feed = "live";
    setLiveSnapshot(data);
    broadcast(changed
      ? { type: "tickers", data, seq, ts: now, tapeAt: data.tapeAt }
      : { type: "ping", seq, ts: now, tapeAt: data.tapeAt });
  }

  async function fullPulse() {
    try {
      const [tickers, btc, news] = await Promise.all([
        getTickers(),
        binanceBtc().catch(() => null),
        liveNews("nse").catch(() => [])
      ]);
      const slow = mergeQuotes(tickers, { btc: btc || tickers.btc, session: tickers.session });
      lastTickers = mergeQuotes(slow, lastTickers);
      lastTickers.news = (Array.isArray(news) && news.length ? news : lastTickers.news || tickers.news) || [];
      publish(lastTickers);
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
      publish(lastTickers);
    } catch {
      /* keep last snapshot */
    } finally {
      pulsing = false;
    }
  }

  setInterval(fastPulse, 100);
  setInterval(fullPulse, 15000);
  fullPulse().then(fastPulse);

  let bn;
  const connectBinance = () => {
    try {
      bn = new WebSocket("wss://stream.binance.com:9443/stream?streams=btcusdt@ticker/btcusdt@kline_1m");
    } catch {
      setTimeout(connectBinance, 3000);
      return;
    }
    let lastBn = 0;
    bn.on("message", (buf) => {
      if (Date.now() - lastBn < 100) return;
      lastBn = Date.now();
      try {
        const msg = JSON.parse(buf.toString());
        const t = msg.data || msg;
        if (t.e === "kline" && t.k) {
          const k = t.k;
          const bar = { t: Number(k.t), o: Number(k.o), h: Number(k.h), l: Number(k.l), c: Number(k.c), v: Number(k.v) };
          if (!lastTickers) lastTickers = { session: { state: "crypto" }, timestamp: new Date().toISOString() };
          const prev = lastTickers.btc || {};
          if (Number(prev.price) === bar.c && prev.bar?.t === bar.t && Number(prev.bar?.v) === bar.v) return;
          lastTickers.btc = { ...prev, price: bar.c, bar, tickAt: Date.now(), source: "binance-ws", spark: pushSpark(prev, bar.c) };
          publish(lastTickers);
          return;
        }
        const btc = packBtcTicker(t, lastTickers?.btc?.spark || []);
        btc.spark = pushSpark(lastTickers?.btc, btc.price);
        btc.bar = lastTickers?.btc?.bar;
        if (lastTickers?.btc && Number(lastTickers.btc.price) === Number(btc.price)) return;
        if (lastTickers) lastTickers.btc = { ...(lastTickers.btc || {}), ...btc };
        else lastTickers = { btc, session: { state: "crypto" }, timestamp: new Date().toISOString() };
        publish(lastTickers);
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
