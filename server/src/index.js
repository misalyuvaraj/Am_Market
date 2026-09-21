import "./env.js";
import express from "express";
import cors from "cors";
import http from "http";
import { attachLive } from "./live.js";
import {
  getTickers,
  getIndexChart,
  getLiveCandles,
  getStock,
  getNifty50,
  getScreener,
  getHeatmap,
  getFiidii,
  getBreakouts,
  getAnnouncements,
  getBtcBundle,
  getForexBundle,
  getNewsBundle,
  getTechnicals,
  liveNews,
  downstox
} from "./market.js";
import {
  getOptionChain,
  getOiAnalysis,
  STRATEGY_TEMPLATES,
  buildTemplateLegs,
  analyzeStrategy,
  wizard,
  easyOptions
} from "./options.js";
import { chat, marketPulse, listEngines, DISCLAIMER } from "./ai.js";
import { analyzeSymbol } from "./ml.js";
import { marketSession } from "./lib.js";
import { FNO_STOCKS, INDEX_MAP } from "./universe.js";
import { freshTickers, liveAgeMs } from "./snapshot.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  const engines = listEngines();
  res.json({
    ok: true,
    name: "Am Market",
    session: marketSession(),
    liveAgeMs: liveAgeMs(),
    live: liveAgeMs() != null,
    engines: engines.map(({ id, label, ready }) => ({ id, label, ready })),
    disclaimer: DISCLAIMER
  });
});

app.get("/api/overview", async (_req, res) => {
  try {
    const pulse = await marketPulse();
    res.json({ pulse });
  } catch (err) {
    res.status(502).json({ error: err.message || "pulse failed" });
  }
});

app.get("/api/tickers", async (_req, res) => {
  try {
    res.json(freshTickers(4000) || await getTickers());
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.get("/api/chart/:symbol", async (req, res) => {
  try {
    res.json(await getIndexChart(req.params.symbol.toUpperCase(), req.query.range || "1d", req.query.interval || "2m"));
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.get("/api/candles/:symbol", async (req, res) => {
  try {
    res.json(
      await getLiveCandles(
        req.params.symbol.toUpperCase(),
        req.query.range || "5d",
        req.query.interval || "5m"
      )
    );
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.get("/api/quote/:symbol", async (req, res) => {
  try {
    res.json(await getStock(req.params.symbol, (req.query.exchange || "NSE").toUpperCase()));
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.get("/api/nifty50", async (_req, res) => {
  try {
    res.json(await getNifty50());
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.get("/api/heatmap", async (_req, res) => {
  try {
    res.json(await getHeatmap());
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.get("/api/screener", async (_req, res) => {
  try {
    res.json(await getScreener());
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.get("/api/option-chain", async (req, res) => {
  try {
    res.json(await getOptionChain((req.query.symbol || "NIFTY").toUpperCase(), req.query.expiry));
  } catch (err) {
    res.status(502).json({ error: err.message, hint: "NSE sometimes rate-limits. Retry in a few seconds." });
  }
});

app.get("/api/oi", async (req, res) => {
  try {
    res.json(await getOiAnalysis((req.query.symbol || "NIFTY").toUpperCase()));
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.get("/api/strategies", (_req, res) => {
  res.json(STRATEGY_TEMPLATES);
});

app.post("/api/strategies/template", async (req, res) => {
  try {
    const symbol = (req.body.symbol || "NIFTY").toUpperCase();
    const chain = await getOptionChain(symbol);
    const id = req.body.id || "bull-call";
    const legs = buildTemplateLegs(id, chain);
    const analysis = analyzeStrategy({ legs, spot: chain.spot, lotSize: chain.lot, days: chain.days });
    res.json({ chain: { spot: chain.spot, lot: chain.lot, expiry: chain.expiry, pcr: chain.pcr, maxPain: chain.maxPain }, legs, analysis });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.post("/api/strategies/analyze", async (req, res) => {
  try {
    const symbol = (req.body.symbol || "NIFTY").toUpperCase();
    const chain = await getOptionChain(symbol);
    const analysis = analyzeStrategy({
      legs: req.body.legs || [],
      spot: req.body.spot || chain.spot,
      lotSize: req.body.lotSize || chain.lot,
      days: req.body.days || chain.days
    });
    res.json({ spot: chain.spot, lot: chain.lot, expiry: chain.expiry, analysis });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.post("/api/wizard", async (req, res) => {
  try {
    res.json(await wizard(req.body || {}));
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.post("/api/easy-options", async (req, res) => {
  try {
    res.json(await easyOptions(req.body || {}));
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.get("/api/news", async (req, res) => {
  try {
    if (req.query.topic) return res.json(await liveNews(req.query.topic));
    res.json(await getNewsBundle());
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.get("/api/fiidii", async (_req, res) => {
  try {
    res.json(await getFiidii());
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.get("/api/breakouts", async (_req, res) => {
  try {
    res.json(await getBreakouts());
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.get("/api/announcements", async (req, res) => {
  try {
    res.json(await getAnnouncements(req.query.symbol, Number(req.query.limit || 30)));
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.get("/api/btc", async (_req, res) => {
  try {
    res.json(await getBtcBundle());
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.get("/api/forex", async (_req, res) => {
  try {
    res.json(await getForexBundle());
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.get("/api/technicals/:symbol", async (req, res) => {
  try {
    res.json(await getTechnicals(req.params.symbol.toUpperCase()));
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.get("/api/holidays", async (_req, res) => {
  try {
    res.json(await downstox("/holidays/", 3600000));
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.get("/api/meta", (_req, res) => {
  res.json({ indices: INDEX_MAP, fno: FNO_STOCKS });
});

app.get("/api/ai/engines", (_req, res) => {
  res.json({ engines: listEngines(), disclaimer: DISCLAIMER });
});

app.post("/api/chat", async (req, res) => {
  try {
    const message = String(req.body.message || "").slice(0, 2000);
    if (!message) return res.status(400).json({ error: "message required" });
    const engine = String(req.body.engine || "auto").toLowerCase();
    res.json(await chat(message, req.body.history || [], req.body.lang || "en", engine));
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.get("/api/pulse", async (_req, res) => {
  try {
    res.json(await marketPulse());
  } catch (err) {
    res.status(502).json({ error: err.message || "pulse failed" });
  }
});

app.get("/api/ml/:symbol", async (req, res) => {
  try {
    res.json(await analyzeSymbol((req.params.symbol || "NIFTY").toUpperCase()));
  } catch (err) {
    res.status(502).json({ error: err.message || "ml failed" });
  }
});

app.get("/api/ml", async (req, res) => {
  try {
    res.json(await analyzeSymbol((req.query.symbol || "NIFTY").toUpperCase()));
  } catch (err) {
    res.status(502).json({ error: err.message || "ml failed" });
  }
});

const server = http.createServer(app);
attachLive(server);

const port = Number(process.env.PORT || 8787);
server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`Port ${port} is already in use. Stop the extra Am Market API and try again.`);
    process.exit(0);
  }
  throw err;
});
server.listen(port, () => {
  console.log(`Am Market API live on http://localhost:${port}`);
});
