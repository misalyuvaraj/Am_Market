import { useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { useApi } from "../hooks";
import { cls, fmt, fmtn, livePct } from "../api";
import { Spark } from "../Charts";
import { livePath, tickerFor } from "../symbols";
import { useT } from "../i18n";

const NAMES = ["NIFTY", "BANKNIFTY", "SENSEX", "RELIANCE", "HDFCBANK", "INFY", "TCS", "HCLTECH", "SBIN", "BTCUSD"];

function tone(v) {
  if (v == null || Number.isNaN(Number(v))) return "";
  return cls(Number(v));
}

function FinRow({ label, value, suffix = "" }) {
  if (value == null || value === "") return null;
  return (
    <div className="row" style={{ padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
      <span className="muted">{label}</span>
      <b className="mono">{typeof value === "number" ? fmt(value) : value}{suffix}</b>
    </div>
  );
}

export default function MlLab() {
  const t = useT();
  const navigate = useNavigate();
  const { tickers } = useOutletContext();
  const [symbol, setSymbol] = useState("NIFTY");
  const { data, error, loading } = useApi(`/api/ml/${symbol}`, [symbol], { refreshMs: 5000 });
  const ready = String(data?.symbol || "").toUpperCase() === symbol;
  const d = ready ? data : null;
  const live = tickerFor(symbol, tickers);
  const px = live?.price ?? d?.price;
  const chg = livePct(live) ?? d?.changePct;

  return (
    <div className="page">
      <div className="row">
        <div>
          <h2>{t("ml.title")}</h2>
          <p className="sub">{t("ml.sub")}</p>
        </div>
      </div>
      <div className="chips">
        {NAMES.map((s) => (
          <button key={s} className={`chip ${symbol === s ? "on" : ""}`} onClick={() => setSymbol(s)}>{s}</button>
        ))}
      </div>
      {loading || !ready ? <div className="muted">{t("ml.loading")} {symbol}</div> : null}
      {error ? <div className="err">{error}</div> : null}

      <div className="card click-card" onClick={() => navigate(livePath(symbol))}>
        <div className="row">
          <div>
            <h3 style={{ margin: 0 }}>{d?.name || symbol}</h3>
            <div className="stat mono">{fmt(px)}</div>
            <div className={`mono ${tone(chg)}`}>{chg >= 0 ? "+" : ""}{fmt(chg)}%</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <span className={`chip ${d?.lean === "Bullish" ? "on" : ""}`}>{d?.lean || "—"} · {d?.score ?? "—"}</span>
            <div className="muted" style={{ marginTop: 8 }}>{t("ml.confidence")} {d?.confidence ?? "—"}% · {d?.horizon}</div>
          </div>
        </div>
        <Spark data={live?.spark || d?.spark || []} up={(chg || 0) >= 0} height={70} />
        <p className="muted">{d?.forecast?.summary}</p>
      </div>

      <div className="grid g-2">
        <div className="card">
          <h3>📈 {t("ml.trend")}</h3>
          <p>{d?.trend?.summary}</p>
          <div className="grid g-4">
            <div><div className="muted">{t("ml.week")}</div><b className={`mono ${tone(d?.trend?.weekPct)}`}>{fmt(d?.trend?.weekPct)}%</b></div>
            <div><div className="muted">{t("ml.month")}</div><b className={`mono ${tone(d?.trend?.monthPct)}`}>{fmt(d?.trend?.monthPct)}%</b></div>
            <div><div className="muted">{t("ml.slope")}</div><b className="mono">{fmt(d?.trend?.slopePerDayPct, 3)}</b></div>
            <div><div className="muted">R²</div><b className="mono">{fmt(d?.trend?.r2, 2)}</b></div>
          </div>
        </div>
        <div className="card">
          <h3>📊 {t("ml.history")}</h3>
          <p>{d?.history?.volumeBias}</p>
          <div className="grid g-4">
            <div><div className="muted">{t("ml.lastVol")}</div><b className="mono">{fmtn(d?.history?.lastVolume)}</b></div>
            <div><div className="muted">{t("ml.avgVol")}</div><b className="mono">{fmtn(d?.history?.avgVolume20)}</b></div>
            <div><div className="muted">{t("ml.volRatio")}</div><b className="mono">{fmt(d?.history?.volumeRatio)}</b></div>
            <div><div className="muted">{t("ml.range")}</div><b className="mono">{d?.history?.range20Pct ?? "—"}%</b></div>
          </div>
        </div>
      </div>

      <div className="grid g-2">
        <div className="card">
          <h3>📰 {t("ml.news")}</h3>
          <p>{t("ml.tone")}: <b>{d?.sentiment?.bias || "—"}</b> · {d?.sentiment?.pos || 0} / {d?.sentiment?.neg || 0}</p>
          {(d?.sentiment?.headlines || []).slice(0, 6).map((n) => (
            <div className="news-item" key={n.link || n.title}>
              <a href={n.link} target="_blank" rel="noreferrer">{n.title}</a>
              <div className={`muted ${n.tone === "bullish" ? "up" : n.tone === "bearish" ? "down" : ""}`}>{n.tone} · {n.source}</div>
            </div>
          ))}
        </div>
        <div className="card">
          <h3>💰 {t("ml.financials")}</h3>
          <p className="muted">{d?.financials?.note}</p>
          <FinRow label="P/E" value={d?.financials?.trailingPE} />
          <FinRow label="Sector P/E" value={d?.financials?.sectorPe} />
          <FinRow label="Forward P/E" value={d?.financials?.forwardPE} />
          <FinRow label="EPS" value={d?.financials?.eps} />
          <FinRow label="Book" value={d?.financials?.bookValue} />
          <FinRow label="P/B" value={d?.financials?.priceToBook} />
          <FinRow label="Beta" value={d?.financials?.beta} />
          <FinRow label="Div yield" value={d?.financials?.dividendYield} suffix="%" />
          <FinRow label="Profit margin" value={d?.financials?.profitMargins} suffix="%" />
          <FinRow label="52w high" value={d?.financials?.week52High} />
          <FinRow label="52w low" value={d?.financials?.week52Low} />
        </div>
      </div>

      <div className="grid g-2">
        <div className="card">
          <h3>🔎 {t("ml.technicals")}</h3>
          <div className="grid g-4">
            <div><div className="muted">RSI</div><b className="mono">{d?.technicals?.rsi ?? "—"}</b></div>
            <div><div className="muted">MACD</div><b className={`mono ${tone(d?.technicals?.macd)}`}>{fmt(d?.technicals?.macd)}</b></div>
            <div><div className="muted">SMA20</div><b className="mono">{fmt(d?.technicals?.sma20)}</b></div>
            <div><div className="muted">SMA200</div><b className="mono">{fmt(d?.technicals?.sma200)}</b></div>
          </div>
          {(d?.technicals?.signals || []).map((s) => (
            <div key={s.name} className="row" style={{ padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
              <span>{s.name}</span>
              <b className={s.bias === "bullish" ? "up" : s.bias === "bearish" ? "down" : ""}>{s.bias}</b>
            </div>
          ))}
        </div>
        <div className="card">
          <h3>⚠️ {t("ml.risk")}</h3>
          <p>{d?.risk?.summary}</p>
          <div className="grid g-4">
            <div><div className="muted">{t("ml.vol20")}</div><b className="mono">{fmt(d?.risk?.realizedVol20, 1)}%</b></div>
            <div><div className="muted">{t("ml.vol60")}</div><b className="mono">{fmt(d?.risk?.realizedVol60, 1)}%</b></div>
            <div><div className="muted">ATR</div><b className="mono">{fmt(d?.risk?.atr14)} ({fmt(d?.risk?.atrPct)}%)</b></div>
            <div><div className="muted">{t("ml.dd")}</div><b className="mono">{fmt(d?.risk?.drawdown3m, 1)}%</b></div>
          </div>
          <p className="muted">{t("ml.regime")}: {d?.risk?.volRegime || "—"}</p>
        </div>
      </div>

      <div className="grid g-2">
        <div className="card">
          <h3>🤖 {t("ml.forecast")}</h3>
          <p>{d?.forecast?.summary}</p>
          <div className="grid g-3">
            <div><div className="muted">{t("ml.lean")}</div><b>{d?.forecast?.lean}</b></div>
            <div><div className="muted">{t("ml.confidence")}</div><b className="mono">{d?.forecast?.confidence}%</b></div>
            <div><div className="muted">{t("ml.move")}</div><b className="mono">±{fmt(d?.forecast?.expectedMovePct)}%</b></div>
          </div>
          <p className="muted">
            {t("chain.support")} {fmt(d?.forecast?.next?.support)} · {t("chain.resist")} {fmt(d?.forecast?.next?.resistance)}
          </p>
        </div>
        <div className="card">
          <h3>⚠️ {t("ml.alerts")}</h3>
          {(d?.alerts || []).map((a) => (
            <div key={a.text} className={`ml-alert ${a.level}`}>{a.text}</div>
          ))}
        </div>
      </div>
      <p className="muted">{d?.disclaimer || t("ml.disclaimer")}</p>
    </div>
  );
}
