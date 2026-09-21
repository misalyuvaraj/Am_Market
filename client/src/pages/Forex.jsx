import { useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { useApi, useFlash } from "../hooks";
import { cls, fmt, livePct } from "../api";
import { PriceChart, Spark } from "../Charts";
import { livePath } from "../symbols";
import { useT } from "../i18n";

function PairCard({ pair }) {
  const pct = livePct(pair);
  const flash = useFlash(pair?.price);
  const navigate = useNavigate();
  const d = pair?.digits ?? 4;
  return (
    <div className={`card click-card ${flash}`} onClick={() => pair?.symbol && navigate(livePath(pair.symbol))}>
      <div className="row">
        <h3>{pair?.name || pair?.symbol}</h3>
        <span className="muted">{pair?.group}</span>
      </div>
      <div className="stat mono">{fmt(pair?.price, d)}</div>
      <div className={`mono pct-live ${cls(pct)} ${flash}`}>
        {pct == null ? "—" : `${pct >= 0 ? "+" : ""}${fmt(pct, 2)}%`} · {fmt(pair?.change, d)}
      </div>
      <Spark data={pair?.spark || []} up={(pct || 0) >= 0} />
    </div>
  );
}

export default function Forex() {
  const { tickers } = useOutletContext();
  const t = useT();
  const navigate = useNavigate();
  const { data, error, loading } = useApi("/api/forex", [], { refreshMs: 4000 });
  const [pair, setPair] = useState("USDINR");
  const chart = useApi(`/api/chart/${pair}?range=5d&interval=5m`, [pair], { refreshMs: 4000 });
  const livePairs = tickers?.forex?.length ? tickers.forex : data?.pairs || [];
  const tech = useApi(`/api/technicals/${pair}`, [pair], { refreshMs: 5000 });

  return (
    <div className="page">
      <div>
        <h2>{t("forex.title")}</h2>
        <p className="sub">{t("forex.sub")}</p>
      </div>
      {error ? <div className="err">{error}</div> : null}
      {loading && !livePairs.length ? <div className="muted">Loading FX tape…</div> : null}
      <div className="grid g-4">
        <PairCard pair={tickers?.usdInr || data?.usdInr} />
        <PairCard pair={tickers?.eurusd || data?.eurusd} />
        <PairCard pair={tickers?.gbpusd || data?.gbpusd} />
        <PairCard pair={tickers?.usdjpy || data?.usdjpy} />
      </div>
      <div className="card">
        <h3>{t("forex.pairs")}</h3>
        <div className="chips" style={{ marginBottom: 12 }}>
          {livePairs.map((p) => (
            <button key={p.symbol} className={`chip ${pair === p.symbol ? "on" : ""}`} onClick={() => setPair(p.symbol)}>
              {p.name}
            </button>
          ))}
        </div>
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th className="left">Pair</th>
                <th>LTP</th>
                <th>Chg%</th>
                <th>Change</th>
                <th>High</th>
                <th>Low</th>
              </tr>
            </thead>
            <tbody>
              {livePairs.map((p) => (
                <tr key={p.symbol} className={pair === p.symbol ? "atm row-link" : "row-link"} onClick={() => { setPair(p.symbol); navigate(livePath(p.symbol)); }}>
                  <td className="left">
                    <b>{p.name}</b>
                    <div className="muted">{p.group} · {p.symbol}</div>
                  </td>
                  <td className="mono">{fmt(p.price, p.digits ?? 4)}</td>
                  <td className={`mono ${cls(p.changePct)}`}>{fmt(p.changePct, 2)}%</td>
                  <td className={`mono ${cls(p.change)}`}>{fmt(p.change, p.digits ?? 4)}</td>
                  <td className="mono">{fmt(p.high, p.digits ?? 4)}</td>
                  <td className="mono">{fmt(p.low, p.digits ?? 4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="grid g-2">
        <div className="card">
          <h3>{pair} {t("forex.tape")}</h3>
          <PriceChart candles={chart.data?.candles || data?.chart?.candles || []} />
        </div>
        <div className="card">
          <h3>Technicals · {tech.data?.bias || "…"}</h3>
          <p>RSI {tech.data?.rsi ?? "—"} · SMA20 {fmt(tech.data?.sma20, 4)} · SMA50 {fmt(tech.data?.sma50, 4)}</p>
          {(tech.data?.signals || []).map((s) => (
            <div key={s.name} className="row" style={{ padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
              <span>{s.name}</span>
              <b className={s.bias === "bullish" ? "up" : s.bias === "bearish" ? "down" : ""}>{s.bias}</b>
            </div>
          ))}
        </div>
      </div>
      <div className="card">
        <h3>{t("forex.news")}</h3>
        {(data?.news || []).slice(0, 12).map((n) => (
          <div className="news-item" key={n.link || n.title}>
            <a href={n.link} target="_blank" rel="noreferrer">{n.title}</a>
            <div className="muted">{n.source}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
